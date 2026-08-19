import { describe, expect, it } from "vitest";
import { deriveInstallState, PROBE_FRESH_MS } from "../src/lib/install-state.js";
import type { InstallStateInput } from "../src/lib/install-state.js";

const NOW = new Date("2026-08-19T12:00:00Z");

function input(overrides: Partial<InstallStateInput> = {}): InstallStateInput {
	return {
		verified: true,
		pageCount: 10,
		latestProbe: null,
		fourOhFoursLast30d: 0,
		recovery: { total: 0, recovered: 0, rate: 0 },
		now: NOW,
		...overrides,
	};
}

function freshProbe(verdict: "recovered_404" | "unrecovered_404" | "non_404" | "error") {
	return {
		probedAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
		verdict,
		status: verdict === "non_404" ? 200 : 404,
	};
}

function staleProbe(verdict: "recovered_404" | "unrecovered_404" | "non_404" | "error") {
	const age = PROBE_FRESH_MS + 60 * 60 * 1000; // just past the freshness window
	return {
		probedAt: new Date(NOW.getTime() - age).toISOString(),
		verdict,
		status: verdict === "non_404" ? 200 : 404,
	};
}

describe("deriveInstallState", () => {
	it("unverified site: verification is the only open step", () => {
		const v = deriveInstallState(input({ verified: false, pageCount: 0 }));
		expect(v.stateId).toBe("unverified");
		expect(v.badge).toBe("Verify domain");
		expect(v.badgeTone).toBe("warning");
		expect(v.statusLine).toContain("Verify domain ownership");
		const verify = v.steps.find((s) => s.id === "verify")!;
		const index = v.steps.find((s) => s.id === "index")!;
		expect(verify.done).toBe(false);
		expect(verify.tone).toBe("pending");
		expect(index.hint).toBe("After verification");
	});

	it("verified site with no pages: indexing state", () => {
		const v = deriveInstallState(input({ pageCount: 0 }));
		expect(v.stateId).toBe("indexing");
		expect(v.badge).toBe("Indexing");
		expect(v.statusLine).toContain("indexing pages from your sitemap");
		expect(v.steps.find((s) => s.id === "index")!.hint).toBe("Awaiting sitemap crawl");
	});

	it("fresh recovered probe with no 404 traffic yet: install live", () => {
		const v = deriveInstallState(input({ latestProbe: freshProbe("recovered_404") }));
		expect(v.stateId).toBe("install_live");
		expect(v.badge).toBe("Install live");
		expect(v.badgeTone).toBe("success");
		expect(v.statusLine).toContain("Live check passed");
		expect(v.steps.find((s) => s.id === "live_check")!.done).toBe(true);
		expect(v.steps.find((s) => s.id === "catch_404s")!.done).toBe(false);
	});

	it("fresh recovered probe with 404 traffic: serving", () => {
		const v = deriveInstallState(
			input({ latestProbe: freshProbe("recovered_404"), fourOhFoursLast30d: 12 }),
		);
		expect(v.stateId).toBe("serving");
		expect(v.badge).toBe("Serving 404s");
		expect(v.statusLine).toContain("12 404s caught in the last 30 days");
	});

	it("recoveries present: recovering state with the fraction in the line", () => {
		const v = deriveInstallState(
			input({
				latestProbe: freshProbe("recovered_404"),
				fourOhFoursLast30d: 12,
				recovery: { total: 8, recovered: 3, rate: 0.375 },
			}),
		);
		expect(v.stateId).toBe("recovering");
		expect(v.badge).toBe("Recovering agents");
		expect(v.statusLine).toContain("3 of 8 served suggestions were followed through");
		expect(v.steps.find((s) => s.id === "recovery")!.done).toBe(true);
	});

	it("fresh unrecovered probe: install broken, loud about it", () => {
		const v = deriveInstallState(input({ latestProbe: freshProbe("unrecovered_404") }));
		expect(v.stateId).toBe("install_broken");
		expect(v.badge).toBe("Install not detected");
		expect(v.badgeTone).toBe("danger");
		expect(v.statusLine).toContain("bare 404 to ClaudeBot");
		const check = v.steps.find((s) => s.id === "live_check")!;
		expect(check.done).toBe(false);
		expect(check.tone).toBe("problem");
		expect(check.hint).toBe("Bare 404 returned");
	});

	it("fresh non-404 probe: soft-404 state", () => {
		const v = deriveInstallState(input({ latestProbe: freshProbe("non_404") }));
		expect(v.stateId).toBe("soft_404");
		expect(v.badge).toBe("Soft-404 site");
		expect(v.statusLine).toContain("Return a real 404 status");
		expect(v.steps.find((s) => s.id === "live_check")!.hint).toBe("Site returns HTTP 200");
	});

	it("fresh error probe: check failed", () => {
		const v = deriveInstallState(input({ latestProbe: freshProbe("error") }));
		expect(v.stateId).toBe("probe_failed");
		expect(v.badge).toBe("Check failed");
		expect(v.statusLine).toContain("couldn't reach your site");
		expect(v.steps.find((s) => s.id === "live_check")!.hint).toBe("Could not reach site");
	});

	it("no probe: install untested", () => {
		const v = deriveInstallState(input());
		expect(v.stateId).toBe("install_unknown");
		expect(v.badge).toBe("Install untested");
		expect(v.badgeTone).toBe("warning");
		expect(v.statusLine).toContain("Run a live check");
	});

	it("stale probe is treated as untested (re-check prompted)", () => {
		const v = deriveInstallState(input({ latestProbe: staleProbe("recovered_404") }));
		expect(v.stateId).toBe("install_unknown");
		expect(v.steps.find((s) => s.id === "live_check")!.hint).toBe("Re-check below");
	});

	it("broken state wins over 404 traffic (the live probe is the stronger evidence)", () => {
		const v = deriveInstallState(
			input({
				latestProbe: freshProbe("unrecovered_404"),
				fourOhFoursLast30d: 50,
				recovery: { total: 40, recovered: 10, rate: 0.25 },
			}),
		);
		expect(v.stateId).toBe("install_broken");
	});

	it("always renders the five lifecycle steps in order", () => {
		const v = deriveInstallState(input({ latestProbe: freshProbe("recovered_404") }));
		expect(v.steps.map((s) => s.id)).toEqual([
			"verify",
			"index",
			"live_check",
			"catch_404s",
			"recovery",
		]);
	});
});