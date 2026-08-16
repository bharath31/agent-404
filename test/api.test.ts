import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sites } from "../src/api/routes/sites.js";
import { register } from "../src/api/routes/register.js";
import { suggest } from "../src/api/routes/suggest.js";
import { apiKeyAuth, requireVerified } from "../src/api/middleware/auth.js";
import { install } from "../src/api/routes/install.js";
import { requireOwnerApi } from "../src/auth/owner.js";
import type { StorageAdapter } from "../src/storage/interface.js";
import type { PostgresStorage } from "../src/storage/postgres.js";
import type { SiteRecord, PageRecord } from "../src/types.js";

// In-memory storage for testing — no database needed
class MemoryStorage implements StorageAdapter {
	sites: SiteRecord[] = [];
	pages: PageRecord[] = [];
	suggestionLogs: { siteId: string; deadUrl: string; suggestedUrls: string[] }[] = [];
	private nextPageId = 1;

	async createSite(domain: string, ownerSub: string): Promise<SiteRecord> {
		if (this.sites.find((s) => s.domain === domain)) {
			throw new Error("unique constraint violation: duplicate domain");
		}
		const site: SiteRecord = {
			id: crypto.randomUUID(),
			domain,
			apiKey: `key_${crypto.randomUUID().replace(/-/g, "")}`,
			publicKey: `pk_${crypto.randomUUID().replace(/-/g, "")}`,
			verifiedAt: null,
			verificationToken: `vf_${crypto.randomUUID().replace(/-/g, "")}`,
			reclaimToken: null,
			reclaimRequestedAt: null,
			createdAt: new Date().toISOString(),
			ownerSub,
		};
		this.sites.push(site);
		return site;
	}

	async getSite(id: string): Promise<SiteRecord | null> {
		return this.sites.find((s) => s.id === id) || null;
	}

	async getSiteByApiKey(apiKey: string): Promise<SiteRecord | null> {
		const found = await this.getSiteByKey(apiKey);
		return found?.keyType === "secret" ? found.site : null;
	}

	async getSiteByKey(key: string) {
		const site = this.sites.find((s) => s.apiKey === key || s.publicKey === key);
		if (!site) return null;
		if (site.apiKey === key) return { site, keyType: "secret" as const };
		return { site, keyType: "public" as const };
	}

	async getSiteByDomain(domain: string): Promise<SiteRecord | null> {
		return this.sites.find((s) => s.domain === domain) || null;
	}

	async markVerified(id: string): Promise<void> {
		const site = this.sites.find((s) => s.id === id);
		if (site) {
			site.verifiedAt = new Date().toISOString();
			site.reclaimToken = null;
			site.reclaimRequestedAt = null;
		}
	}

	async rotateReclaimToken(id: string): Promise<string> {
		const site = this.sites.find((s) => s.id === id);
		if (!site) throw new Error("not found");
		if (site.reclaimToken) return site.reclaimToken;
		const token = `rc_${crypto.randomUUID().replace(/-/g, "")}`;
		site.reclaimToken = token;
		site.reclaimRequestedAt = new Date().toISOString();
		return token;
	}

	async reclaimSite(id: string, ownerSub: string): Promise<SiteRecord> {
		const site = this.sites.find((s) => s.id === id);
		if (!site) throw new Error("not found");
		this.pages = this.pages.filter((p) => p.siteId !== id);
		site.apiKey = `key_${crypto.randomUUID().replace(/-/g, "")}`;
		site.publicKey = `pk_${crypto.randomUUID().replace(/-/g, "")}`;
		site.verificationToken = `vf_${crypto.randomUUID().replace(/-/g, "")}`;
		site.reclaimToken = null;
		site.reclaimRequestedAt = null;
		site.verifiedAt = new Date().toISOString();
		site.ownerSub = ownerSub;
		return site;
	}

	async listSitesByOwner(ownerSub: string): Promise<SiteRecord[]> {
		return this.sites.filter((s) => s.ownerSub === ownerSub);
	}

