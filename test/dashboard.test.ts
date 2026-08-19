import { describe, expect, it } from "vitest";
import { dashboardHtml } from "../src/dashboard.js";
import { deriveInstallState } from "../src/lib/install-state.js";
import type { DashboardData, DashboardSiteData, InstallProbe } from "../src/types.js";
import { CANONICAL_SCRIPT_URL } from "../src/config.js";

const emptyQuality = {
	last24h: 0,
	last7d: 0,
	last30d: 0,
	matchTypeDistribution: { moved: 0, similar: 0, related: 0 },
};

function probe(overrides: Partial<InstallProbe> = {}): InstallProbe {
	return {
		id: "probe-1",
		siteId: "site-1",
		probedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
		probePath: "/agent404-probe-abc123",
		status: 404,
		verdict: "unrecovered_404",
		hasLinkHeaders: false,
		hasJsonLd: false,
		linkHeader: null,
		summary: "ClaudeBot receives a bare 404 with no recovery signals.",
		source: "manual",
		...overrides,
	};
}

function site(overrides: Partial<DashboardSiteData> = {}): DashboardSiteData {
	const base: Omit<DashboardSiteData, "installState"> = {
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
		latestProbe: null,
		recentRecoveryEvents: [],
		recovery: { total: 0, recovered: 0, rate: 0 },
		...overrides,
	};
	return {
		...base,
		installState:
			overrides.installState ??
			deriveInstallState({
				verified: base.verified,
				pageCount: base.pageCount,
				latestProbe: base.latestProbe,
				fourOhFoursLast30d: base.matchQuality.last30d,
				recovery: base.recovery,
			}),
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
	it("explains what the product does in the page subtitle", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("puts the closest real page inside the 404 response");
	});

	it("shows a lifecycle badge and status line on every site card", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("site-status-line");
		expect(html).toContain("lifecycle-strip");
		expect(html).toContain("step-item");
		// Five lifecycle steps, in order.
		expect(html).toContain("Verify domain");
		expect(html).toContain("Index pages");
		expect(html).toContain("Live 404 check");
		expect(html).toContain("Catch 404s");
		expect(html).toContain("Agent recovery");
	});

	it("verified site with no pages: indexing state, not a broken-install alarm", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("badge-neutral");
		expect(html).toContain("> Indexing");
		expect(html).toContain("indexing pages from your sitemap");
		// The old alarm copy is gone.
		expect(html).not.toContain("No beacons received");
		// Live check is pointless before anything is indexed.
		expect(html).not.toContain('class="btn btn-secondary btn-live-check"');
	});

	it("fresh bare-404 probe: install not detected, with the raw exchange as evidence", () => {
		const html = dashboardHtml(
			data({
				sites: [
					site({
						pageCount: 19,
						latestProbe: probe(),
					}),
				],
			}),
		);
		expect(html).toContain("Install not detected");
		expect(html).toContain("tone-danger");
		expect(html).toContain("bare 404 to ClaudeBot");
		// Terminal evidence block.
		expect(html).toContain('class="btn btn-secondary btn-live-check"');
		expect(html).toContain("curl -sI");
		expect(html).toContain("claudebot@example.com");
		expect(html).toContain("no Link header, no JSON-LD");
		expect(html).toContain("Bare 404 — no recovery");
	});

	it("fresh recovered probe: install live, terminal shows the Link header", () => {
		const html = dashboardHtml(
			data({
				sites: [
					site({
						pageCount: 19,
						latestProbe: probe({
							verdict: "recovered_404",
							hasLinkHeaders: true,
							linkHeader: `</writing/mcp>; rel="alternate"`,
							summary: "Site provides structured recovery information in the response.",
						}),
					}),
				],
			}),
		);
		expect(html).toContain("Install live");
		expect(html).toContain("Recovery served");
		expect(html).toContain('link: &lt;/writing/mcp&gt;; rel=&quot;alternate&quot;');
		expect(html).toContain("Live check passed");
	});

	it("unverified site: verification guidance, no live check panel", () => {
		const html = dashboardHtml(data({ sites: [site({ verified: false, pageCount: 0 })] }));
		expect(html).toContain("Verify domain");
		expect(html).toContain("Verify Domain Ownership");
		expect(html).toContain("_agent404.example.com");
		expect(html).toContain("token-abc123");
		expect(html).toContain("btn-verify-now");
		expect(html).toContain("Verify domain ownership to start indexing");
		// Live check is hidden until the domain is verified and indexed.
		expect(html).not.toContain('class="btn btn-secondary btn-live-check"');
	});

	it("shows a verified badge and no verification panel once the domain is verified", () => {
		const html = dashboardHtml(data({ sites: [site({ verified: true, pageCount: 3 })] }));
		expect(html).toContain("Domain Verified");
		expect(html).not.toContain("Verify Domain Ownership");
	});

	it("renders the stat tiles with plain-language hints", () => {
		const html = dashboardHtml(
			data({
				sites: [
					site({
						pageCount: 42,
						suggestionsServed: 7,
						matchQuality: {
							last24h: 1,
							last7d: 3,
							last30d: 7,
							matchTypeDistribution: { moved: 1, similar: 4, related: 2 },
						},
					}),
				],
			}),
		);
		expect(html).toContain("404s · Last 30 Days");
		expect(html).toContain("Agents Recovered");
		expect(html).toContain("3 in the last 7 days");
		// No recovery data yet: em-dash, not a fake zero.
		expect(html).toContain("\u2014");
	});

	it("shows the recovery rate once data exists", () => {
		const html = dashboardHtml(
			data({
				sites: [
					site({
						pageCount: 42,
						recovery: { total: 8, recovered: 3, rate: 0.375 },
						latestProbe: probe({ verdict: "recovered_404", hasLinkHeaders: true }),
					}),
				],
			}),
		);
		expect(html).toContain("Recovering agents");
		expect(html).toContain("38%");
		expect(html).toContain("3 of 8 served suggestions followed through");
	});

	it("interprets the resolution bar when section fallbacks dominate", () => {
		const html = dashboardHtml(
			data({
				sites: [
					site({
						pageCount: 26,
						matchQuality: {
							last24h: 0,
							last7d: 26,
							last30d: 26,
							matchTypeDistribution: { moved: 0, similar: 3, related: 26 },
						},
					}),
				],
			}),
		);
		expect(html).toContain("dist-note");
		expect(html).toContain("section pages");
		expect(html).toContain("llms.txt");
	});

	it("renders the recovery-driven activity table with agent and outcome", () => {
		const html = dashboardHtml(
			data({
				sites: [
					site({
						pageCount: 19,
						latestProbe: probe({ verdict: "recovered_404", hasLinkHeaders: true }),
						recentRecoveryEvents: [
							{
								id: "1",
								siteId: "site-1",
								deadUrl: "https://example.com/writing/old-post",
								suggestedUrls: ["https://example.com/writing/mcp"],
								agentCategory: "crawler",
								userAgent: "Mozilla/5.0 (compatible; ClaudeBot/1.0)",
								createdAt: new Date(Date.now() - 3600_000).toISOString(),
								recovered: true,
								recoveredUrl: "https://example.com/writing/mcp",
								recoveryLatencyMs: 4200,
							},
							{
								id: "2",
								siteId: "site-1",
								deadUrl: "https://example.com/docs/billing",
								suggestedUrls: ["https://example.com/docs/pricing"],
								agentCategory: "crawler",
								userAgent: "GPTBot/1.0",
								createdAt: new Date(Date.now() - 7200_000).toISOString(),
								recovered: false,
							},
						],
					}),
				],
			}),
		);
		expect(html).toContain("outcome-yes");
		expect(html).toContain("\u2713 followed in 4.2s");
		expect(html).toContain("outcome-no");
		expect(html).toContain("ClaudeBot");
		expect(html).toContain("GPTBot");
	});

	it("falls back to the legacy table when no recovery events exist", () => {
		const html = dashboardHtml(
			data({
				sites: [
					site({
						pageCount: 19,
						recentLogs: [
							{
								deadUrl: "https://example.com/writing/old",
								suggestedUrls: ["https://example.com/writing"],
								scores: "[0.55]",
								matchTypes: '["similar"]',
								createdAt: new Date().toISOString(),
							},
						],
					}),
				],
			}),
		);
		expect(html).toContain("Dead URL Hit");
		expect(html).toContain("example.com/writing/old");
		expect(html).not.toContain("outcome-pill outcome-yes");
	});

	it("renames the sandbox to a matcher dry run with no stale default value", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("Matcher dry run");
		expect(html).toContain("doesn't touch your live site");
		expect(html).not.toContain('value="/v1/authentication"');
	});

	it("uses ?? (not ||) in the Next.js snippet and explains the public key", () => {
		const html = dashboardHtml(data());
		expect(html).toContain('?? &quot;pk_abc&quot;');
		expect(html).not.toContain('|| &quot;pk_abc&quot;');
		expect(html).toContain("safe to commit");
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

	it("live-check button resolves the grid via its block, not as an ancestor", () => {
		const html = dashboardHtml(
			data({ sites: [site({ pageCount: 19, latestProbe: probe() })] }),
		);
		// The button sits in .section-title-row; the grid is a sibling of that
		// row inside the same .live-check-block. It must be resolved through the
		// enclosing block — never as an ancestor of the button, which would be
		// null (closest('.live-check-grid') walks up and misses the sibling).
		expect(html).toContain("const block = btn.closest('.live-check-block');");
		expect(html).toContain(
			"const grid = block ? block.querySelector('.live-check-grid') : null;",
		);
		expect(html).not.toContain("btn.closest('.live-check-grid')");
	});

	it("keeps lifecycle step text inside its card instead of overflowing the border", () => {
		const html = dashboardHtml(data());
		// The strip items may wrap their contents: long hints drop onto their
		// own line inside the card, and labels/hints can shrink so text never
		// bleeds past the bordered .step-item at narrow widths.
		const itemBlock = html.slice(html.indexOf(".step-item {"), html.indexOf(".step-label {"));
		expect(itemBlock).toContain("flex-wrap: wrap;");
		// The label rule no longer forces nowrap — label may wrap and shrink.
		const labelBlock = html.slice(html.indexOf(".step-label {"), html.indexOf(".step-marker {"));
		expect(labelBlock).toContain("min-width: 0;");
		expect(labelBlock).not.toContain("white-space: nowrap;");
		// Same for the hint — no forced nowrap, must be able to wrap/shrink.
		const hintBlock = html.slice(html.indexOf(".step-hint {"), html.indexOf(".step-item.step-ok {"));
		expect(hintBlock).toContain("min-width: 0;");
		expect(hintBlock).toContain("overflow-wrap: anywhere;");
		expect(hintBlock).not.toContain("white-space: nowrap;");
	});

	it("points to the onboard agent button instead of duplicating a copy CTA in the warning alert box", () => {
		const html = dashboardHtml(data());
		expect(html).toContain("Copy AI setup prompt");
		expect(html).not.toContain("alert-agent-row");
		expect(html).not.toContain("btn-alert-copy-prompt");
	});
});