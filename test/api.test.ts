import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sites } from "../src/api/routes/sites.js";
import { register } from "../src/api/routes/register.js";
import { suggest } from "../src/api/routes/suggest.js";
import { apiKeyAuth } from "../src/api/middleware/auth.js";
import type { StorageAdapter } from "../src/storage/interface.js";
import type { PostgresStorage } from "../src/storage/postgres.js";
import type { SiteRecord, PageRecord } from "../src/types.js";

// In-memory storage for testing — no database needed
class MemoryStorage implements StorageAdapter {
	sites: SiteRecord[] = [];
	pages: PageRecord[] = [];
	suggestionLogs: { siteId: string; deadUrl: string; suggestedUrls: string[] }[] = [];
	private nextPageId = 1;

	async createSite(domain: string): Promise<SiteRecord> {
		if (this.sites.find((s) => s.domain === domain)) {
			throw new Error("unique constraint violation: duplicate domain");
		}
		const site: SiteRecord = {
			id: crypto.randomUUID(),
			domain,
			apiKey: `key_${crypto.randomUUID().replace(/-/g, "")}`,
			createdAt: new Date().toISOString(),
		};
		this.sites.push(site);
		return site;
	}

	async getSite(id: string): Promise<SiteRecord | null> {
		return this.sites.find((s) => s.id === id) || null;
	}

	async getSiteByApiKey(apiKey: string): Promise<SiteRecord | null> {
		return this.sites.find((s) => s.apiKey === apiKey) || null;
	}

	async upsertPage(
		siteId: string,
		page: Pick<PageRecord, "url" | "title" | "description" | "headings">,
		embedding?: number[] | null,
	): Promise<void> {
		const existing = this.pages.find((p) => p.siteId === siteId && p.url === page.url);
		if (existing) {
			existing.title = page.title;
			existing.description = page.description;
			existing.headings = page.headings;
			existing.lastSeen = new Date().toISOString();
			if (embedding) existing.embedding = embedding;
		} else {
			this.pages.push({
				id: this.nextPageId++,
				siteId,
				url: page.url,
				title: page.title,
				description: page.description,
				headings: page.headings,
				lastSeen: new Date().toISOString(),
				embedding: embedding || undefined,
			});
		}
	}

	async upsertPages(
		siteId: string,
		pages: Pick<PageRecord, "url" | "title" | "description" | "headings">[],
		embeddings?: (number[] | null)[],
	): Promise<void> {
		for (let i = 0; i < pages.length; i++) {
			await this.upsertPage(siteId, pages[i], embeddings?.[i] ?? null);
		}
	}

	async getPages(siteId: string): Promise<PageRecord[]> {
		return this.pages.filter((p) => p.siteId === siteId);
	}

	async searchByEmbedding(siteId: string, _embedding: number[], limit: number): Promise<PageRecord[]> {
		// Simple fallback: just return all pages (no vector search in memory)
		return this.pages.filter((p) => p.siteId === siteId).slice(0, limit);
	}

	async deleteStalePagesOlderThan(siteId: string, cutoff: string): Promise<number> {
		const cutoffDate = new Date(cutoff);
		const before = this.pages.length;
		this.pages = this.pages.filter(
			(p) => p.siteId !== siteId || new Date(p.lastSeen) >= cutoffDate,
		);
		return before - this.pages.length;
	}

	async recordSuggestionServed(siteId: string, deadUrl: string, suggestedUrls: string[]): Promise<void> {
		this.suggestionLogs.push({ siteId, deadUrl, suggestedUrls });
	}

	async getStats(siteId: string) {
		return {
			pageCount: this.pages.filter((p) => p.siteId === siteId).length,
			suggestionsServed: this.suggestionLogs.filter((l) => l.siteId === siteId).length,
		};
	}
}

function createTestApp(storage: MemoryStorage) {
	const app = new Hono<{
		Variables: { storage: PostgresStorage; siteId: string };
	}>();

	app.use("*", cors({ origin: "*" }));

	// Inject memory storage
	app.use("/api/*", async (c, next) => {
		c.set("storage", storage as unknown as PostgresStorage);
		await next();
	});

	app.get("/api/health", (c) => c.json({ status: "ok" }));
	app.route("/api/sites", sites);
	app.use("/api/register", apiKeyAuth());
	app.route("/api/register", register);
	app.use("/api/suggest", apiKeyAuth());
	app.route("/api/suggest", suggest);

	return app;
}

