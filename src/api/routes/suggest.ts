import { Hono } from "hono";
import type { D1Storage } from "../../storage/d1.js";
import { findSuggestions } from "../../engine/matcher.js";

type Env = { Bindings: { DB: D1Database }; Variables: { storage: D1Storage; siteId: string } };

const suggest = new Hono<Env>();

// Get suggestions for a dead URL
suggest.post("/", async (c) => {
	const siteId = c.get("siteId");
	const storage = c.get("storage");

	const body = await c.req.json<{ url: string }>();
	if (!body.url) {
		return c.json({ error: "url is required" }, 400);
	}

	const pages = await storage.getPages(siteId);
	const suggestions = findSuggestions(body.url, pages);

	// Log the suggestion served (non-blocking)
	if (suggestions.length > 0) {
		const logPromise = storage.recordSuggestionServed(
			siteId,
			body.url,
			suggestions.map((s) => s.url),
		);
		try {
			c.executionCtx.waitUntil(logPromise);
		} catch {
			await logPromise;
		}
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
