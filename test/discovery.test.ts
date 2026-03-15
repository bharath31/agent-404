import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../src/index.js";

// Helper to call the demo sitemap endpoint
async function discoverPages(domain: string, path = "") {
	let url = `/api/demo/sitemap?domain=${encodeURIComponent(domain)}`;
	if (path) url += `&path=${encodeURIComponent(path)}`;
	const res = await app.request(url, {
		headers: { "x-forwarded-for": `test-${Math.random()}` },
	});
	return res.json() as Promise<{
		domain: string;
		pages: { url: string; title: string; description?: string }[];
		source: string;
		error?: string;
	}>;
}

// ── Test data ──

const LLMS_TXT_WITH_PAGES = `# Example Docs

## Pages
- [Auth Guide](https://example.com/docs/auth): How to authenticate
- [Billing](https://example.com/docs/billing): Manage billing
- [Users](https://example.com/docs/users): User management
`;

const LLMS_TXT_CHILDREN_ONLY = `# Example Platform

## Documentation
- [Workers Docs](https://example.com/workers/llms.txt): Workers documentation
- [Pages Docs](https://example.com/pages/llms.txt): Pages documentation
- [R2 Docs](https://example.com/r2/llms.txt): R2 storage documentation
`;

const LLMS_TXT_MIXED = `# Example Mixed

## Overview
- [Getting Started](https://example.com/docs/start): Get started
- [API Reference](https://example.com/docs/api): API docs

## Product Docs
- [Workers](https://example.com/workers/llms.txt): Workers docs
`;

const CHILD_LLMS_TXT_WORKERS = `# Workers

## Pages
- [Worker API](https://example.com/workers/api): Worker API reference
- [Worker Config](https://example.com/workers/config): Configuration guide
`;

const LLMS_TXT_BLOG_ONLY = `# Example Blog

## Recent Posts
- [Launching v2](https://example.com/blog/launching-v2): We launched v2
- [Performance Tips](https://example.com/blog/perf-tips): Speed up your app
`;

const SIMPLE_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/docs/auth</loc></url>
  <url><loc>https://example.com/docs/billing</loc></url>
  <url><loc>https://example.com/docs/messaging</loc></url>
</urlset>`;

const PLAIN_TEXT_SITEMAP = `https://example.com/docs/auth
https://example.com/docs/billing
https://example.com/docs/users
`;

const HOMEPAGE_HTML = `<!DOCTYPE html>
<html><head><title>Example</title></head>
<body>
<nav>
  <a href="/docs">Docs</a>
  <a href="/blog">Blog</a>
  <a href="/about">About</a>
  <a href="/pricing">Pricing</a>
  <a href="/contact">Contact</a>
</nav>
</body></html>`;

const SPA_HTML = `<!DOCTYPE html>
<html><head><title>SPA App</title></head>
<body>
<div id="root"></div>
<script src="/bundle.js"></script>
</body></html>`;

const CLOUDFLARE_CHALLENGE = `<!DOCTYPE html>
<html><head><title>Just a moment...</title></head>
<body>
<div class="cf-browser-verification">
  <div id="__cf_chl_"></div>
