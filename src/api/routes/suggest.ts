import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { findSuggestions } from "../../engine/matcher.js";
import { generateDeadUrlEmbedding } from "../../engine/embeddings.js";

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

	// Generate embedding for the dead URL
	const deadUrlEmbedding = await generateDeadUrlEmbedding(body.url);

	// Use vector pre-filter if embedding available, otherwise fall back to full scan
	let pages;
	if (deadUrlEmbedding) {
		pages = await storage.searchByEmbedding(siteId, deadUrlEmbedding, 20);
	} else {
		pages = await storage.getPages(siteId);
	}

	const suggestions = findSuggestions(body.url, pages, deadUrlEmbedding);

	// Log asynchronously (include scores + match types for dashboard)
	if (suggestions.length > 0) {
		const scores = JSON.stringify(suggestions.map((s) => s.score));
		const matchTypes = JSON.stringify(suggestions.map((s) => s.matchType));
		storage
			.recordSuggestionServed(
				siteId,
				body.url,
				suggestions.map((s) => s.url),
				scores,
				matchTypes,
			)
			.catch(() => {});
	}

	return c.json({
		deadUrl: body.url,
		suggestions,
		jsonLd: buildJsonLd(suggestions),
	});
});

function buildJsonLd(suggestions: { url: string; title: string; matchType: string }[]) {
	return {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: "Page Not Found",
		mainEntity: {
			"@type": "ItemList",
			itemListElement: suggestions.map((s, i) => ({
				"@type": "ListItem",
				position: i + 1,
				url: s.url,
				name: s.title || s.url,
				description: s.matchType,
			})),
		},
	};
}

export { suggest };
