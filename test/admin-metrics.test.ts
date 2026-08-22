import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { admin } from "../src/api/routes/admin.js";
import {
	adminMetricsPageHtml,
	pivotVerdict,
	KILL_CONVERSION_RATE,
	KILL_RECOVERY_RATE,
} from "../src/views/admin-metrics.js";

/**
 * BAT-26 / Theme 7 gate: one page with the four decision numbers and the
 * week-12 kill criteria written next to them. The page is the gate — if a
 * number or the criteria text goes missing, the theme's exit condition is
 * no longer met, so these tests pin both.
 */
describe("pivotVerdict (week-12 kill rule)", () => {
	it("pivots only when BOTH conversion and recovery are under their kill lines", () => {
		expect(pivotVerdict(KILL_CONVERSION_RATE - 0.001, KILL_RECOVERY_RATE - 0.001)).toBe("pivot");
	});

	it("continues when either rate meets its line", () => {
		expect(pivotVerdict(KILL_CONVERSION_RATE, KILL_RECOVERY_RATE - 0.001)).toBe("continue");
		expect(pivotVerdict(KILL_CONVERSION_RATE - 0.001, KILL_RECOVERY_RATE)).toBe("continue");
		expect(pivotVerdict(0.5, 0.9)).toBe("continue");
	});

	it("is insufficient-data when either rate has no denominator yet", () => {
		expect(pivotVerdict(null, 0.5)).toBe("insufficient-data");
		expect(pivotVerdict(0.5, null)).toBe("insufficient-data");
		expect(pivotVerdict(null, null)).toBe("insufficient-data");
	});
});

describe("adminMetricsPageHtml", () => {
	const base = {
		liveInstalls: 42,
		totalSites: 90,
		recoveryRate: 0.35,
		overallFunnelConversion: 0.04,
		precision: { labeled: 100, correct: 82 },
	};

	it("renders all four decision numbers", () => {
		const html = adminMetricsPageHtml(base);
		expect(html).toContain("42");
		expect(html).toContain("35.0%");
		expect(html).toContain("4.0%");
		expect(html).toContain("82.0%");
	});

	it("writes the week-12 kill criteria on the page", () => {
		const html = adminMetricsPageHtml(base);
		expect(html).toContain("2.0%");
		expect(html).toContain("20.0%");
		expect(html).toContain("diagnostic product");
	});

	it("renders an honest em-dash for rates with no data instead of 0%", () => {
		const html = adminMetricsPageHtml({ ...base, recoveryRate: null, overallFunnelConversion: null });
		expect(html).toContain("\u2014");
		expect(html).toContain("Not enough data yet");
	});

	it("shows the pivot verdict when both kill lines are breached", () => {
		const html = adminMetricsPageHtml({ ...base, recoveryRate: 0.1, overallFunnelConversion: 0.01 });
		expect(html).toContain("diagnostic-product pivot");
	});
});

describe("GET /api/admin/page routing + auth", () => {
	function createTestApp(storage: Record<string, unknown>, secret = "test-secret") {
		const app = new Hono();
		app.use("/api/admin/*", async (c, next) => {
			c.env = { CRON_SECRET: secret };
			c.set("storage", storage as never);
			await next();
		});
		app.route("/api/admin", admin);
		return app;
	}

	const storage = {
		getLiveInstallCount: async () => 7,
		getTotalSiteCount: async () => 20,
		getRecoveryRateStats: async () => ({
			overall: { totalSuggestions: 10, recoveredCount: 4, recoveryRate: 0.4, medianLatencyMs: null },
			byAgentCategory: {},
		}),
		getFunnelMetrics: async () => ({
			totalAuditsStarted: 50,
			totalAuditsCompleted: 30,
			totalReportsShared: 5,
			totalInstallCtaClicks: 12,
			totalSitesRegistered: 8,
			totalInstallsVerified: 3,
			rates: { overallFunnelConversion: 0.06 },
		}),
		getLabelPrecision: async () => ({ labeled: 40, correct: 33 }),
	};

	it("returns 401 without the bearer token", async () => {
		const res = await createTestApp(storage).request("/api/admin/page");
		expect(res.status).toBe(401);
	});

	it("renders the decision page with all four numbers when authorized", async () => {
		const res = await createTestApp(storage).request("/api/admin/page", {
			headers: { authorization: "Bearer test-secret" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const body = await res.text();
		expect(body).toContain("7"); // live installs
		expect(body).toContain("40.0%"); // recovery rate
		expect(body).toContain("6.0%"); // conversion
		expect(body).toContain("82.5%"); // precision
	});

	it("still renders honestly when every aggregate source fails", async () => {
		const failing = {
			getLiveInstallCount: async () => 0,
			getTotalSiteCount: async () => 0,
			getRecoveryRateStats: async () => {
				throw new Error("db down");
			},
			getFunnelMetrics: async () => {
				throw new Error("db down");
			},
			getLabelPrecision: async () => ({ labeled: 0, correct: 0 }),
		};
		const res = await createTestApp(failing).request("/api/admin/page", {
			headers: { authorization: "Bearer test-secret" },
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("\u2014");
		expect(body).toContain("Not enough data yet");
	});
});
