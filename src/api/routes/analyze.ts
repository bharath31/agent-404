import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { analyzeSite } from "../../engine/analyzer.js";

type Env = { Variables: { storage: PostgresStorage; siteId: string } };

const analyze = new Hono<Env>();

// Analyze a site for broken internal links and orphan pages
analyze.post("/", async (c) => {
	const siteId = c.get("siteId");
	const storage = c.get("storage");

	const site = await storage.getSite(siteId);
	if (!site) {
		return c.json({ error: "Site not found" }, 404);
	}

	const pages = await storage.getPages(siteId);
	if (pages.length === 0) {
		return c.json({ error: "No pages indexed for this site" }, 400);
	}

	const report = await analyzeSite(
		pages.map((p) => ({ url: p.url, title: p.title })),
		site.domain,
	);

	return c.json(report);
});

export { analyze };
