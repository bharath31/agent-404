import { Hono } from "hono";
import { cors } from "hono/cors";
import { PostgresStorage } from "./storage/postgres.js";
import { sites } from "./api/routes/sites.js";
import { register } from "./api/routes/register.js";
import { suggest } from "./api/routes/suggest.js";
import { apiKeyAuth } from "./api/middleware/auth.js";
import { crawlSitemap } from "./engine/sitemap.js";
import { pruneStalePages } from "./engine/indexer.js";

type Env = { Variables: { storage: PostgresStorage; siteId: string } };

const app = new Hono<Env>();

// Global middleware
app.use("*", cors({ origin: "*" }));

// Attach storage to context
app.use("*", async (c, next) => {
	c.set("storage", new PostgresStorage());
	await next();
});

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Public: register a site (no auth needed)
app.route("/api/sites", sites);

// Protected routes (require x-api-key)
app.use("/api/register", apiKeyAuth());
app.route("/api/register", register);

app.use("/api/suggest", apiKeyAuth());
app.route("/api/suggest", suggest);

// Cron: re-crawl sitemaps + prune stale pages
app.get("/api/cron", async (c) => {
	const authHeader = c.req.header("authorization");
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const storage = c.get("storage");
	const { sql } = await import("@vercel/postgres");
	const { rows } = await sql`SELECT id, domain FROM sites`;

	const results = [];
	for (const row of rows) {
		const siteId = row.id as string;
		const domain = row.domain as string;
		const crawled = await crawlSitemap(domain, siteId, storage);
		const pruned = await pruneStalePages(storage, siteId, 30);
		results.push({ domain, crawled, pruned });
	}

	return c.json({ ok: true, results });
});

export default app;