</div>
</body></html>`;

// ── Mock helper ──

/**
 * Creates a fetch mock that matches URLs by substring and returns configured responses.
 * Uses a function-based matcher so multiple calls to the same URL each get a fresh Response.
 * Unmatched URLs return 404.
 */
function mockFetch(
	responses: Array<{
		match: string;
		status: number;
		body: string;
		headers?: Record<string, string>;
		url?: string; // Override resp.url (for redirect simulation)
	}>,
) {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
		const fetchUrl = typeof input === "string" ? input : input.url;

		for (const r of responses) {
			if (fetchUrl.includes(r.match)) {
				const resp = new Response(r.body, {
					status: r.status,
					headers: { "content-type": "text/plain", ...r.headers },
				});
				if (r.url) {
					Object.defineProperty(resp, "url", { value: r.url });
				}
				return resp;
			}
		}
		return new Response("Not Found", { status: 404 });
	});
}

// ── Tests ──

describe("Demo page discovery", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe("Input validation", () => {
		it("rejects missing domain", async () => {
			const res = await app.request("/api/demo/sitemap", {
				headers: { "x-forwarded-for": "val-1" },
			});
			expect(res.status).toBe(400);
		});

		it("rejects domains with slashes", async () => {
			const res = await app.request("/api/demo/sitemap?domain=example.com/foo", {
				headers: { "x-forwarded-for": "val-2" },
			});
			expect(res.status).toBe(400);
		});

		it("rejects private hosts", async () => {
			const res = await app.request("/api/demo/sitemap?domain=localhost", {
				headers: { "x-forwarded-for": "val-3" },
			});
			expect(res.status).toBe(400);
		});
	});

	describe("llms.txt discovery", () => {
		it("returns pages from llms.txt with source field", async () => {
			mockFetch([
				{ match: "example.com/llms.txt", status: 200, body: LLMS_TXT_WITH_PAGES },
			]);

			const data = await discoverPages("example.com", "/docs/foo");
			expect(data.source).toBe("llms.txt");
			expect(data.pages.length).toBe(3);
			expect(data.pages[0].url).toBe("https://example.com/docs/auth");
			expect(data.pages[0].title).toBe("Auth Guide");
			expect(data.error).toBeUndefined();
		});

		it("follows child llms.txt when root has only children", async () => {
			mockFetch([
				{ match: "example.com/llms.txt", status: 200, body: LLMS_TXT_CHILDREN_ONLY },
				{ match: "/workers/llms.txt", status: 200, body: CHILD_LLMS_TXT_WORKERS },
			]);

			const data = await discoverPages("example.com", "/workers/api");
			expect(data.source).toBe("llms.txt");
			expect(data.pages.some((p) => p.url.includes("/workers/api"))).toBe(true);
		});

		it("merges pages and children in mixed llms.txt", async () => {
			mockFetch([
				{ match: "example.com/llms.txt", status: 200, body: LLMS_TXT_MIXED },
				{ match: "/workers/llms.txt", status: 200, body: CHILD_LLMS_TXT_WORKERS },
			]);

			const data = await discoverPages("example.com", "/docs/start");
			expect(data.source).toBe("llms.txt");
			const urls = data.pages.map((p) => p.url);
			// Direct pages
			expect(urls).toContain("https://example.com/docs/start");
			expect(urls).toContain("https://example.com/docs/api");
			// Merged child pages
			expect(urls).toContain("https://example.com/workers/api");
			expect(urls).toContain("https://example.com/workers/config");
		});
	});

	describe("Relevance check — llms.txt fallthrough", () => {
		it("skips irrelevant llms.txt and falls through to sitemap", async () => {
			mockFetch([
				// Root llms.txt returns blog pages (not /docs/)
				{ match: "example.com/llms.txt", status: 200, body: LLMS_TXT_BLOG_ONLY },
				// Path-prefix sitemap has docs pages
				{ match: "/docs/sitemap.xml", status: 200, body: SIMPLE_SITEMAP },
			]);

			const data = await discoverPages("example.com", "/docs/message");
			expect(data.source).toBe("sitemap");
			expect(data.pages.some((p) => p.url.includes("/docs/messaging"))).toBe(true);
		});

		it("uses llms.txt fallback when sitemap and crawl also fail", async () => {
			mockFetch([
				// Root llms.txt returns blog pages (not /docs/)
				{ match: "example.com/llms.txt", status: 200, body: LLMS_TXT_BLOG_ONLY },
			]);

			const data = await discoverPages("example.com", "/docs/message");
			// Should fall back to the blog pages since nothing else worked
			expect(data.source).toBe("llms.txt");
			expect(data.pages.length).toBe(2);
		});
	});

	describe("Sitemap discovery", () => {
		it("parses XML sitemap and returns source", async () => {
			mockFetch([
				{ match: "sitemap.xml", status: 200, body: SIMPLE_SITEMAP },
			]);

			const data = await discoverPages("example.com", "/docs/foo");
			expect(data.source).toBe("sitemap");
			expect(data.pages.length).toBe(3);
		});

		it("parses plain-text sitemap (one URL per line)", async () => {
			mockFetch([
				{ match: "sitemap.txt", status: 200, body: PLAIN_TEXT_SITEMAP },
			]);

			const data = await discoverPages("example.com", "/docs/foo");
			expect(data.source).toBe("sitemap");
			expect(data.pages.length).toBe(3);
			expect(data.pages[0].url).toBe("https://example.com/docs/auth");
		});
	});

	describe("HTML crawl fallback", () => {
		it("crawls HTML links when llms.txt and sitemap fail", async () => {
			mockFetch([
				{ match: "https://example.com/", status: 200, body: HOMEPAGE_HTML },
			]);

			const data = await discoverPages("example.com");
			expect(data.source).toBe("crawl");
			expect(data.pages.length).toBeGreaterThan(0);
		});
	});

	describe("Bot-block detection", () => {
		it("detects Cloudflare challenge page", async () => {
			mockFetch([
				{ match: "example.com", status: 403, body: CLOUDFLARE_CHALLENGE },
			]);

			const data = await discoverPages("example.com", "/docs/foo");
			expect(data.pages).toHaveLength(0);
			expect(data.source).toBe("none");
			expect(data.error).toContain("Cloudflare");
		});

		it("detects 403 Forbidden", async () => {
			mockFetch([
				{ match: "example.com", status: 403, body: "Forbidden" },
			]);

			const data = await discoverPages("example.com", "/docs/foo");
			expect(data.pages).toHaveLength(0);
			expect(data.error).toContain("403");
		});

		it("detects 401 Unauthorized", async () => {
			mockFetch([
				{ match: "example.com", status: 401, body: "Unauthorized" },
			]);

			const data = await discoverPages("example.com", "/docs/foo");
			expect(data.pages).toHaveLength(0);
			expect(data.error).toContain("authentication");
		});

		it("detects 429 rate limiting", async () => {
			mockFetch([
				{ match: "example.com", status: 429, body: "Too Many Requests" },
			]);

			const data = await discoverPages("example.com", "/docs/foo");
			expect(data.pages).toHaveLength(0);
			expect(data.error).toContain("rate-limiting");
		});
	});

	describe("SPA detection", () => {
		it("detects SPA with empty root div and no links", async () => {
			mockFetch([
				{ match: "https://example.com/", status: 200, body: SPA_HTML },
			]);

			const data = await discoverPages("example.com");
			expect(data.source).toBe("none");
			expect(data.error).toContain("single-page application");
		});

		it("does not falsely detect SSR sites as SPAs", async () => {
			mockFetch([
				{ match: "https://example.com/", status: 200, body: HOMEPAGE_HTML },
			]);

			const data = await discoverPages("example.com");
			expect(data.source).toBe("crawl");
			expect(data.error).toBeUndefined();
		});
	});

	describe("Response structure", () => {
		it("always includes source field", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(
				new Response("Not Found", { status: 404 }),
			);

			const data = await discoverPages("example.com");
			expect(data.source).toBeDefined();
			expect(["llms.txt", "sitemap", "crawl", "none"]).toContain(data.source);
		});

		it("includes error field when discovery fails completely", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(
				new Response("Not Found", { status: 404 }),
			);

			const data = await discoverPages("example.com");
			expect(data.error).toBeDefined();
			expect(typeof data.error).toBe("string");
		});
	});

	describe("Cross-domain redirects", () => {
		it("follows redirect and uses effective domain for llms.txt parsing", async () => {
			const redirectedLlms = `# Stripe Docs
- [Payments](https://docs.stripe.example.com/payments): Payment guide
- [Checkout](https://docs.stripe.example.com/checkout): Checkout guide`;

			mockFetch([
				{
					match: "stripe.example.com/llms.txt",
					status: 200,
					body: redirectedLlms,
					url: "https://docs.stripe.example.com/llms.txt",
				},
			]);

			const data = await discoverPages("stripe.example.com", "/payments");
			expect(data.source).toBe("llms.txt");
			expect(data.pages.some((p) => p.url.includes("docs.stripe.example.com"))).toBe(true);
		});
	});
});
