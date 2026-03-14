import { Hono } from "hono";
import type { D1Storage } from "../../storage/d1.js";
import { crawlSitemap } from "../../engine/sitemap.js";

type Env = { Bindings: { DB: D1Database }; Variables: { storage: D1Storage; siteId: string } };

const sites = new Hono<Env>();

// Register a new site
sites.post("/", async (c) => {
	const body = await c.req.json<{ domain: string }>();
	if (!body.domain) {
		return c.json({ error: "domain is required" }, 400);
	}

	const domain = body.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
	const storage = c.get("storage");

	try {
		const site = await storage.createSite(domain);

		// Trigger sitemap crawl in background (non-blocking)
		try {
			c.executionCtx.waitUntil(crawlSitemap(domain, site.id, storage));
		} catch {
			// executionCtx may not be available in test environments
		}

		return c.json(
			{
				id: site.id,
				domain: site.domain,
				apiKey: site.apiKey,
				createdAt: site.createdAt,
			},
			201,
		);
	} catch (err: any) {
		if (err?.message?.includes("UNIQUE constraint failed")) {
			return c.json({ error: "Domain already registered" }, 409);
		}
		throw err;
	}
});

// Get site stats (requires auth)
sites.get("/:id/stats", async (c) => {
	const id = c.req.param("id");
	const storage = c.get("storage");

	const site = await storage.getSite(id);
	if (!site) {
		return c.json({ error: "Site not found" }, 404);
	}

	const stats = await storage.getStats(id);
	return c.json({ siteId: id, domain: site.domain, ...stats });
});

export { sites };
