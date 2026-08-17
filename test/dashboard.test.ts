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
		verified: true,
		verification: {
			dnsTxt: { name: "_agent404.example.com", value: "token-abc123" },
			wellKnown: {
				url: "https://example.com/.well-known/agent-404-verify.txt",
				body: "token-abc123",
			},
		},
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

	it("renders a single onboard agent button with a tailored prompt", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("btn-agent-onboard");
		expect(html).toContain("Copy AI setup prompt");
		expect(html).toContain("data-copy-agent-prompt");
		expect(html).toContain("example.com");
		expect(html).toContain("site-1");
		expect(html).toContain("pk_abc");
		expect(html).not.toContain("key_abc");
		// Only one dedicated "copy agent prompt" CTA outside the Agent Prompt tab itself —
		// the old quick-copy button and the alert-box CTA were removed as duplicates.
		expect(html.match(/data-copy-agent-prompt="/g)?.length).toBe(2);
	});

	it("renders an Agent Prompt integration tab and helper badges", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("tab-btn-agent");
		expect(html).toContain("Agent Prompt");
		expect(html).toContain("/skills/agent-404/SKILL.md");
		expect(html).toContain("Claude Code");
		expect(html).toContain("Cursor");
		expect(html).toContain("Windsurf");
	});

	it("points to the onboard agent button instead of duplicating a copy CTA in the warning alert box", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("Copy AI setup prompt");
		expect(html).not.toContain("alert-agent-row");
		expect(html).not.toContain("btn-alert-copy-prompt");
	});

	it("shows verification instructions and a Verify now action for unverified sites", () => {
		const html = dashboardHtml(data({ sites: [site({ verified: false, pageCount: 0 })] }));
		expect(html).toContain("Verification Needed");
		expect(html).toContain("_agent404.example.com");
		expect(html).toContain("token-abc123");
		expect(html).toContain("btn-verify-now");
		expect(html).toContain("Domain not verified");
		// The unrelated script/CORS troubleshooting message must not appear —
		// verification, not a broken beacon, is the cause here.
		expect(html).not.toContain("No beacons received");
	});

	it("shows a verified badge and no verification panel once the domain is verified", () => {
		const html = dashboardHtml(data({ sites: [site({ verified: true, pageCount: 3 })] }));
		expect(html).toContain("Domain Verified");
		expect(html).not.toContain("Verify Domain Ownership");
		expect(html).not.toContain("Domain not verified");
	});
});
