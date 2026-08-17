import { describe, expect, it, beforeEach } from "vitest";
import {
	classifyUserAgent,
	recordSuggestionServedEvent,
	recordFollowOnFetch,
	getRecoveryRateStats,
	resetRecoveryEvents,
} from "../src/lib/recovery-tracker.js";

describe("Agent Recovery Rate Tracker (BAT-61)", () => {
	beforeEach(() => {
		resetRecoveryEvents();
	});

	it("correctly classifies user agent into crawler, browser agent, and human", () => {
		expect(classifyUserAgent("Mozilla/5.0 (compatible; ClaudeBot/1.0)")).toBe("crawler");
		expect(classifyUserAgent("Mozilla/5.0 (compatible; GPTBot/1.2)")).toBe("crawler");
		expect(classifyUserAgent("Mozilla/5.0 (compatible; PerplexityBot/1.0)")).toBe("crawler");
		expect(classifyUserAgent("curl/7.88.1")).toBe("browser_agent");
		expect(classifyUserAgent("axios/1.6.0")).toBe("browser_agent");
		expect(
			classifyUserAgent(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			),
		).toBe("human");
	});

	it("records suggestion and correlates follow-on fetch within 60s window", () => {
		const siteId = "site_123";
		const deadUrl = "https://example.com/docs/v2/auth";
		const suggested = [
			"https://example.com/docs/v3/auth",
			"https://example.com/docs/auth-overview",
		];

		// 1. 404 served to ClaudeBot
		recordSuggestionServedEvent(
			siteId,
			deadUrl,
			suggested,
			"Mozilla/5.0 (compatible; ClaudeBot/1.0)",
		);

		// 2. ClaudeBot fetches suggested URL within 60s
		const correlated = recordFollowOnFetch(siteId, "https://example.com/docs/v3/auth");

		expect(correlated).not.toBeNull();
		expect(correlated?.recovered).toBe(true);
		expect(correlated?.agentCategory).toBe("crawler");
		expect(correlated?.recoveredUrl).toBe("https://example.com/docs/v3/auth");

		const stats = getRecoveryRateStats(siteId);
		expect(stats.overall.totalSuggestions).toBe(1);
		expect(stats.overall.recoveredCount).toBe(1);
		expect(stats.overall.recoveryRate).toBe(1);
		expect(stats.byAgentCategory.crawler.recoveryRate).toBe(1);
	});

	it("does not correlate fetch for different URL or different site", () => {
		const siteId = "site_abc";
		recordSuggestionServedEvent(
			siteId,
			"https://example.com/dead",
			["https://example.com/suggested-1"],
			"curl/7.88.1",
		);

		// Non-matching URL
		const nonMatch = recordFollowOnFetch(siteId, "https://example.com/unrelated");
		expect(nonMatch).toBeNull();

		// Non-matching site
		const diffSite = recordFollowOnFetch("site_other", "https://example.com/suggested-1");
		expect(diffSite).toBeNull();

		const stats = getRecoveryRateStats(siteId);
		expect(stats.overall.totalSuggestions).toBe(1);
		expect(stats.overall.recoveredCount).toBe(0);
		expect(stats.overall.recoveryRate).toBe(0);
	});
});