	async claimSite(domain: string, apiKey: string, ownerSub: string): Promise<SiteRecord | null> {
		const site = this.sites.find((s) => s.domain === domain);
		if (!site || site.ownerSub || site.apiKey !== apiKey) return null;
		site.ownerSub = ownerSub;
		return site;
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
			if ("contentHash" in page) existing.contentHash = page.contentHash ?? existing.contentHash;
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
				contentHash: page.contentHash ?? null,
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

	async getPages(siteId: string, opts?: { limit?: number; pathHint?: string }): Promise<PageRecord[]> {
		let rows = this.pages.filter((p) => p.siteId === siteId);
		if (opts?.pathHint) {
			const hint = opts.pathHint.toLowerCase();
			rows = rows.filter(
				(p) => p.url.toLowerCase().includes(hint) || p.title.toLowerCase().includes(hint),
			);
		}
		return rows.slice(0, opts?.limit ?? 500);
	}

	async getPageContentHash(siteId: string, url: string): Promise<string | null> {
		return this.pages.find((p) => p.siteId === siteId && p.url === url)?.contentHash ?? null;
	}

	async touchPage(siteId: string, url: string): Promise<void> {
		const page = this.pages.find((p) => p.siteId === siteId && p.url === url);
		if (page) page.lastSeen = new Date().toISOString();
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
		const pages = this.pages.filter((p) => p.siteId === siteId);
		const lastBeaconAt =
			pages.length === 0
				? null
				: pages.reduce((latest, p) => (p.lastSeen > latest ? p.lastSeen : latest), pages[0].lastSeen);
		return {
			pageCount: pages.length,
			suggestionsServed: this.suggestionLogs.filter((l) => l.siteId === siteId).length,
			lastBeaconAt,
		};
	}

	async getSuggestionLogs() {
		return [];
	}

	async getMatchQualityStats() {
		return {
			last24h: 0,
			last7d: 0,
			last30d: 0,
			matchTypeDistribution: { moved: 0, similar: 0, related: 0 },
		};
	}
}

function createTestApp(storage: MemoryStorage, ownerSub: string | null = "auth0|test-user") {
	const app = new Hono<{
		Variables: { storage: PostgresStorage; siteId: string; ownerSub: string };
	}>();

	app.use("*", cors({ origin: "*" }));

	// Inject memory storage
	app.use("/api/*", async (c, next) => {
		c.set("storage", storage as unknown as PostgresStorage);
		await next();
	});

	if (ownerSub) {
		app.use("/api/sites", async (c, next) => {
			c.set("ownerSub", ownerSub);
			await next();
		});
		app.use("/api/sites/*", async (c, next) => {
			c.set("ownerSub", ownerSub);
			await next();
		});
	} else {
		const stub = { getSession: async () => undefined };
		app.use("/api/sites", async (c, next) => {
			c.set("auth0Client", stub as never);
			await next();
		});
		app.use("/api/sites/*", async (c, next) => {
			c.set("auth0Client", stub as never);
			await next();
		});
	}
	app.use("/api/sites", requireOwnerApi());
	app.use("/api/sites/*", requireOwnerApi());

	app.get("/api/health", (c) => c.json({ status: "ok" }));
	app.route("/api/sites", sites);
	app.use("/api/register", apiKeyAuth("write"));
	app.use("/api/register", requireVerified());
	app.route("/api/register", register);
	app.use("/api/suggest", apiKeyAuth("read"));
	app.use("/api/suggest", requireVerified());
	app.route("/api/suggest", suggest);
	app.use("/api/install/*", apiKeyAuth());
	app.route("/api/install", install);

	return app;
}

async function createVerifiedSite(
	app: ReturnType<typeof createTestApp>,
	storage: MemoryStorage,
	domain: string,
) {
	const res = await app.request("/api/sites", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ domain }),
	});
	const body = await res.json();
	await storage.markVerified(body.id);
	return body as {
		id: string;
		apiKey: string;
		publicKey: string;
		domain: string;
	};
}

