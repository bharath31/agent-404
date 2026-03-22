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
import { analyze } from "./api/routes/analyze.js";
import { dashboardHtml } from "./dashboard.js";

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
app.use("/api/analyze", rateLimiter({ windowMs: 300_000, max: 2 }));

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
		const result = await discoverDemoPages(domain, deadPath);
		return c.json({
			domain,
			pages: result.pages,
			source: result.source,
			...(result.error ? { error: result.error } : {}),
		});
	} catch {
		return c.json({ domain, pages: [], source: "none", error: "Could not discover pages" });
	}
});

// ── Demo page discovery constants ──
const DEMO_FETCH_TIMEOUT_MS = 8_000;
const DEMO_PIPELINE_TIMEOUT_MS = 20_000;
const DEMO_MAX_URLS = 500;
const DEMO_MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB cap per response
const DEMO_MAX_DEPTH = 3;
const DEMO_MAX_CHILDREN = 8;
const DEMO_USER_AGENT =
	"Mozilla/5.0 (compatible; agent-404-bot/1.0; +https://agent-404.vercel.app)";

// Common sitemap paths to try (in order)
const SITEMAP_PATHS = [
	"/sitemap.xml",
	"/sitemap_index.xml",
	"/sitemap/sitemap.xml",
	"/sitemap/index.xml",
	"/wp-sitemap.xml",
	"/sitemap.txt",
];

type DemoPage = { url: string; title: string; description?: string };

type DiscoveryResult = {
	pages: DemoPage[];
	source: "llms.txt" | "sitemap" | "crawl" | "none";
	error?: string;
};

type FetchMeta = {
	text: string | null;
	status: number;
	finalUrl: string;
};

/**
 * Detect if a response indicates bot blocking.
 */
function detectBlockedResponse(status: number, body: string | null): string | null {
	if (status === 401) return "This site requires authentication and cannot be crawled publicly.";
	if (status === 429) return "This site is rate-limiting our requests. Try again later.";
	if (status === 403) {
		// Check for specific WAF markers in body
		if (body) {
			const lower = body.toLowerCase();
			if (
				lower.includes("cf-browser-verification") ||
				lower.includes("__cf_chl_") ||
				lower.includes("challenge-platform")
			) {
				return "This site is behind Cloudflare bot protection and requires browser verification.";
			}
			if (lower.includes("akamai") || lower.includes("ak_bmsc")) {
				return "This site is behind Akamai bot protection and blocks automated access.";
			}
		}
		return "This site returned 403 Forbidden — it likely blocks automated access.";
	}
	if (body) {
		const lower = body.toLowerCase();
		if (
			(lower.includes("access denied") || lower.includes("captcha")) &&
			lower.includes("<html") &&
			body.length < 10_000
		) {
			return "This site appears to block automated access (access denied / captcha detected).";
		}
	}
	return null;
}

/**
 * Fetch a URL and return text + metadata (status, final URL after redirects).
 */
