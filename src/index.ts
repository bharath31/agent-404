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

// Demo sitemap proxy — fetches & parses a domain's sitemap.xml for the live demo.
// Accepts the dead URL to prioritize the most relevant child sitemaps.
// No auth needed, but rate-limited. Returns lightweight page list (URL + title).
app.use("/api/demo/sitemap", rateLimiter({ windowMs: 60_000, max: 15 }));
app.get("/api/demo/sitemap", async (c) => {
	const domain = c.req.query("domain");
	const deadPath = c.req.query("path") || "";
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

	try {
		const pages = await discoverDemoPages(domain, deadPath);
		return c.json({ domain, pages, source: pages.length > 0 ? "sitemap" : "none" });
	} catch {
		return c.json({ domain, pages: [], error: "Could not discover pages" });
	}
});

// ── Demo page discovery constants ──
const DEMO_TIMEOUT_MS = 8_000;
const DEMO_MAX_URLS = 500;
const DEMO_MAX_DEPTH = 3;
const DEMO_MAX_CHILDREN = 8;
const DEMO_USER_AGENT = "agent-404-bot/1.0 (demo)";

// Common sitemap paths to try (in order)
const SITEMAP_PATHS = [
	"/sitemap.xml",
	"/sitemap_index.xml",
	"/sitemap/sitemap.xml",
	"/sitemap/index.xml",
	"/wp-sitemap.xml",
];

/**
 * Main discovery pipeline: llms.txt → sitemap → HTML crawl fallback.
 */
async function discoverDemoPages(
	domain: string,
	deadPath: string,
): Promise<{ url: string; title: string; description?: string }[]> {
	// 1. Try llms.txt — curated page list with real titles and descriptions
	const llmsPages = await fetchLlmsTxt(domain, deadPath);
	if (llmsPages.length > 0) return llmsPages;

	// 2. Try sitemaps (from robots.txt + common paths + path-prefix sitemaps)
	const sitemapUrls = await findSitemapUrls(domain, deadPath);
	for (const sitemapUrl of sitemapUrls) {
		const pages = await fetchDemoSitemap(sitemapUrl, deadPath, 0);
		if (pages.length > 0) return pages;
	}

	// 3. Fallback: crawl HTML links from the homepage and nearby pages
	return await crawlDemoLinks(domain, deadPath);
}

/**
 * Fetch and parse llms.txt — a structured file listing a site's key pages.
 * Handles nested llms.txt (like Cloudflare) by following child llms.txt links
 * that are relevant to the dead URL path.
 */
async function fetchLlmsTxt(
	domain: string,
	deadPath: string,
): Promise<{ url: string; title: string; description: string }[]> {
	const text = await fetchDemoText(`https://${domain}/llms.txt`);
	if (!text || text.length < 20) return [];

	const { pages, childLlmsTxtUrls } = parseLlmsTxt(text, domain);

	// If we got real pages, return them
	if (pages.length > 0) return pages;

	// If no pages but found child llms.txt links (e.g., Cloudflare), follow relevant ones
	if (childLlmsTxtUrls.length > 0) {
		return await followChildLlmsTxt(childLlmsTxtUrls, domain, deadPath);
	}

	return [];
}

/**
 * Parse llms.txt content into pages and child llms.txt URLs.
 */
function parseLlmsTxt(
	text: string,
	domain: string,
): {
	pages: { url: string; title: string; description: string }[];
	childLlmsTxtUrls: { url: string; title: string }[];
} {
	const pages: { url: string; title: string; description: string }[] = [];
	const childLlmsTxtUrls: { url: string; title: string }[] = [];
	const seen = new Set<string>();

	// Match markdown links: [Title](URL): Description  or  [Title](URL)
	const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)(?:\s*:\s*(.+))?/g;
	let match: RegExpExecArray | null;
	while ((match = linkRegex.exec(text)) !== null) {
		const title = match[1].trim();
		let url = match[2].trim();
		const description = match[3]?.trim() || "";

		// Only keep same-domain links
		try {
			const parsed = new URL(url);
			if (parsed.hostname !== domain && !parsed.hostname.endsWith("." + domain)) continue;
		} catch {
			continue;
		}

		// Separate child llms.txt links from actual pages
		if (url.endsWith("/llms.txt")) {
			if (!seen.has(url)) {
				seen.add(url);
				childLlmsTxtUrls.push({ url, title });
			}
			continue;
		}

		// Normalize .md and /index.md extensions
		url = url.replace(/\/index\.md$/, "/").replace(/\.md$/, "");

		if (seen.has(url) || pages.length >= DEMO_MAX_URLS) continue;
		seen.add(url);
		pages.push({ url, title, description });
	}

	return { pages, childLlmsTxtUrls };
}

