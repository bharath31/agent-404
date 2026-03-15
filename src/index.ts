import { Hono } from "hono";
import { cors } from "hono/cors";
import { PostgresStorage } from "./storage/postgres.js";
import { sites } from "./api/routes/sites.js";
import { register } from "./api/routes/register.js";
import { suggest } from "./api/routes/suggest.js";
import { apiKeyAuth } from "./api/middleware/auth.js";
import { rateLimiter } from "./api/middleware/rate-limit.js";
import { crawlSitemap } from "./engine/sitemap.js";
import { pruneStalePages } from "./engine/indexer.js";
import { buildEmbeddingText, generateBatchEmbeddings } from "./engine/embeddings.js";
import { landingPageHtml } from "./landing.js";
import { demoPageHtml } from "./demo.js";

export type Bindings = {
	DATABASE_URL: string;
	EMBEDDING_API_KEY?: string;
	CRON_SECRET?: string;
};

type Env = {
	Bindings: Bindings;
	Variables: { storage: PostgresStorage; siteId: string };
};

const app = new Hono<Env>();

// Global error handler — never leak internal details
app.onError((err, c) => {
	console.error("Unhandled error:", err.message);
	return c.json({ error: "Internal server error" }, 500);
});

// CORS — allow any origin for API routes (client script runs on customer sites)
// but restrict methods and headers
app.use(
	"*",
	cors({
		origin: (origin) => origin || "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "x-api-key", "Authorization"],
		maxAge: 86400,
	}),
);

// Security headers
app.use("*", async (c, next) => {
	await next();
	c.header("X-Content-Type-Options", "nosniff");
	c.header("X-Frame-Options", "DENY");
	c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

// Rate limiting
app.use("/api/sites", rateLimiter({ windowMs: 60_000, max: 10 }));
app.use("/api/register", rateLimiter({ windowMs: 60_000, max: 60 }));
app.use("/api/suggest", rateLimiter({ windowMs: 60_000, max: 60 }));

// Landing page
app.get("/", (c) => c.html(landingPageHtml));
app.get("/demo", (c) => c.html(demoPageHtml));

// Demo sitemap proxy — fetches & parses a domain's sitemap.xml for the live demo
// No auth needed, but rate-limited. Returns lightweight page list (URL + title).
app.use("/api/demo/sitemap", rateLimiter({ windowMs: 60_000, max: 15 }));
app.get("/api/demo/sitemap", async (c) => {
	const domain = c.req.query("domain");
	if (!domain || typeof domain !== "string" || domain.length > 253) {
		return c.json({ error: "domain query parameter is required" }, 400);
	}

	// Validate domain format (no protocol, no path)
	if (/[\/\s:@]/.test(domain)) {
		return c.json({ error: "Invalid domain" }, 400);
	}

	// Block private/internal hosts
	const blocked = [
		"localhost", "127.", "0.0.0.0", "10.",
		"172.16.", "172.17.", "172.18.", "172.19.",
		"172.20.", "172.21.", "172.22.", "172.23.",
		"172.24.", "172.25.", "172.26.", "172.27.",
		"172.28.", "172.29.", "172.30.", "172.31.",
		"192.168.", "169.254.", "[::1]", "[fc", "[fd",
	];
	const lower = domain.toLowerCase();
	if (blocked.some((b) => lower === b || lower.startsWith(b))) {
		return c.json({ error: "Invalid domain" }, 400);
	}

	const sitemapUrl = `https://${domain}/sitemap.xml`;
	const TIMEOUT_MS = 8_000;
	const MAX_URLS = 500;

	try {
		const pages = await fetchDemoSitemap(sitemapUrl, TIMEOUT_MS, MAX_URLS);
		return c.json({ domain, pages });
	} catch {
		return c.json({ domain, pages: [], error: "Could not fetch sitemap" });
	}
});

async function fetchDemoSitemap(
	url: string,
	timeoutMs: number,
	maxUrls: number,
): Promise<{ url: string; title: string }[]> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const resp = await fetch(url, {
			headers: { "User-Agent": "agent-404-bot/1.0 (demo)" },
			signal: controller.signal,
		});
		if (!resp.ok) return [];

		const xml = await resp.text();

		// Handle sitemap index — fetch first 3 child sitemaps
		if (xml.includes("<sitemapindex")) {
			const childLocs = extractDemoLocs(xml, "sitemap").slice(0, 3);
			const allPages: { url: string; title: string }[] = [];
			for (const childUrl of childLocs) {
				if (allPages.length >= maxUrls) break;
				const childPages = await fetchDemoSitemap(childUrl, timeoutMs, maxUrls - allPages.length);
				allPages.push(...childPages);
			}
			return allPages.slice(0, maxUrls);
		}

		return extractDemoLocs(xml, "url")
			.slice(0, maxUrls)
			.map((loc) => ({ url: loc, title: titleFromUrl(loc) }));
	} finally {
		clearTimeout(timeout);
	}
}

function extractDemoLocs(xml: string, parentTag: string): string[] {
	const urls: string[] = [];
	const regex = new RegExp(
		`<${parentTag}>[\\s\\S]*?<loc>([^<]+)<\\/loc>[\\s\\S]*?<\\/${parentTag}>`,
		"gi",
	);
	let match: RegExpExecArray | null;
	while ((match = regex.exec(xml)) !== null) {
		const loc = match[1].trim();
		if (loc.startsWith("https://")) urls.push(loc);
	}
	return urls;
}

function titleFromUrl(url: string): string {
	try {
		const path = new URL(url).pathname;
		const last = path.split("/").filter(Boolean).pop() || "";
		return last.replace(/[-_]/g, " ").replace(/\.\w+$/, "");
	} catch {
		return "";
	}
}

// Attach storage to context for API routes
app.use("/api/*", async (c, next) => {
	const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
	c.set("storage", new PostgresStorage(dbUrl));
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
	const cronSecret = c.env?.CRON_SECRET || process.env.CRON_SECRET;
	if (authHeader !== `Bearer ${cronSecret}`) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const storage = c.get("storage");
	const sql = storage.getSql();
	const { rows } = await sql`SELECT id, domain FROM sites`;

	const results = [];
	for (const row of rows) {
		const siteId = row.id as string;
		const domain = row.domain as string;
		const crawled = await crawlSitemap(domain, siteId, storage);
		const pruned = await pruneStalePages(storage, siteId, 30);

		// Backfill embeddings for pages missing them
		let backfilled = 0;
		const { rows: nullPages } = await sql`
			SELECT * FROM pages WHERE site_id = ${siteId} AND embedding IS NULL
		`;
		if (nullPages.length > 0) {
			const BATCH_SIZE = 100;
			for (let i = 0; i < nullPages.length; i += BATCH_SIZE) {
				const batch = nullPages.slice(i, i + BATCH_SIZE);
				const texts = batch.map((p) =>
					buildEmbeddingText({
						url: p.url as string,
						title: p.title as string,
						description: p.description as string,
					}),
				);
				const embeddings = await generateBatchEmbeddings(texts);
				for (let j = 0; j < batch.length; j++) {
					const emb = embeddings[j];
					if (emb && emb.every((v) => typeof v === "number" && Number.isFinite(v))) {
						const embStr = `[${emb.join(",")}]`;
						await sql.query(
							`UPDATE pages SET embedding = $1::vector WHERE id = $2`,
							[embStr, batch[j].id],
						);
						backfilled++;
					}
				}
			}
		}

		results.push({ domain, crawled, pruned, backfilled });
	}

	return c.json({ ok: true, results });
});

export default app;
