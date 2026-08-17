import { describe, expect, it } from "vitest";
import { dashboardHtml } from "../src/dashboard.js";
import type { DashboardData, DashboardSiteData } from "../src/types.js";
import { CANONICAL_SCRIPT_URL } from "../src/config.js";

const emptyQuality = {
	last24h: 0,
	last7d: 0,
	last30d: 0,
	matchTypeDistribution: { moved: 0, similar: 0, related: 0 },
};

function site(overrides: Partial<DashboardSiteData> = {}): DashboardSiteData {
	return {
		id: "site-1",
		domain: "example.com",
		apiKey: "key_abc",
		publicKey: "pk_abc",
		pageCount: 0,
		suggestionsServed: 0,
		lastBeaconAt: null,
		recentLogs: [],
		matchQuality: emptyQuality,
		...overrides,
	};
}

function data(overrides: Partial<DashboardData> = {}): DashboardData {
	return {
		email: "owner@example.com",
		sites: [site()],
		claimDomain: null,
		pendingDomain: null,
		notice: null,
		...overrides,
	};
}

describe("dashboardHtml", () => {
	it("shows a first-class warning when no beacons have been received", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("No beacons received");
		expect(html).toContain('role="alert"');
		expect(html).toContain("/api/install/status");
	});

	it("omits the warning once pages are indexed", () => {
		const html = dashboardHtml(data({ sites: [site({ pageCount: 3, lastBeaconAt: new Date().toISOString() })] }));
		expect(html).not.toContain("No beacons received");
	});

	it("shows an escaped script tag with site id and public key, never the secret key", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("data-site-id");
		expect(html).toContain("data-public-key");
		expect(html).toContain("site-1");
		expect(html).toContain("pk_abc");
		expect(html).not.toContain("data-api-key");
		expect(html).not.toContain("key_abc");
		expect(html).toContain(CANONICAL_SCRIPT_URL);
		expect(html).not.toContain("<script\n  src=");
	});

	it("renders an onboard agent pill button with agent icons and tailored prompt", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("btn-agent-onboard");
		expect(html).toContain("Onboard your agent to agent-404");
		expect(html).toContain("data-copy-agent-prompt");
		expect(html).toContain("agent-logos-cluster");
		expect(html).toContain("agent-logo-claude");
		expect(html).toContain("agent-logo-terminal");
		expect(html).toContain("agent-logo-cursor");
		expect(html).toContain("agent-logo-editor");
		expect(html).toContain("example.com");
		expect(html).toContain("site-1");
		expect(html).toContain("pk_abc");
		expect(html).not.toContain("key_abc");
	});

	it("renders an Agent Prompt integration tab and helper badges", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("tab-btn-agent");
		expect(html).toContain("Agent Prompt");
		expect(html).toContain("/skills/agent-404/SKILL.md");
		expect(html).toContain("Claude Code");
		expect(html).toContain("Cursor");
		expect(html).toContain("Windsurf");
		expect(html).toContain("btn-copy-agent-quick");
	});

	it("renders a copy agent prompt CTA in the warning alert box when awaiting beacons", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("alert-agent-row");
		expect(html).toContain("btn-alert-copy-prompt");
	});
});
