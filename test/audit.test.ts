import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { audit } from "../src/api/routes/audit.js";
import { report } from "../src/api/routes/report.js";
import { probeClaudeBotResponse } from "../src/engine/claudebot-probe.js";
import { discoverDemoPages } from "../src/engine/discovery.js";
import { analyzeSite } from "../src/engine/analyzer.js";
import { PostgresStorage } from "../src/storage/postgres.js";
import type { StandingAuditReport, FunnelStep } from "../src/types.js";

// The deep-audit path (BAT-22) fans out into real network crawls — mock both
// engines so tests stay hermetic. The probe path (claudebot-probe) is NOT
// mocked; existing tests above exercise its real behavior.
vi.mock("../src/engine/discovery.js", () => ({ discoverDemoPages: vi.fn() }));
vi.mock("../src/engine/analyzer.js", () => ({ analyzeSite: vi.fn() }));

/** Minimal durable-storage double for the two methods audit.ts / report.ts
 *  actually call — mirrors the Map the real Postgres table replaces, but
 *  proves both routes now go through StorageAdapter instead of a
 *  module-level in-memory cache (BAT-38/39 review finding). */
function createAuditStorage(): PostgresStorage {
	const reports = new Map<string, StandingAuditReport>();
	const funnelEvents: { step: FunnelStep; domain?: string; metadata?: Record<string, unknown> }[] = [];
	const storage = {
		events: funnelEvents,
		async saveAuditReport(r: StandingAuditReport) {
			reports.set(r.id, r);
		},
		async getAuditReport(id: string) {
			return reports.get(id) ?? null;
		},
		async recordFunnelEvent(step: FunnelStep, domain?: string, metadata?: Record<string, unknown>) {
			funnelEvents.push({ step, domain, metadata });
		},
	} as unknown as PostgresStorage;
	return storage;
}

function createTestApp() {
	const storage = createAuditStorage();
	const app = new Hono<{ Variables: { storage: PostgresStorage } }>();
	app.use("*", async (c, next) => {
		c.set("storage", storage);
		await next();
	});
	app.route("/api/audit", audit);
	app.route("/report", report);
	return { app, storage };
}

