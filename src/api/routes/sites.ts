import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { crawlSitemap } from "../../engine/sitemap.js";

type Env = { Variables: { storage: PostgresStorage; siteId: string } };

const sites = new Hono<Env>();

// Register a new site
sites.post("/", async (c) => {
	const body = await c.req.json<{ domain: string }>();
	if (!body.domain) {
		return c.json({ error: "domain is required" }, 400);
	}

	const domain = body.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

	// Validate domain format
	const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
	if (!domainRegex.test(domain) || domain.length > 253) {
		return c.json({ error: "Invalid domain format" }, 400);
	}

	const storage = c.get("storage");

	try {
		const site = await storage.createSite(domain);

		// Trigger sitemap crawl (best-effort, don't block response)
		crawlSitemap(domain, site.id, storage).catch(() => {});

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
		if (err?.message?.includes("unique") || err?.message?.includes("duplicate")) {
			return c.json({ error: "Domain already registered" }, 409);
		}
		console.error("Site registration error:", err.message);
		return c.json({ error: "Internal server error" }, 500);
	}
});

// Get site stats
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
