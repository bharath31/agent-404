import { Hono } from "hono";
import type { Context } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { findSuggestions } from "../../engine/matcher.js";
import { generateDeadUrlEmbedding } from "../../engine/embeddings.js";
import { getCachedSuggest, setCachedSuggest } from "../../engine/suggest-cache.js";
import { normalizeDeadUrl, pathHint } from "../../engine/url-normalize.js";
import { buildJsonLd, buildLinkHeader } from "../../../adapters/core.js";
import { recordSuggestionServedEvent } from "../../lib/recovery-tracker.js";

type Env = { Variables: { storage: PostgresStorage; siteId: string } };

const suggest = new Hono<Env>();

async function generateAndLogSuggestions(
	storage: PostgresStorage,
	siteId: string,
	rawUrl: string,
	userAgent?: string,
) {
	const deadUrl = normalizeDeadUrl(rawUrl);
	const cached = getCachedSuggest(siteId, deadUrl);
	if (cached) {
		logSuggestionsServed(storage, siteId, deadUrl, cached, userAgent);
		return cached;
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
	logSuggestionsServed(storage, siteId, deadUrl, payload, userAgent);
	setCachedSuggest(siteId, deadUrl, payload);
	return payload;
}

// GET /api/suggest?url=... (Edge CDN cacheable)
suggest.get("/", async (c) => {
	const siteId = c.get("siteId");
	const storage = c.get("storage");
	const userAgent = c.req.header("user-agent");

	const url = c.req.query("url");
	if (!url || typeof url !== "string") {
		return c.json({ error: "url query parameter is required" }, 400);
	}
	if (url.length > 2048) {
		return c.json({ error: "url too long" }, 400);
	}

	const payload = await generateAndLogSuggestions(storage, siteId, url, userAgent);
	return suggestResponse(c, payload, true);
});

// POST /api/suggest (JSON body)
suggest.post("/", async (c) => {
	const siteId = c.get("siteId");
	const storage = c.get("storage");
	const userAgent = c.req.header("user-agent");

	const body = await c.req.json<{ url: string }>().catch(() => ({ url: "" }));
	if (!body.url || typeof body.url !== "string") {
		return c.json({ error: "url is required" }, 400);
	}
	if (body.url.length > 2048) {
		return c.json({ error: "url too long" }, 400);
	}

	const payload = await generateAndLogSuggestions(storage, siteId, body.url, userAgent);
	return suggestResponse(c, payload, false);
});

function suggestResponse(
	c: Context,
	payload: unknown,
	isGet: boolean,
): Response {
	const suggestions = (
		payload as { suggestions?: Array<{ url: string; title: string; matchType: string }> }
	).suggestions;

	c.header("Vary", "Accept, Origin, x-api-key");
	if (isGet) {
		c.header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=60");
	} else {
		c.header("Cache-Control", "private, no-cache");
	}

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
	userAgent?: string,
): void {
	const suggestions = (payload as { suggestions?: Array<{ url: string; score: number; matchType: string }> })
		.suggestions;
	if (!suggestions?.length) return;
	const suggestedUrls = suggestions.map((s) => s.url);
	const scores = JSON.stringify(suggestions.map((s) => s.score));
	const matchTypes = JSON.stringify(suggestions.map((s) => s.matchType));

	try {
		recordSuggestionServedEvent(siteId, deadUrl, suggestedUrls, userAgent);
	} catch {
		// Telemetry must never turn a working suggest response into a 500.
	}

	storage
		.recordSuggestionServed(
			siteId,
			deadUrl,
			suggestedUrls,
			scores,
			matchTypes,
		)
		.catch(() => {});
}

export { suggest };