describe("ClaudeBot Probe & Standing Audit (BAT-38, BAT-39)", () => {
	it("rejects invalid or blocked internal domains", async () => {
		await expect(probeClaudeBotResponse("localhost")).rejects.toThrow();
		await expect(probeClaudeBotResponse("127.0.0.1")).rejects.toThrow();
		await expect(probeClaudeBotResponse("169.254.169.254")).rejects.toThrow();
	});

	it("handles probe errors gracefully", async () => {
		const result = await probeClaudeBotResponse("example.invalid-domain-nonexistent");
		expect(result.status).toBe(0);
		expect(result.verdict).toBe("error");
		expect(result.comparison.withAgent404.status).toBe(404);
		expect(result.comparison.withAgent404.recoverySupported).toBe(true);
	});

	it("creates and retrieves a standing audit via API, durably (not from an in-memory Map)", async () => {
		const { app } = createTestApp();

		const createRes = await app.request("/api/audit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ domain: "example.com", deadPath: "/non-existent" }),
		});

		expect(createRes.status).toBe(201);
		const report = await createRes.json();
		expect(report.id).toMatch(/^audit_/);
		expect(report.domain).toBe("example.com");
		expect(report.score).toBeGreaterThan(0);
		expect(report.permalink).toContain(report.id);
		expect(report.claudeBotProbe).toBeDefined();

		const getRes = await app.request(`/api/audit/${report.id}`);
		expect(getRes.status).toBe(200);
		const fetched = await getRes.json();
		expect(fetched.id).toBe(report.id);
		expect(fetched.domain).toBe("example.com");

		// Retrieve OG SVG image (BAT-41)
		const ogRes = await app.request(`/api/audit/${report.id}/og.svg`);
		expect(ogRes.status).toBe(200);
		expect(ogRes.headers.get("content-type")).toContain("image/svg+xml");
		const svgText = await ogRes.text();
		expect(svgText).toContain("<svg");
		expect(svgText).toContain("example.com");
		expect(svgText).toContain(String(report.score));
	});

	it("returns 404 for non-existent audit ID", async () => {
		const { app } = createTestApp();

		const res = await app.request("/api/audit/audit_nonexistent_123");
		expect(res.status).toBe(404);
	});

	it("is readable from a different app instance sharing the same storage (simulates a different isolate)", async () => {
		// Regression test for the durability finding: reports used to live in
		// a module-level Map, so a report created on one Vercel/Cloudflare
		// isolate was invisible to a request handled by another. Two separate
		// Hono app instances here stand in for two isolates; they must only
		// share the storage layer, not any module state, to prove the fix.
		const storage = createAuditStorage();
		function mountApp() {
			const app = new Hono<{ Variables: { storage: PostgresStorage } }>();
			app.use("*", async (c, next) => {
				c.set("storage", storage);
				await next();
			});
			app.route("/api/audit", audit);
			app.route("/report", report);
			return app;
		}
		const instanceA = mountApp();
		const instanceB = mountApp();

		const createRes = await instanceA.request("/api/audit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ domain: "cross-isolate.example.com", deadPath: "/gone" }),
		});
		expect(createRes.status).toBe(201);
		const created = await createRes.json();

		const ogResB = await instanceB.request(`/api/audit/${created.id}/og.svg`);
		expect(ogResB.status).toBe(200);

		const reportResB = await instanceB.request(`/report/${created.id}`);
		expect(reportResB.status).toBe(200);
		const html = await reportResB.text();
		expect(html).toContain("cross-isolate.example.com");
	});

	describe("GET /report/:id", () => {
		it("renders the real report — domain, score, and OG meta tags — not the generic demo page", async () => {
			const { app, storage } = createTestApp();

			const createRes = await app.request("/api/audit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: "report-render.example.com", deadPath: "/gone" }),
			});
			expect(createRes.status).toBe(201);
			const created = await createRes.json();

			// Confirm the report actually landed in storage under this id —
			// i.e. the route below is reading real data, not coincidentally
			// matching text baked into a static demo page.
			expect(await storage.getAuditReport(created.id)).not.toBeNull();

			const pageRes = await app.request(`/report/${created.id}`);
			expect(pageRes.status).toBe(200);
			const html = await pageRes.text();

			expect(html).toContain("report-render.example.com");
			expect(html).toContain(String(created.score));
			expect(html).toContain(`property="og:image" content="`);
			expect(html).toContain(created.ogImageUrl);
			expect(html).toContain(`property="og:title"`);
			expect(html).toContain(`property="og:description"`);

			// The old bug served the generic interactive demo for every :id —
			// that page has no per-report score/domain content at all.
			expect(html).not.toContain("Live Demo — agent-404");
		});

		it("renders a dedicated 404 page for an unknown report id (not the demo page)", async () => {
			const { app } = createTestApp();

			const res = await app.request("/report/audit_does-not-exist_00000000");
			expect(res.status).toBe(404);
			const html = await res.text();
			expect(html).toContain("Audit report not found");
		});
	});

	describe("deep audit mode (BAT-22)", () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		const ANALYSIS = {
			analyzedAt: "2026-08-21T12:00:00.000Z",
			source: "sitemap" as const,
			pagesAnalyzed: 2,
			brokenLinks: [{ sourcePage: "https://deep.example.com/", targetUrl: "https://deep.example.com/gone" }],
			orphanPages: ["https://deep.example.com/orphan"],
		};

		function mockDeepPipeline() {
			vi.mocked(discoverDemoPages).mockResolvedValue({
				domain: "deep.example.com",
				pages: [
					{ url: "https://deep.example.com/", title: "Home", description: "home" },
					{ url: "https://deep.example.com/docs", title: "Docs" },
				],
				source: "sitemap",
			});
			vi.mocked(analyzeSite).mockResolvedValue({
				domain: "deep.example.com",
				...ANALYSIS,
			});
		}

		it("runs discovery + analysis, persists and returns the analysis when deep:true", async () => {
			mockDeepPipeline();
			const { app, storage } = createTestApp();

			const createRes = await app.request("/api/audit", {
				method: "POST",
				headers: { "Content-Type": "application/json", "x-forwarded-for": "10.1.0.1" },
				body: JSON.stringify({ domain: "deep.example.com", deadPath: "/gone", deep: true }),
			});

			expect(createRes.status).toBe(201);
			const created = await createRes.json();
			expect(created.analysis).toEqual(ANALYSIS);
			expect(discoverDemoPages).toHaveBeenCalledWith("deep.example.com", "/gone");
			expect(analyzeSite).toHaveBeenCalledTimes(1);

			// Round-trips through the permalink fetch.
			const getRes = await app.request(`/api/audit/${created.id}`);
			expect(getRes.status).toBe(200);
			const fetched = await getRes.json();
			expect(fetched.analysis).toEqual(ANALYSIS);

			// Funnel telemetry records the deep intent at the start step.
			const events = (
				storage as unknown as {
					events: { step: FunnelStep; metadata?: Record<string, unknown> }[];
				}
			).events;
			const started = events.find((e) => e.step === "audit_started");
			expect(started?.metadata).toMatchObject({ deep: true });
		});

		it("degrades to a probe-only report when the deep pipeline fails", async () => {
			vi.mocked(discoverDemoPages).mockRejectedValue(new Error("crawl exploded"));
			const { app } = createTestApp();

			const createRes = await app.request("/api/audit", {
				method: "POST",
				headers: { "Content-Type": "application/json", "x-forwarded-for": "10.1.0.2" },
				body: JSON.stringify({ domain: "broken-crawl.example.com", deadPath: "/gone", deep: true }),
			});

			expect(createRes.status).toBe(201);
			const created = await createRes.json();
			expect(created.analysis).toBeNull();
			expect(created.claudeBotProbe).toBeDefined();

			const getRes = await app.request(`/api/audit/${created.id}`);
			const fetched = await getRes.json();
			expect(fetched.analysis).toBeNull();
		});

		it("omits analysis entirely for non-deep audits", async () => {
			mockDeepPipeline();
			const { app } = createTestApp();

			const createRes = await app.request("/api/audit", {
				method: "POST",
				headers: { "Content-Type": "application/json", "x-forwarded-for": "10.1.0.3" },
				body: JSON.stringify({ domain: "quick.example.com", deadPath: "/gone" }),
			});

			expect(createRes.status).toBe(201);
			const created = await createRes.json();
			expect(created.analysis).toBeUndefined();
			expect(discoverDemoPages).not.toHaveBeenCalled();
			expect(analyzeSite).not.toHaveBeenCalled();
		});

		it("round-trips the analysis column through the Postgres row mapper", () => {
			// neon() connects lazily, so constructing with a dummy URL is safe —
			// this exercises only the JSONB mapping, not the network.
			const storage = new PostgresStorage("postgres://user:pass@localhost:5432/test");
			const mapper = (
				storage as unknown as {
					mapAuditReportRow(row: Record<string, unknown>): StandingAuditReport;
				}
			).mapAuditReportRow.bind(storage);

			const baseRow = {
				id: "audit_x_1",
				domain: "mapper.example.com",
				created_at: new Date(),
				score: 50,
				claudebot_probe: JSON.stringify({ status: 404 }),
				summary: JSON.stringify({ status: "warning" }),
				permalink: "/report/audit_x_1",
				og_image_url: "/api/audit/audit_x_1/og.svg",
			};

			const withAnalysis = mapper({ ...baseRow, analysis: JSON.stringify(ANALYSIS) });
			expect(withAnalysis.analysis).toEqual(ANALYSIS);

			const withoutAnalysis = mapper(baseRow);
			expect(withoutAnalysis.analysis).toBeNull();
		});
	});
});