describe("API routes", () => {
	let storage: MemoryStorage;
	let app: ReturnType<typeof createTestApp>;

	beforeEach(() => {
		vi.restoreAllMocks();
		storage = new MemoryStorage();
		app = createTestApp(storage);
	});

	describe("GET /api/health", () => {
		it("should return ok", async () => {
			const res = await app.request("/api/health");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ status: "ok" });
		});
	});

	describe("POST /api/sites", () => {
		it("should register a new site", async () => {
			const res = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "test.example.com" }),
			});

			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.domain).toBe("test.example.com");
			expect(body.id).toBeDefined();
			expect(body.apiKey).toMatch(/^key_/);
		});

		it("should reject duplicate domains", async () => {
			await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "test.example.com" }),
			});

			const res = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "test.example.com" }),
			});

			expect(res.status).toBe(409);
		});

		it("should require domain field", async () => {
			const res = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});

		it("should strip protocol from domain", async () => {
			const res = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "https://test.example.com/" }),
			});

			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.domain).toBe("test.example.com");
		});
	});

	describe("POST /api/register (auth required)", () => {
		let apiKey: string;
		let siteId: string;

		beforeEach(async () => {
			// Suppress sitemap crawl fetch
			vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));

			const res = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "test.example.com" }),
			});
			const body = await res.json();
			apiKey = body.apiKey;
			siteId = body.id;
		});

		it("should reject requests without API key", async () => {
			const res = await app.request("/api/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: "https://test.example.com/page" }),
			});

			expect(res.status).toBe(401);
		});

		it("should reject requests with invalid API key", async () => {
			const res = await app.request("/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": "key_invalid",
				},
				body: JSON.stringify({ url: "https://test.example.com/page" }),
			});

			expect(res.status).toBe(401);
		});

		it("should register a page", async () => {
			const res = await app.request("/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({
					url: "https://test.example.com/docs/auth",
					title: "Auth Guide",
					description: "How to authenticate",
					headings: ["OAuth", "API Keys"],
				}),
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ ok: true });
			expect(storage.pages).toHaveLength(1);
			expect(storage.pages[0].url).toBe("https://test.example.com/docs/auth");
			expect(storage.pages[0].title).toBe("Auth Guide");
		});

		it("should require url field", async () => {
			const res = await app.request("/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ title: "No URL" }),
			});

			expect(res.status).toBe(400);
		});

		it("should upsert on duplicate URL", async () => {
			const req = (title: string) =>
				app.request("/api/register", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": apiKey,
					},
					body: JSON.stringify({
						url: "https://test.example.com/docs/auth",
						title,
					}),
				});

			await req("Old Title");
			await req("New Title");

			expect(storage.pages).toHaveLength(1);
			expect(storage.pages[0].title).toBe("New Title");
		});
	});

	describe("POST /api/suggest (auth required)", () => {
		let apiKey: string;

		beforeEach(async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));

			const res = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "test.example.com" }),
			});
			const body = await res.json();
			apiKey = body.apiKey;

			// Seed some pages
			const pages = [
				{ url: "https://test.example.com/docs/v3/auth", title: "Authentication Guide" },
				{ url: "https://test.example.com/docs/v3/billing", title: "Billing API" },
				{ url: "https://test.example.com/docs/v3/users", title: "Users API" },
				{ url: "https://test.example.com/blog/hello-world", title: "Hello World" },
			];

			for (const page of pages) {
				await app.request("/api/register", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": apiKey,
					},
					body: JSON.stringify(page),
				});
			}
		});

		it("should reject requests without API key", async () => {
			const res = await app.request("/api/suggest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: "https://test.example.com/docs/v2/auth" }),
			});
			expect(res.status).toBe(401);
		});

		it("should return suggestions for a dead URL", async () => {
			const res = await app.request("/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://test.example.com/docs/v2/auth" }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.deadUrl).toBe("https://test.example.com/docs/v2/auth");
			expect(body.suggestions.length).toBeGreaterThan(0);
			expect(body.suggestions[0].url).toContain("/auth");
			expect(body.suggestions[0].score).toBeGreaterThan(0.5);
			expect(body.suggestions[0].matchType).toBe("moved"); // version migration
		});

		it("should return JSON-LD in response", async () => {
			const res = await app.request("/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://test.example.com/docs/v2/auth" }),
			});

			const body = await res.json();
			expect(body.jsonLd["@context"]).toBe("https://schema.org");
			expect(body.jsonLd["@type"]).toBe("WebPage");
			expect(body.jsonLd.mainEntity["@type"]).toBe("ItemList");
			expect(body.jsonLd.mainEntity.itemListElement.length).toBeGreaterThan(0);
		});

		it("should handle typo matches", async () => {
			const res = await app.request("/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://test.example.com/docs/v3/auht" }),
			});

			const body = await res.json();
			expect(body.suggestions[0].url).toContain("/auth");
		});

		it("should return empty suggestions for unrelated URLs", async () => {
			const res = await app.request("/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://test.example.com/completely/different/path" }),
			});

			const body = await res.json();
			// Should return low-scoring or no results
			for (const s of body.suggestions) {
				expect(s.score).toBeLessThan(0.6);
			}
		});

		it("should require url field", async () => {
			const res = await app.request("/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
		});

		it("should log suggestions served", async () => {
			await app.request("/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://test.example.com/docs/v2/auth" }),
			});

			// Wait a tick for async logging
			await new Promise((r) => setTimeout(r, 50));
			expect(storage.suggestionLogs.length).toBe(1);
			expect(storage.suggestionLogs[0].deadUrl).toBe(
				"https://test.example.com/docs/v2/auth",
			);
		});
	});

	describe("GET /api/sites/:id/stats", () => {
		it("should return site stats", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));

			const createRes = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "stats.example.com" }),
			});
			const { id, apiKey } = await createRes.json();

			// Register a page
			await app.request("/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://stats.example.com/page1", title: "Page 1" }),
			});

			const statsRes = await app.request(`/api/sites/${id}/stats`);
			expect(statsRes.status).toBe(200);
			const stats = await statsRes.json();
			expect(stats.pageCount).toBe(1);
			expect(stats.suggestionsServed).toBe(0);
		});

		it("should return 404 for unknown site", async () => {
			const res = await app.request("/api/sites/nonexistent/stats");
			expect(res.status).toBe(404);
		});
	});
});