/**
 * Follow child llms.txt links, prioritizing ones relevant to the dead URL.
 */
async function followChildLlmsTxt(
	children: { url: string; title: string }[],
	domain: string,
	deadPath: string,
): Promise<{ url: string; title: string; description: string }[]> {
	// Score children by relevance to the dead URL path
	const deadSegments = deadPath.toLowerCase().split("/").filter(Boolean);
	const scored = children.map((child) => {
		let score = 0;
		const childLower = child.url.toLowerCase() + " " + child.title.toLowerCase();
		for (const seg of deadSegments) {
			if (seg.length > 2 && childLower.includes(seg)) score += 2;
		}
		return { ...child, score };
	});
	scored.sort((a, b) => b.score - a.score);

	// Fetch top 3 most relevant child llms.txt files in parallel
	const topChildren = scored.slice(0, 3);
	const results = await Promise.all(
		topChildren.map(async (child) => {
			const text = await fetchDemoText(child.url);
			if (!text) return [];
			const { pages } = parseLlmsTxt(text, domain);
			return pages;
		}),
	);

	return results.flat().slice(0, DEMO_MAX_URLS);
}

/**
 * Find sitemap URLs by checking robots.txt, path-prefix sitemaps, and common paths.
 */
async function findSitemapUrls(domain: string, deadPath: string): Promise<string[]> {
	const found: string[] = [];
	const seen = new Set<string>();

	const addUrl = (url: string) => {
		if (url.startsWith("https://") && !seen.has(url)) {
			seen.add(url);
			found.push(url);
		}
	};

	// Check robots.txt for Sitemap directives
	const robotsTxt = await fetchDemoText(`https://${domain}/robots.txt`);
	if (robotsTxt) {
		const sitemapRegex = /^Sitemap:\s*(\S+)/gim;
		let match: RegExpExecArray | null;
		while ((match = sitemapRegex.exec(robotsTxt)) !== null) {
			addUrl(match[1].trim());
		}
	}

	// Try path-prefix sitemaps based on the dead URL
	// e.g., dead path /docs/messaging → try /docs/sitemap.xml
	const deadSegments = deadPath.split("/").filter(Boolean);
	for (let i = 1; i <= Math.min(deadSegments.length, 2); i++) {
		const prefix = "/" + deadSegments.slice(0, i).join("/");
		addUrl(`https://${domain}${prefix}/sitemap.xml`);
		addUrl(`https://${domain}${prefix}/sitemap-0.xml`);
	}

	// Add common root paths not already discovered
	for (const path of SITEMAP_PATHS) {
		addUrl(`https://${domain}${path}`);
	}

	return found;
}

/**
 * Fetch a URL and return text, or null on failure.
 */
async function fetchDemoText(url: string): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DEMO_TIMEOUT_MS);
	try {
		const resp = await fetch(url, {
			headers: { "User-Agent": DEMO_USER_AGENT },
			signal: controller.signal,
			redirect: "follow",
		});
		if (!resp.ok) return null;
		return await resp.text();
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Fetch a URL expecting XML. Rejects HTML and empty responses.
 */
async function fetchDemoSitemapXml(url: string): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DEMO_TIMEOUT_MS);
	try {
		const resp = await fetch(url, {
			headers: { "User-Agent": DEMO_USER_AGENT },
			signal: controller.signal,
			redirect: "follow",
		});
		if (!resp.ok) return null;
		const contentType = resp.headers.get("content-type") || "";
		if (contentType.includes("text/html")) return null;
		const text = await resp.text();
		// Reject empty responses (some sites return 200 with no body)
		if (!text || text.trim().length === 0) return null;
		// Reject HTML disguised with XML content-type
		const trimmed = text.trimStart();
		if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) return null;
		return text;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

/** Check if a sitemap child URL has a generic name (sitemap-0.xml, etc.) */
const GENERIC_SITEMAP_RE = /\/sitemap[-_]?\d*\.xml$/i;

/**
 * Score a child sitemap URL by relevance to the dead URL path.
 * Generic names (sitemap-0.xml) get a baseline score so they aren't ignored.
 */
function scoreChildSitemap(childUrl: string, deadPath: string): number {
	const childLower = childUrl.toLowerCase();
	const deadSegments = deadPath.toLowerCase().split("/").filter(Boolean);

	let score = 0;

	// Generic sitemap names get a baseline — they often contain the "main" pages
	if (GENERIC_SITEMAP_RE.test(childLower)) score += 1;

	if (deadSegments.length === 0) return score;

	// Bonus for each dead URL segment that appears in the child sitemap URL
	for (const seg of deadSegments) {
		if (seg.length > 2 && childLower.includes(seg)) score += 2;
	}
	// Bonus for path prefix match (e.g., dead=/docs/start → child contains /docs/)
	const deadPrefix = "/" + deadSegments[0] + "/";
	if (childLower.includes(deadPrefix)) score += 3;

	return score;
}