async function fetchDemoResponse(url: string): Promise<FetchMeta> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DEMO_FETCH_TIMEOUT_MS);
	try {
		const resp = await fetch(url, {
			headers: {
				"User-Agent": DEMO_USER_AGENT,
				Accept: "text/plain, application/xml, text/xml, text/html, */*",
			},
			signal: controller.signal,
			redirect: "follow",
		});
		const finalUrl = resp.url || url;
		if (!resp.ok) {
			// Read a small portion of the body for bot-detection purposes
			const partialBody = await readBodyCapped(resp, 50_000);
			return { text: partialBody, status: resp.status, finalUrl };
		}
		const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);
		if (contentLength > DEMO_MAX_BODY_BYTES) {
			return { text: null, status: resp.status, finalUrl };
		}
		const text = await readBodyCapped(resp, DEMO_MAX_BODY_BYTES);
		return { text, status: resp.status, finalUrl };
	} catch {
		return { text: null, status: 0, finalUrl: url };
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Check if discovered pages are relevant to the dead URL's section.
 * Returns false if the dead URL has a clear path prefix (e.g., /docs/)
 * but none of the discovered pages share that prefix.
 * Uses prefix matching so "/work/" matches "/workers/".
 */
function hasRelevantPages(pages: DemoPage[], deadPath: string): boolean {
	const deadSegments = deadPath.split("/").filter(Boolean);
	if (deadSegments.length === 0) return pages.length > 0;
	const firstSeg = deadSegments[0].toLowerCase();
	if (firstSeg.length < 3) return pages.length > 0;
	return pages.some((p) => {
		try {
			const pageSegs = new URL(p.url).pathname.split("/").filter(Boolean);
			return pageSegs.some(
				(seg) => seg.toLowerCase().startsWith(firstSeg) || firstSeg.startsWith(seg.toLowerCase()),
			);
		} catch {
			return false;
		}
	});
}

/**
 * Main discovery pipeline with overall timeout.
 * Order: llms.txt → sitemap → HTML crawl fallback.
 * All steps race against a pipeline-level deadline so the user never waits forever.
 */
async function discoverDemoPages(
	domain: string,
	deadPath: string,
): Promise<DiscoveryResult> {
	const deadline = Date.now() + DEMO_PIPELINE_TIMEOUT_MS;
	let effectiveDomain = domain;
	let blockedReason: string | null = null;
	let llmsFallbackPages: DemoPage[] | null = null;

	// 1. Try llms.txt — curated page list with real titles and descriptions
	if (Date.now() < deadline) {
		const llmsResult = await fetchLlmsTxt(effectiveDomain, deadPath);
		if (llmsResult.pages.length > 0) {
			if (hasRelevantPages(llmsResult.pages, deadPath)) {
				return { pages: llmsResult.pages, source: "llms.txt" };
			}
			// Pages found but not relevant to the dead URL's section — save as fallback
			// and continue to sitemap/crawl for better results
			llmsFallbackPages = llmsResult.pages;
		}
		if (llmsResult.redirectDomain) effectiveDomain = llmsResult.redirectDomain;
		if (llmsResult.blocked) blockedReason = llmsResult.blocked;
	}

	// 2. Try sitemaps (robots.txt + path-prefix + common paths)
	if (Date.now() < deadline) {
		const sitemapUrls = await findSitemapUrls(effectiveDomain, deadPath);
		for (const sitemapUrl of sitemapUrls) {
			if (Date.now() >= deadline) break;
			const pages = await fetchDemoSitemap(sitemapUrl, deadPath, 0, effectiveDomain);
			if (pages.length > 0) return { pages, source: "sitemap" };
		}
	}

	// 3. Fallback: crawl HTML links
	let spaDetected = false;
	if (Date.now() < deadline) {
		const crawlResult = await crawlDemoLinks(effectiveDomain, deadPath);
		if (crawlResult.pages.length > 0 && !crawlResult.spaDetected) {
			return { pages: crawlResult.pages, source: "crawl" };
		}
		spaDetected = crawlResult.spaDetected;
		if (crawlResult.blocked) blockedReason = crawlResult.blocked;
	}

	// All methods failed — use llms.txt fallback if we had one (even for SPAs)
	if (llmsFallbackPages && llmsFallbackPages.length > 0) {
		return { pages: llmsFallbackPages, source: "llms.txt" };
	}

	// Return with best error
	if (spaDetected) {
		return {
			pages: [],
			source: "none",
			error:
				"This site appears to be a single-page application (SPA) that renders content with JavaScript. We can only discover pages from server-rendered HTML, sitemaps, or llms.txt.",
		};
	}
	if (blockedReason) {
		return { pages: [], source: "none", error: blockedReason };
	}
	return {
		pages: [],
		source: "none",
		error: `Could not discover pages on ${domain}. The site may have no sitemap, llms.txt, or discoverable links.`,
	};
}

// ── llms.txt discovery ──

type LlmsTxtResult = {
	pages: DemoPage[];
	redirectDomain?: string;
	blocked?: string;
};

/**
 * Fetch and parse llms.txt — a structured file listing a site's key pages.
 * Handles nested llms.txt (like Cloudflare) by following child llms.txt links.
 * When llms.txt has both real pages and child links, merges both.
 * Falls back to llms-full.txt if llms.txt yields nothing.
 */
async function fetchLlmsTxt(
	domain: string,
	deadPath: string,
): Promise<LlmsTxtResult> {
	let redirectDomain: string | undefined;
	let blocked: string | undefined;

	// Try llms.txt first
	const resp = await fetchDemoResponse(`https://${domain}/llms.txt`);

	// Check for cross-domain redirect
	if (resp.finalUrl) {
		try {
			const finalHost = new URL(resp.finalUrl).hostname;
			if (finalHost !== domain) redirectDomain = finalHost;
		} catch {}
	}

	// Check for bot blocking (check even when body exists — WAF markers are in HTML)
	if (resp.status > 0 && (resp.status >= 400 || !resp.text)) {
		const blockMsg = detectBlockedResponse(resp.status, resp.text);
		if (blockMsg) blocked = blockMsg;
	}

	const effectiveDomain = redirectDomain || domain;

	if (resp.text && resp.text.length >= 20) {
		const { pages, childLlmsTxtUrls } = parseLlmsTxt(resp.text, effectiveDomain);

		// Mixed llms.txt: merge direct pages with child pages
		if (pages.length > 0 && childLlmsTxtUrls.length > 0) {
			const childPages = await followChildLlmsTxt(childLlmsTxtUrls, effectiveDomain, deadPath);
			const seen = new Set(pages.map((p) => p.url));
			for (const cp of childPages) {
				if (!seen.has(cp.url) && pages.length < DEMO_MAX_URLS) {
					seen.add(cp.url);
					pages.push(cp);
				}
			}
			return { pages, redirectDomain };
		}

		if (pages.length > 0) return { pages, redirectDomain };
		if (childLlmsTxtUrls.length > 0) {
			const childPages = await followChildLlmsTxt(childLlmsTxtUrls, effectiveDomain, deadPath);
			if (childPages.length > 0) return { pages: childPages, redirectDomain };
		}
	}

	// Try path-prefix llms.txt (e.g., /docs/llms.txt for dead URL /docs/foo)
	const deadSegments = deadPath.split("/").filter(Boolean);
	for (let i = 1; i <= Math.min(deadSegments.length, 2); i++) {
		const prefix = "/" + deadSegments.slice(0, i).join("/");
		const prefixText = await fetchDemoText(`https://${effectiveDomain}${prefix}/llms.txt`);
		if (prefixText && prefixText.length >= 20) {
			const { pages } = parseLlmsTxt(prefixText, effectiveDomain);
			if (pages.length > 0) return { pages, redirectDomain };
		}
	}

	// Fallback: llms-full.txt (some sites only have this)
	const fullText = await fetchDemoText(`https://${effectiveDomain}/llms-full.txt`);
	if (fullText && fullText.length >= 20) {
		const { pages } = parseLlmsTxt(fullText, effectiveDomain);
		if (pages.length > 0) return { pages, redirectDomain };
	}

	return { pages: [], redirectDomain, blocked };
}

/**
 * Parse llms.txt content into pages and child llms.txt URLs.
 */
function parseLlmsTxt(
	text: string,
	domain: string,
): {
	pages: DemoPage[];
	childLlmsTxtUrls: { url: string; title: string }[];
} {
	const pages: DemoPage[] = [];
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

		// Separate child llms.txt / llms-full.txt links from actual pages
		if (url.endsWith("/llms.txt") || url.endsWith("/llms-full.txt")) {
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
): Promise<DemoPage[]> {
	const deadSegments = deadPath.toLowerCase().split("/").filter(Boolean);
	const scored = children.map((child) => {
		let score = 0;
		// Extract path segments from the child URL for matching
		let childPathSegs: string[] = [];
		try {
			childPathSegs = new URL(child.url).pathname.toLowerCase().split("/").filter(Boolean);
			// Remove trailing "llms.txt" from path segments
			if (childPathSegs.length > 0 && childPathSegs[childPathSegs.length - 1] === "llms.txt") {
				childPathSegs.pop();
			}
		} catch {}
		const childTitle = child.title.toLowerCase();

		for (const seg of deadSegments) {
			if (seg.length < 3) continue;
			// Prefix match on URL path segments (work → workers)
			// Prefer closer matches: "workers" over "workers-ai" for "work"
			let bestPathScore = 0;
			for (const cSeg of childPathSegs) {
				if (cSeg === seg) {
					bestPathScore = 5; // exact match
					break;
				}
				if (cSeg.startsWith(seg) || seg.startsWith(cSeg)) {
					// Closer length = higher score (3-4 range)
					const lenRatio = Math.min(seg.length, cSeg.length) / Math.max(seg.length, cSeg.length);
					bestPathScore = Math.max(bestPathScore, 3 + lenRatio);
				}
			}
			score += bestPathScore;
			// Prefix match on title words
			for (const word of childTitle.split(/\W+/)) {
				if (word.length >= 3 && (word.startsWith(seg) || seg.startsWith(word))) {
					score += 2;
					break;
				}
			}
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

// ── Sitemap discovery ──

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
	const deadSegments = deadPath.split("/").filter(Boolean);
	for (let i = 1; i <= Math.min(deadSegments.length, 2); i++) {
		const prefix = "/" + deadSegments.slice(0, i).join("/");
		addUrl(`https://${domain}${prefix}/sitemap.xml`);
		addUrl(`https://${domain}${prefix}/sitemap-0.xml`);
		addUrl(`https://${domain}${prefix}/sitemap.txt`);
	}

	// Add common root paths not already discovered
	for (const path of SITEMAP_PATHS) {
		addUrl(`https://${domain}${path}`);
	}

	return found;
}

// ── HTTP fetch helpers ──

/**
 * Fetch a URL and return text, or null on failure.
 * Caps response body at DEMO_MAX_BODY_BYTES to prevent OOM on huge files.
 */
async function fetchDemoText(url: string): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DEMO_FETCH_TIMEOUT_MS);
	try {
		const resp = await fetch(url, {
			headers: {
				"User-Agent": DEMO_USER_AGENT,
				Accept: "text/plain, application/xml, text/xml, text/html, */*",
			},
			signal: controller.signal,
			redirect: "follow",
		});
		if (!resp.ok) return null;

		// Check content-length before reading body
		const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);
		if (contentLength > DEMO_MAX_BODY_BYTES) return null;

		// Stream-read with size cap for responses without content-length
		return await readBodyCapped(resp, DEMO_MAX_BODY_BYTES);
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Read response body up to maxBytes. Returns null if body exceeds limit.
 */
async function readBodyCapped(resp: Response, maxBytes: number): Promise<string | null> {
	// If body is a ReadableStream, read in chunks with a cap
	if (resp.body && typeof resp.body.getReader === "function") {
		const reader = resp.body.getReader();
		const chunks: Uint8Array[] = [];
		let totalSize = 0;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				totalSize += value.byteLength;
				if (totalSize > maxBytes) {
					reader.cancel();
					return null;
				}
				chunks.push(value);
			}
		} catch {
			return null;
		}
		const decoder = new TextDecoder();
		return chunks.map((c) => decoder.decode(c, { stream: true })).join("") +
			decoder.decode();
	}
	// Fallback for environments without streaming
	const text = await resp.text();
	return text.length > maxBytes ? null : text;
}

/**
 * Fetch a URL expecting XML. Rejects HTML, empty, and oversized responses.
 */
async function fetchDemoSitemapXml(url: string): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DEMO_FETCH_TIMEOUT_MS);
	try {
		const resp = await fetch(url, {
			headers: {
				"User-Agent": DEMO_USER_AGENT,
				Accept: "application/xml, text/xml, */*;q=0.1",
			},
			signal: controller.signal,
			redirect: "follow",
		});
		if (!resp.ok) return null;
		const contentType = resp.headers.get("content-type") || "";
		if (contentType.includes("text/html")) return null;

		// Check content-length before reading
		const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);
		if (contentLength > DEMO_MAX_BODY_BYTES) return null;

		const text = await readBodyCapped(resp, DEMO_MAX_BODY_BYTES);
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

// ── Sitemap parsing ──

/** Check if a sitemap child URL has a generic name (sitemap-0.xml, etc.) */
const GENERIC_SITEMAP_RE = /\/sitemap[-_]?\d*\.xml$/i;

/**
 * Score a child sitemap URL by relevance to the dead URL path.
 */
function scoreChildSitemap(childUrl: string, deadPath: string): number {
	const childLower = childUrl.toLowerCase();
	const deadSegments = deadPath.toLowerCase().split("/").filter(Boolean);

	let score = 0;
	if (GENERIC_SITEMAP_RE.test(childLower)) score += 1;
	if (deadSegments.length === 0) return score;

	// Extract path segments from the child sitemap URL for prefix matching
	let childPathSegs: string[] = [];
	try {
		childPathSegs = new URL(childUrl).pathname.toLowerCase().split("/").filter(Boolean);
	} catch {}

	for (const seg of deadSegments) {
		if (seg.length < 3) continue;
		// Prefix match on path segments (avoids "work" matching "network")
		for (const cSeg of childPathSegs) {
			if (cSeg.startsWith(seg) || seg.startsWith(cSeg)) {
				score += 3;
				break;
			}
		}
	}

	return score;
}

/**
 * Parse a plain-text sitemap (one URL per line).
 */
function parsePlainTextSitemap(text: string, filterDomain?: string): DemoPage[] {
	const pages: DemoPage[] = [];
	const seen = new Set<string>();
	for (const line of text.split("\n")) {
		const url = line.trim();
		if (!url || !url.startsWith("https://")) continue;
		if (seen.has(url) || pages.length >= DEMO_MAX_URLS) continue;
		// Optionally filter to same domain
		if (filterDomain) {
			try {
				const h = new URL(url).hostname;
				if (h !== filterDomain && !h.endsWith("." + filterDomain)) continue;
			} catch {
				continue;
			}
		}
		seen.add(url);
		pages.push({ url, title: demoTitleFromUrl(url) });
	}
	return pages;
}

/**
 * Recursively fetch and parse sitemaps, prioritizing relevant children.
 * Supports XML sitemaps and plain-text sitemaps (one URL per line).
 */
async function fetchDemoSitemap(
	url: string,
	deadPath: string,
	depth: number,
	filterDomain?: string,
): Promise<DemoPage[]> {
	// Plain-text sitemaps: skip XML parsing entirely
	if (url.endsWith(".txt")) {
		const text = await fetchDemoText(url);
		if (text) {
			const pages = parsePlainTextSitemap(text, filterDomain);
			if (pages.length > 0) return pages;
		}
		return [];
	}

	const xml = await fetchDemoSitemapXml(url);
	if (!xml) return [];

	if (!xml.includes("<sitemapindex")) {
		const allLocs = extractDemoLocs(xml, "url");
		if (allLocs.length <= DEMO_MAX_URLS) {
			return allLocs.map((loc) => ({ url: loc, title: demoTitleFromUrl(loc) }));
		}
		// More URLs than our cap — prioritize URLs relevant to the dead path
		return prioritizeLocs(allLocs, deadPath)
			.map((loc) => ({ url: loc, title: demoTitleFromUrl(loc) }));
	}

	if (depth >= DEMO_MAX_DEPTH) return [];
	const childLocs = extractDemoLocs(xml, "sitemap");
	if (childLocs.length === 0) return [];

	const limit = childLocs.length <= 10 ? childLocs.length : DEMO_MAX_CHILDREN;
	const scored = childLocs.map((loc, i) => ({
		loc,
		score: scoreChildSitemap(loc, deadPath),
		idx: i,
	}));
	scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
	const topChildren = scored.slice(0, limit);

	const results = await Promise.all(
		topChildren.map((child) => fetchDemoSitemap(child.loc, deadPath, depth + 1, filterDomain)),
	);
	return results.flat().slice(0, DEMO_MAX_URLS);
}

// ── HTML crawl fallback ──

type CrawlResult = {
	pages: DemoPage[];
	spaDetected: boolean;
	blocked?: string;
};

/** SPA indicators: empty root divs with no server-rendered content */
const SPA_MARKERS = [
	'id="root"></div>',
	'id="app"></div>',
	'id="__next"></div>',
	'id="__nuxt"></div>',
];

/**
 * Crawl homepage + ancestor path pages, extract internal links.
 * Also follows one level of discovered links for broader coverage.
 * Detects SPAs and bot blocking.
 */
async function crawlDemoLinks(
	domain: string,
	deadPath: string,
): Promise<CrawlResult> {
	const baseUrl = `https://${domain}`;
	const seen = new Set<string>();
	const pages: DemoPage[] = [];
	let spaDetected = false;
	let blocked: string | undefined;

	// Seed pages: homepage + ancestor paths
	const seedPaths = ["/"];
	const deadSegments = deadPath.split("/").filter(Boolean);
	for (let i = 1; i <= Math.min(deadSegments.length, 3); i++) {
		seedPaths.push("/" + deadSegments.slice(0, i).join("/"));
	}

	for (const seedPath of seedPaths) {
		if (pages.length >= DEMO_MAX_URLS) break;
		const resp = await fetchDemoResponse(baseUrl + seedPath);

		// Check for bot blocking on homepage
		if (seedPath === "/" && (resp.status >= 400 || !resp.text)) {
			const blockMsg = detectBlockedResponse(resp.status, resp.text);
			if (blockMsg) blocked = blockMsg;
		}

		if (!resp.text || resp.status < 200 || resp.status >= 400) continue;
		const html = resp.text;

		const seedTitle = extractHtmlTitle(html);
		const seedUrl = baseUrl + seedPath;
		if (!seen.has(seedUrl)) {
			seen.add(seedUrl);
			pages.push({ url: seedUrl, title: seedTitle });
		}

		const links = extractInternalLinks(html, domain);

		// SPA detection: very few internal links + empty root container divs
		// Only triggers on truly empty shells, not SSR sites with hydration
		if (seedPath === "/" && links.length < 2) {
			const lowerHtml = html.toLowerCase();
			if (SPA_MARKERS.some((m) => lowerHtml.includes(m))) {
				spaDetected = true;
			}
		}

		for (const link of links) {
			if (seen.has(link.url) || pages.length >= DEMO_MAX_URLS) continue;
			seen.add(link.url);
			pages.push(link);
		}
	}

	// Second pass: follow top linked pages for more coverage (max 3 extra fetches)
	const extraSeeds = pages
		.filter((p) => {
			// Prefer links that share path segments with the dead URL
			const pPath = new URL(p.url).pathname.toLowerCase();
			return deadSegments.some((s) => s.length > 2 && pPath.includes(s));
		})
		.slice(0, 3);

	for (const seed of extraSeeds) {
		if (pages.length >= DEMO_MAX_URLS) break;
		const html = await fetchDemoText(seed.url);
		if (!html) continue;
		const links = extractInternalLinks(html, domain);
		for (const link of links) {
			if (seen.has(link.url) || pages.length >= DEMO_MAX_URLS) continue;
			seen.add(link.url);
			pages.push(link);
		}
	}

	return { pages, spaDetected, blocked };
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
): DemoPage[] {
	const links: DemoPage[] = [];
	const seen = new Set<string>();
	const regex = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([^<]*(?:<[^/a][^>]*>[^<]*)*)<\/a>/gi;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(html)) !== null) {
		let href = match[1].trim();
		const text = match[2].replace(/<[^>]+>/g, "").trim();

		if (href.startsWith("/")) {
			href = `https://${domain}${href}`;
		}

		try {
			const parsed = new URL(href);
			if (parsed.hostname !== domain && !parsed.hostname.endsWith("." + domain)) continue;
			if (parsed.protocol !== "https:") continue;
			const path = parsed.pathname;
			if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|tar|gz)$/i.test(path))
				continue;
			// Skip common non-page paths
			if (/^\/(api|cdn-cgi|_next|_nuxt|__)\//i.test(path)) continue;
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

// ── Shared utilities ──

/**
 * When a sitemap has more URLs than DEMO_MAX_URLS, prioritize URLs
 * that share path segments with the dead URL's path.
 */
function prioritizeLocs(locs: string[], deadPath: string): string[] {
	const deadSegments = deadPath.toLowerCase().split("/").filter((s) => s.length > 2);
	if (deadSegments.length === 0) return locs.slice(0, DEMO_MAX_URLS);

	const scored = locs.map((loc) => {
		const locLower = loc.toLowerCase();
		let score = 0;
		for (const seg of deadSegments) {
			if (locLower.includes(seg)) score += 1;
		}
		return { loc, score };
	});
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, DEMO_MAX_URLS).map((s) => s.loc);
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

app.use("/api/analyze", apiKeyAuth());
app.route("/api/analyze", analyze);

// Dashboard — server-rendered, authenticated via query param
app.get("/dashboard", async (c) => {
	const key = c.req.query("key");
	if (!key || typeof key !== "string") {
		return c.text("Missing API key. Use /dashboard?key=YOUR_API_KEY", 401);
	}

	const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
	const storage = new PostgresStorage(dbUrl);

	const site = await storage.getSiteByApiKey(key);
	if (!site) {
		return c.text("Invalid API key", 401);
	}

	const [stats, recentLogs, matchQuality] = await Promise.all([
		storage.getStats(site.id),
		storage.getSuggestionLogs(site.id, 20),
		storage.getMatchQualityStats(site.id),
	]);

	return c.html(
		dashboardHtml({
			domain: site.domain,
			pageCount: stats.pageCount,
			suggestionsServed: stats.suggestionsServed,
			recentLogs,
			matchQuality,
		}),
	);
});

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
