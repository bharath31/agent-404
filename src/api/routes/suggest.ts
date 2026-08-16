import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { findSuggestions } from "../../engine/matcher.js";
import { generateDeadUrlEmbedding } from "../../engine/embeddings.js";
import { getCachedSuggest, setCachedSuggest } from "../../engine/suggest-cache.js";
import { normalizeDeadUrl, pathHint } from "../../engine/url-normalize.js";
import { buildJsonLd, buildLinkHeader } from "../../../adapters/core.js";

type Env = { Variables: { storage: PostgresStorage; siteId: string } };

const suggest = new Hono<Env>();

// Get suggestions for a dead URL
suggest.post("/", async (c) => {
	const siteId = c.get("siteId");
	const storage = c.get("storage");

	const body = await c.req.json<{ url: string }>();
	if (!body.url || typeof body.url !== "string") {
		return c.json({ error: "url is required" }, 400);
	}
	if (body.url.length > 2048) {
		return c.json({ error: "url too long" }, 400);
	}

	const deadUrl = normalizeDeadUrl(body.url);
	const cached = getCachedSuggest(siteId, deadUrl);
	if (cached) {
		logSuggestionsServed(storage, siteId, deadUrl, cached);
		return suggestJson(c, cached);
	}

	// Generate embedding for the dead URL
	const deadUrlEmbedding = await generateDeadUrlEmbedding(deadUrl);

	// Use vector pre-filter if embedding available, otherwise a bounded lexical scan
	let pages;
	if (deadUrlEmbedding) {
		pages = await storage.searchByEmbedding(siteId, deadUrlEmbedding, 20);
	} else {
		pages = await storage.getPages(siteId, { limit: 500, pathHint: pathHint(deadUrl) });
		if (pages.length < 5) {
			pages = await storage.getPages(siteId, { limit: 500 });
		}
	}

	const suggestions = findSuggestions(deadUrl, pages, deadUrlEmbedding);

	const payload = {
		deadUrl,
		suggestions,
		jsonLd: buildJsonLd(suggestions),
	};
	logSuggestionsServed(storage, siteId, deadUrl, payload);
	setCachedSuggest(siteId, deadUrl, payload);
	return suggestJson(c, payload);
});

function suggestJson(
	c: { header: (name: string, value: string) => void; json: (body: unknown) => Response },
	payload: unknown,
): Response {
	const suggestions = (
		payload as { suggestions?: Array<{ url: string; title: string; matchType: string }> }
	).suggestions;
	c.header("Vary", "Accept");
	if (suggestions && suggestions.length > 0) {
		try {
			c.header("Link", buildLinkHeader(suggestions));
		} catch {
			// Invalid header values must not turn suggest into a 500.
		}
	}
	return c.json(payload);
}

function logSuggestionsServed(
	storage: PostgresStorage,
	siteId: string,
	deadUrl: string,
	payload: unknown,
): void {
	const suggestions = (payload as { suggestions?: Array<{ url: string; score: number; matchType: string }> })
		.suggestions;
	if (!suggestions?.length) return;
	const scores = JSON.stringify(suggestions.map((s) => s.score));
	const matchTypes = JSON.stringify(suggestions.map((s) => s.matchType));
	storage
		.recordSuggestionServed(
			siteId,
			deadUrl,
			suggestions.map((s) => s.url),
			scores,
			matchTypes,
		)
		.catch(() => {});
}

export { suggest };
