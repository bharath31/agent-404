import { describe, it, expect, vi, beforeEach } from "vitest";
import { crawlSitemap } from "../src/engine/sitemap.js";
import type { StorageAdapter } from "../src/storage/interface.js";

const SIMPLE_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/docs/auth</loc></url>
  <url><loc>https://example.com/docs/billing</loc></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`;

const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-docs.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-blog.xml</loc></sitemap>
</sitemapindex>`;

const CHILD_SITEMAP_DOCS = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/docs/getting-started</loc></url>
</urlset>`;

const CHILD_SITEMAP_BLOG = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/blog/hello</loc></url>
</urlset>`;

function createMockStorage(): StorageAdapter {
	return {
		createSite: vi.fn(),
		getSite: vi.fn(),
		getSiteByApiKey: vi.fn(),
		upsertPage: vi.fn(),
		upsertPages: vi.fn().mockResolvedValue(undefined),
		getPages: vi.fn(),
		searchByEmbedding: vi.fn(),
		deleteStalePagesOlderThan: vi.fn(),
		recordSuggestionServed: vi.fn(),
		getStats: vi.fn(),
	};
}

describe("crawlSitemap", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should crawl a simple sitemap and upsert pages", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(SIMPLE_SITEMAP, { status: 200 }),
		);

		const storage = createMockStorage();
		const count = await crawlSitemap("example.com", "site-1", storage);

		expect(count).toBe(3);
		expect(storage.upsertPages).toHaveBeenCalledOnce();

		const [siteId, pages] = (storage.upsertPages as any).mock.calls[0];
		expect(siteId).toBe("site-1");
		expect(pages).toHaveLength(3);
		expect(pages[0].url).toBe("https://example.com/docs/auth");
		expect(pages[1].url).toBe("https://example.com/docs/billing");
		expect(pages[2].url).toBe("https://example.com/about");
	});

	it("should derive titles from URL paths", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(SIMPLE_SITEMAP, { status: 200 }),
		);

		const storage = createMockStorage();
		await crawlSitemap("example.com", "site-1", storage);

		const pages = (storage.upsertPages as any).mock.calls[0][1];
		expect(pages[0].title).toBe("auth");
		expect(pages[1].title).toBe("billing");
		expect(pages[2].title).toBe("about");
	});

	it("should handle sitemap index with child sitemaps", async () => {
		vi.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response(SITEMAP_INDEX, { status: 200 }))
			.mockResolvedValueOnce(new Response(CHILD_SITEMAP_DOCS, { status: 200 }))
			.mockResolvedValueOnce(new Response(CHILD_SITEMAP_BLOG, { status: 200 }));

		const storage = createMockStorage();
		const count = await crawlSitemap("example.com", "site-1", storage);

		expect(count).toBe(2);
		const pages = (storage.upsertPages as any).mock.calls[0][1];
		expect(pages[0].url).toBe("https://example.com/docs/getting-started");
		expect(pages[1].url).toBe("https://example.com/blog/hello");
	});

	it("should return 0 when sitemap returns 404", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("Not Found", { status: 404 }),
		);

		const storage = createMockStorage();
		const count = await crawlSitemap("example.com", "site-1", storage);

		expect(count).toBe(0);
		expect(storage.upsertPages).not.toHaveBeenCalled();
	});

	it("should return 0 when fetch throws", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

		const storage = createMockStorage();
		const count = await crawlSitemap("example.com", "site-1", storage);

		expect(count).toBe(0);
	});
});
