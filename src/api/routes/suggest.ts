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

/**
 * BAT-61 ("instrument agent recovery rate") is deliberately NOT implemented
 * here — deferred, not forced. What we'd want: of suggestions served, what
 * fraction led to one of the suggested URLs actually being fetched again
 * within ~60s, segmented by agent type (crawler vs browser-driving agent
 * vs human).
 *
 * There is no clean way to compute that from data this service already
 * has:
 *  - `pages.last_seen` (the only "was this URL fetched again" signal) is
 *    updated by the client script's browser beacon (requires JS execution —
 *    crawlers like GPTBot/ClaudeBot don't do this) or by sitemap re-crawls
 *    on a ~20h cron cadence — neither reflects an agent following a
 *    suggestion. Correlating a `suggestion_logs` row against `pages.last_seen`
 *    within a short window would mostly measure unrelated cron/beacon
 *    timing, not recovery, and would silently under-count exactly the
 *    non-rendering-crawler segment the ticket calls out as most important.
 *  - There's no request/session identifier linking a served 404 to the
 *    later request for the URL it suggested, so two different requests
 *    can't be tied together at all today.
 *
 * What's actually needed (tracked as follow-up, not built here): mint a
 * short-lived `recoveryId` per suggestion in this handler's response, and
 * give agents/adapters a way to round-trip it on the next request (e.g. a
 * query param or header on the suggested link, or a confirmation ping the
 * HTTP-layer adapters send when a previously-suggested URL is requested
 * again with 200). Only then is "fraction recovered within 60s" a real
 * measurement instead of a coincidence-counter. Segment by agent type via
 * User-Agent classification once that pipeline exists.
 */
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
