import { Hono } from "hono";
import { cors } from "hono/cors";
import { D1Storage } from "./storage/d1.js";
import { sites } from "./api/routes/sites.js";
import { register } from "./api/routes/register.js";
import { suggest } from "./api/routes/suggest.js";
import { apiKeyAuth } from "./api/middleware/auth.js";
import { crawlSitemap } from "./engine/sitemap.js";
import { pruneStalePages } from "./engine/indexer.js";

type Env = { Bindings: { DB: D1Database }; Variables: { storage: D1Storage; siteId: string } };

const app = new Hono<Env>();

// Global middleware
app.use("*", cors({ origin: "*" }));

// Attach storage to context
app.use("*", async (c, next) => {
	const storage = new D1Storage(c.env.DB);
	c.set("storage", storage);
	await next();
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Public: register a site (no auth needed)
app.route("/api/sites", sites);

// Protected routes (require x-api-key)
app.use("/api/register", apiKeyAuth());
app.route("/api/register", register);

app.use("/api/suggest", apiKeyAuth());
app.route("/api/suggest", suggest);

export default {
	fetch: app.fetch,

	// Cron: re-crawl sitemaps + prune stale pages
	async scheduled(event: ScheduledEvent, env: { DB: D1Database }, ctx: ExecutionContext) {
		const storage = new D1Storage(env.DB);
		const { results } = await env.DB.prepare("SELECT id, domain FROM sites").all();

		for (const row of results || []) {
			const siteId = row.id as string;
			const domain = row.domain as string;
			ctx.waitUntil(crawlSitemap(domain, siteId, storage));
			ctx.waitUntil(pruneStalePages(storage, siteId, 30));
		}
	},
};
