import { describe, expect, it } from "vitest";
import { dashboardHtml } from "../src/dashboard.js";
import type { DashboardData } from "../src/types.js";

const emptyQuality = {
	last24h: 0,
	last7d: 0,
	last30d: 0,
	matchTypeDistribution: { moved: 0, similar: 0, related: 0 },
};

function data(overrides: Partial<DashboardData> = {}): DashboardData {
	return {
		domain: "example.com",
		pageCount: 0,
		suggestionsServed: 0,
		lastBeaconAt: null,
		recentLogs: [],
		matchQuality: emptyQuality,
		...overrides,
	};
}

describe("dashboardHtml", () => {
	it("shows a first-class warning when no beacons have been received", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("No beacons received");
		expect(html).toContain("role=\"alert\"");
		expect(html).toContain("/api/install/status");
	});

	it("omits the warning once pages are indexed", () => {
		const html = dashboardHtml(data({ pageCount: 3, lastBeaconAt: new Date().toISOString() }));
		expect(html).not.toContain("No beacons received");
	});
});