function mockOwnershipFetch(opts: { wellKnown?: string; txt?: string; a?: string }) {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const url = String(input);
		if (url.includes("cloudflare-dns.com") && url.includes("type=A")) {
			return new Response(JSON.stringify({ Answer: [{ data: opts.a ?? "93.184.216.34" }] }), {
				status: 200,
			});
		}
		if (url.includes("cloudflare-dns.com") && url.includes("type=AAAA")) {
			return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
		}
		if (url.includes("cloudflare-dns.com") && url.includes("type=TXT") && opts.txt) {
			return new Response(JSON.stringify({ Answer: [{ data: `"${opts.txt}"` }] }), { status: 200 });
		}
		if (url.includes("/.well-known/agent-404.txt") && opts.wellKnown !== undefined) {
			return new Response(opts.wellKnown, { status: 200 });
		}
		return new Response("no", { status: 404 });
	});
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
		it("should reject unauthenticated registration", async () => {
			const storage = new MemoryStorage();
			const anon = createTestApp(storage, null);
			const res = await anon.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "test.example.com" }),
			});
			expect(res.status).toBe(401);
		});

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
			expect(body.publicKey).toMatch(/^pk_/);
			expect(body.verified).toBe(false);
			expect(body.verificationToken).toMatch(/^vf_/);
		});

		it("should return the existing site for the same owner", async () => {
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

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.apiKey).toMatch(/^key_/);
			expect(body.domain).toBe("test.example.com");
		});

		it("should not leak another owner's api key", async () => {
			await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "taken.example.com" }),
			});

			const other = createTestApp(storage, "auth0|other-user");
			const res = await other.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "taken.example.com" }),
			});

			expect(res.status).toBe(409);
			const body = await res.json();
			expect(body.code).toBe("owned_by_other");
			expect(body.apiKey).toBeUndefined();
		});

		it("should claim a legacy unowned site with the api key", async () => {
			storage.sites.push({
				id: crypto.randomUUID(),
				domain: "legacy.example.com",
				apiKey: "key_legacyclaimtoken",
				createdAt: new Date().toISOString(),
				ownerSub: null,
			});

			const conflict = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "legacy.example.com" }),
			});
			expect(conflict.status).toBe(409);
			const conflictBody = await conflict.json();
			expect(conflictBody.code).toBe("unowned");
			expect(conflictBody.apiKey).toBeUndefined();

			const fail = await app.request("/api/sites/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "legacy.example.com", apiKey: "key_wrong" }),
			});
			expect(fail.status).toBe(401);

			const ok = await app.request("/api/sites/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "legacy.example.com", apiKey: "key_legacyclaimtoken" }),
			});
			expect(ok.status).toBe(200);
			const body = await ok.json();
			expect(body.apiKey).toBe("key_legacyclaimtoken");
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
			vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));
			const body = await createVerifiedSite(app, storage, "test.example.com");
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
			expect(await res.json()).toEqual({ ok: true, skipped: false });
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

		it("should reject URLs that are not on the registered domain", async () => {
			const res = await app.request("/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://evil-example.com/phish", title: "Nope" }),
			});
			expect(res.status).toBe(400);
			expect(storage.pages).toHaveLength(0);
		});

		it("should allow subdomains of the registered domain", async () => {
			const res = await app.request("/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://docs.test.example.com/auth", title: "Docs" }),
			});
			expect(res.status).toBe(200);
		});

		it("should reject the public key on write routes", async () => {
			const publicKey = storage.sites[0].publicKey;
			const res = await app.request("/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": publicKey,
				},
				body: JSON.stringify({ url: "https://test.example.com/docs/auth" }),
			});
			expect(res.status).toBe(403);
		});

		it("should reject a secret key when Origin is present (browser)", async () => {
			const res = await app.request("/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
					Origin: "https://test.example.com",
				},
				body: JSON.stringify({ url: "https://test.example.com/docs/auth" }),
			});
			expect(res.status).toBe(403);
			expect(storage.pages).toHaveLength(0);
		});

		it("skips rewrite when contentHash is unchanged", async () => {
			const send = (title: string) =>
				app.request("/api/register", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": apiKey,
					},
					body: JSON.stringify({
						url: "https://test.example.com/docs/auth",
						title,
						contentHash: "abc123unchanged",
					}),
				});

			const first = await send("Auth");
			expect((await first.json()).skipped).toBe(false);
			const second = await send("Auth ignored");
			expect((await second.json()).skipped).toBe(true);
			expect(storage.pages).toHaveLength(1);
			expect(storage.pages[0].title).toBe("Auth");
		});
	});

	describe("POST /api/suggest (auth required)", () => {
		let apiKey: string;

		beforeEach(async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));
			const body = await createVerifiedSite(app, storage, "test.example.com");
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

		it("should accept the public key when Origin matches the site", async () => {
			const publicKey = storage.sites[0].publicKey;
			const res = await app.request("/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": publicKey,
					Origin: "https://docs.test.example.com",
				},
				body: JSON.stringify({ url: "https://test.example.com/docs/v2/auth" }),
			});
			expect(res.status).toBe(200);
		});

		it("should reject the public key without a matching Origin", async () => {
			const publicKey = storage.sites[0].publicKey;
			const res = await app.request("/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": publicKey,
				},
				body: JSON.stringify({ url: "https://test.example.com/docs/v2/auth" }),
			});
			expect(res.status).toBe(403);
		});
	});

	describe("domain verification", () => {
		it("should refuse to serve unverified sites", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));
			const res = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "new.example.com" }),
			});
			const { apiKey } = await res.json();
			const suggestRes = await app.request("/api/suggest", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://new.example.com/missing" }),
			});
			expect(suggestRes.status).toBe(403);
		});

		it("should auto-verify disposable CI smoke domains", async () => {
			const res = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: `smoke-${Date.now()}.example.com` }),
			});
			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.verified).toBe(true);
			expect(storage.sites.find((s) => s.id === body.id)?.verifiedAt).toBeTruthy();
		});

		it("should verify via the well-known file", async () => {
			const created = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "owned.example.com" }),
			});
			const site = await created.json();
			mockOwnershipFetch({ wellKnown: site.verificationToken });
			const verify = await app.request(`/api/sites/${site.id}/verify`, { method: "POST" });
			expect(verify.status).toBe(200);
			expect(storage.sites[0].verifiedAt).toBeTruthy();
		});

		it("should not treat a well-known redirect as proof", async () => {
			const created = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "redirect.example.com" }),
			});
			const site = await created.json();
			vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
				const url = String(input);
				if (url.includes("cloudflare-dns.com") && url.includes("type=A")) {
					return new Response(JSON.stringify({ Answer: [{ data: "93.184.216.34" }] }), {
						status: 200,
					});
				}
				if (url.includes("cloudflare-dns.com")) {
					return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
				}
				if (url.includes("/.well-known/agent-404.txt")) {
					return new Response("", {
						status: 302,
						headers: { Location: "http://169.254.169.254/latest/meta-data/" },
					});
				}
				return new Response("no", { status: 404 });
			});
			const verify = await app.request(`/api/sites/${site.id}/verify`, { method: "POST" });
			expect(verify.status).toBe(400);
			expect(storage.sites[0].verifiedAt).toBeNull();
		});

		it("should verify via DNS TXT (DoH)", async () => {
			const created = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "dns.example.com" }),
			});
			const site = await created.json();
			mockOwnershipFetch({ txt: site.verificationToken });
			const verify = await app.request(`/api/sites/${site.id}/verify`, { method: "POST" });
			expect(verify.status).toBe(200);
			expect(storage.sites[0].verifiedAt).toBeTruthy();
		});
	});

	describe("reclaim", () => {
		it("should start reclaim and keep the same token on a second call", async () => {
			await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "takeover.example.com" }),
			});
			const first = await app.request("/api/sites/reclaim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "takeover.example.com" }),
			});
			expect(first.status).toBe(200);
			const a = await first.json();
			const second = await app.request("/api/sites/reclaim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "takeover.example.com" }),
			});
			const b = await second.json();
			expect(b.reclaimToken).toBe(a.reclaimToken);
			expect(b.siteId).toBe(a.siteId);
		});

		it("should fail complete when no reclaim is in progress", async () => {
			await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "idle.example.com" }),
			});
			const res = await app.request("/api/sites/reclaim/complete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "idle.example.com" }),
			});
			expect(res.status).toBe(400);
		});

		it("should complete immediately for an unverified site and purge pages", async () => {
			const created = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "squat.example.com" }),
			});
			const site = await created.json();
			await storage.upsertPage(site.id, {
				url: "https://squat.example.com/poison",
				title: "Attacker title",
				description: "",
				headings: "evil",
			});
			const start = await app.request("/api/sites/reclaim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "squat.example.com" }),
			});
			const { reclaimToken } = await start.json();
			mockOwnershipFetch({ wellKnown: reclaimToken });
			const done = await app.request("/api/sites/reclaim/complete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "squat.example.com" }),
			});
			expect(done.status).toBe(200);
			const body = await done.json();
			expect(body.apiKey).not.toBe(site.apiKey);
			expect(body.verified).toBe(true);
			expect(storage.pages.filter((p) => p.siteId === site.id)).toHaveLength(0);
		});

		it("should transfer ownership to the reclaimer", async () => {
			const created = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "stolen.example.com" }),
			});
			const site = await created.json();

			const other = createTestApp(storage, "auth0|reclaimer");
			const start = await other.request("/api/sites/reclaim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "stolen.example.com" }),
			});
			const { reclaimToken } = await start.json();
			mockOwnershipFetch({ wellKnown: reclaimToken });
			const done = await other.request("/api/sites/reclaim/complete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "stolen.example.com" }),
			});
			expect(done.status).toBe(200);

			const reclaimerSites = await storage.listSitesByOwner("auth0|reclaimer");
			expect(reclaimerSites.map((s) => s.id)).toContain(site.id);
			const originalOwnerSites = await storage.listSitesByOwner("auth0|test-user");
			expect(originalOwnerSites.map((s) => s.id)).not.toContain(site.id);
		});

		it("should not rotate keys on a verified site before the cooling-off period", async () => {
			const created = await createVerifiedSite(app, storage, "live.example.com");
			const start = await app.request("/api/sites/reclaim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "live.example.com" }),
			});
			const { reclaimToken } = await start.json();
			mockOwnershipFetch({ wellKnown: reclaimToken });
			const done = await app.request("/api/sites/reclaim/complete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "live.example.com", confirm: true }),
			});
			expect(done.status).toBe(400);
			expect(storage.sites[0].apiKey).toBe(created.apiKey);
		});

		it("should rotate a verified site after cooling-off when confirm is set", async () => {
			const created = await createVerifiedSite(app, storage, "grace.example.com");
			await storage.upsertPage(created.id, {
				url: "https://grace.example.com/poison",
				title: "Attacker title",
				description: "",
				headings: "evil",
			});
			const start = await app.request("/api/sites/reclaim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "grace.example.com" }),
			});
			const { reclaimToken } = await start.json();
			storage.sites[0].reclaimRequestedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
			mockOwnershipFetch({ wellKnown: reclaimToken });
			const done = await app.request("/api/sites/reclaim/complete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "grace.example.com", confirm: true }),
			});
			expect(done.status).toBe(200);
			const body = await done.json();
			expect(body.apiKey).not.toBe(created.apiKey);
			expect(storage.pages.filter((p) => p.siteId === created.id)).toHaveLength(0);
		});
	});

	describe("GET /api/sites/:id/stats", () => {
		it("should return site stats", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));

			const { id, apiKey } = await createVerifiedSite(app, storage, "stats.example.com");

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
			expect(stats.lastBeaconAt).toBeTruthy();
		});

		it("should return 404 for unknown site", async () => {
			const res = await app.request("/api/sites/nonexistent/stats");
			expect(res.status).toBe(404);
		});
	});

	describe("GET /api/install/status", () => {
		it("should warn when no beacons have been received", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));

			const createRes = await app.request("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "silent.example.com" }),
			});
			const { apiKey } = await createRes.json();

			const res = await app.request("/api/install/status", {
				headers: { "x-api-key": apiKey },
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.installVerified).toBe(false);
			expect(body.pageCount).toBe(0);
			expect(body.warning).toMatch(/No beacons received/);
		});

		it("should report verified after a page is registered", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));

			const { apiKey } = await createVerifiedSite(app, storage, "live.example.com");

			await app.request("/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ url: "https://live.example.com/docs", title: "Docs" }),
			});

			const res = await app.request("/api/install/status", {
				headers: { "x-api-key": apiKey },
			});
			const body = await res.json();
			expect(body.installVerified).toBe(true);
			expect(body.pageCount).toBe(1);
			expect(body.warning).toBeNull();
			expect(body.lastBeaconAt).toBeTruthy();
		});

		it("should reject missing API key", async () => {
			const res = await app.request("/api/install/status");
			expect(res.status).toBe(401);
		});
	});
});