/**
 * Recursively fetch and parse sitemaps, prioritizing relevant children.
 */
async function fetchDemoSitemap(
	url: string,
	deadPath: string,
	depth: number,
): Promise<{ url: string; title: string }[]> {
	const xml = await fetchDemoSitemapXml(url);
	if (!xml) return [];

	// Regular sitemap — extract URLs directly
	if (!xml.includes("<sitemapindex")) {
		return extractDemoLocs(xml, "url")
			.slice(0, DEMO_MAX_URLS)
			.map((loc) => ({ url: loc, title: demoTitleFromUrl(loc) }));
	}

	// Sitemap index — prioritize children by relevance
	if (depth >= DEMO_MAX_DEPTH) return [];
	const childLocs = extractDemoLocs(xml, "sitemap");
	if (childLocs.length === 0) return [];

	// For small indexes, fetch all children; for large ones, pick the best
	const limit = childLocs.length <= 10 ? childLocs.length : DEMO_MAX_CHILDREN;

	const scored = childLocs.map((loc, i) => ({
		loc,
		score: scoreChildSitemap(loc, deadPath),
		idx: i,
	}));
	scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
	const topChildren = scored.slice(0, limit);

	const results = await Promise.all(
		topChildren.map((child) => fetchDemoSitemap(child.loc, deadPath, depth + 1)),
	);
	return results.flat().slice(0, DEMO_MAX_URLS);
}

/**
 * HTML crawl fallback: fetch homepage + a few relevant pages, extract internal links.
 */
async function crawlDemoLinks(
	domain: string,
	deadPath: string,
): Promise<{ url: string; title: string }[]> {
	const baseUrl = `https://${domain}`;
	const seen = new Set<string>();
	const pages: { url: string; title: string }[] = [];

	// Seed pages to crawl: homepage + path prefix pages
	const seedPaths = ["/"];
	const deadSegments = deadPath.split("/").filter(Boolean);
	// Add ancestor paths (e.g., /docs/guides/start → try /docs, /docs/guides)
	for (let i = 1; i <= Math.min(deadSegments.length, 3); i++) {
		seedPaths.push("/" + deadSegments.slice(0, i).join("/"));
	}

	for (const seedPath of seedPaths) {
		if (pages.length >= DEMO_MAX_URLS) break;
		const html = await fetchDemoText(baseUrl + seedPath);
		if (!html) continue;

		// Extract page title
		const seedTitle = extractHtmlTitle(html);
		const seedUrl = baseUrl + seedPath;
		if (!seen.has(seedUrl)) {
			seen.add(seedUrl);
			pages.push({ url: seedUrl, title: seedTitle });
		}

		// Extract all internal links
		const links = extractInternalLinks(html, domain);
		for (const link of links) {
			if (seen.has(link.url) || pages.length >= DEMO_MAX_URLS) continue;
			seen.add(link.url);
			pages.push(link);
		}
	}

	return pages;
}

/**
 * Extract <title> from HTML.
 */
function extractHtmlTitle(html: string): string {
	const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
	return match ? match[1].trim() : "";
}

/**
 * Extract internal links with their anchor text from HTML.
 */
function extractInternalLinks(
	html: string,
	domain: string,
): { url: string; title: string }[] {
	const links: { url: string; title: string }[] = [];
	const seen = new Set<string>();
	// Match <a> tags, capture href and inner text
	const regex = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([^<]*(?:<[^/a][^>]*>[^<]*)*)<\/a>/gi;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(html)) !== null) {
		let href = match[1].trim();
		const text = match[2].replace(/<[^>]+>/g, "").trim();

		// Resolve relative URLs
		if (href.startsWith("/")) {
			href = `https://${domain}${href}`;
		}

		// Only keep same-domain HTTPS links
		try {
			const parsed = new URL(href);
			if (parsed.hostname !== domain && !parsed.hostname.endsWith("." + domain)) continue;
			if (parsed.protocol !== "https:") continue;
			// Skip anchors, query-only, assets, and common non-page paths
			const path = parsed.pathname;
			if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|pdf|zip)$/i.test(path)) continue;
			const canonical = parsed.origin + path.replace(/\/+$/, "");
			if (seen.has(canonical)) continue;
			seen.add(canonical);
			links.push({ url: canonical, title: text || demoTitleFromUrl(canonical) });
		} catch {
			continue;
		}
	}
	return links;
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

function demoTitleFromUrl(url: string): string {
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
