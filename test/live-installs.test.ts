import { describe, expect, it } from "vitest";
import {
	countLiveInstalls,
	isLiveInstall,
	LIVE_INSTALL_WINDOW_DAYS,
	type SiteActivitySummary,
} from "../src/lib/live-installs.js";
import { isTestDomain } from "../src/lib/disposable-smoke-domain.js";

function site(overrides: Partial<SiteActivitySummary> = {}): SiteActivitySummary {
	return {
		domain: "customer.com",
		hasRecentPage: true,
		hasRecentSuggestion: true,
		...overrides,
	};
}

describe("isTestDomain", () => {
	it("flags every example.com subdomain (RFC 2606 test convention used by CI)", () => {
		expect(isTestDomain("smoke-1755300000000.example.com")).toBe(true);
		expect(isTestDomain("browser-test-abc123.example.com")).toBe(true);
		expect(isTestDomain("e2e-run-42.example.com")).toBe(true);
		expect(isTestDomain("test.example.com")).toBe(true);
		expect(isTestDomain("EXAMPLE.COM".toLowerCase())).toBe(false); // bare apex, not a subdomain
	});

	it("flags legacy smoke- prefixed domains regardless of TLD", () => {
		expect(isTestDomain("smoke-legacy.example.org")).toBe(true);
	});

	it("is case-insensitive", () => {
		expect(isTestDomain("Smoke-99.Example.Com")).toBe(true);
	});

	it("does not flag real customer domains", () => {
		expect(isTestDomain("developers.cloudflare.com")).toBe(false);
		expect(isTestDomain("acme.io")).toBe(false);
	});
});

describe("isLiveInstall (BAT-62 definition)", () => {
	it("counts a site with both a recent page and a recent suggestion", () => {
		expect(isLiveInstall(site())).toBe(true);
	});

	it("does NOT count a registered domain with no indexed pages", () => {
		// This is the exact failure mode BAT-62 exists to catch: a `sites` row
		// with nothing behind it still looked like growth under the old metric.
		expect(isLiveInstall(site({ hasRecentPage: false, hasRecentSuggestion: false }))).toBe(false);
	});

	it("does NOT count a site that indexed pages but never served a suggestion", () => {
		// e.g. the CORS-failure scenario: the beacon works, /api/suggest never
		// gets called successfully from the customer's 404 page.
		expect(isLiveInstall(site({ hasRecentPage: true, hasRecentSuggestion: false }))).toBe(false);
	});

	it("does NOT count a site that served a suggestion but has no indexed pages", () => {
		expect(isLiveInstall(site({ hasRecentPage: false, hasRecentSuggestion: true }))).toBe(false);
	});

	it("excludes CI/test domains even when both signals are present", () => {
		expect(isLiveInstall(site({ domain: "smoke-123.example.com" }))).toBe(false);
		expect(isLiveInstall(site({ domain: "browser-test-x.example.com" }))).toBe(false);
	});
});

describe("countLiveInstalls", () => {
	it("matches the manual DB query scenario from the ticket: a handful live out of many registered", () => {
		const sites: SiteActivitySummary[] = [
			site({ domain: "real-customer-1.com" }),
			site({ domain: "real-customer-2.com" }),
			site({ domain: "real-customer-3.com", hasRecentSuggestion: false }), // registered, not working
			site({ domain: "smoke-1.example.com" }), // CI artifact
			site({ domain: "smoke-2.example.com" }), // CI artifact
			site({ domain: "abandoned-signup.com", hasRecentPage: false, hasRecentSuggestion: false }),
		];
		expect(countLiveInstalls(sites)).toBe(2);
	});

	it("returns 0 when nothing is actually working — the metric must be able to report zero", () => {
		const sites: SiteActivitySummary[] = [
			site({ hasRecentSuggestion: false }),
			site({ hasRecentPage: false }),
		];
		expect(countLiveInstalls(sites)).toBe(0);
	});

	it("returns 0 for an empty site list", () => {
		expect(countLiveInstalls([])).toBe(0);
	});
});

describe("LIVE_INSTALL_WINDOW_DAYS", () => {
	it("is the 7-day window specified in BAT-62", () => {
		expect(LIVE_INSTALL_WINDOW_DAYS).toBe(7);
	});
});
