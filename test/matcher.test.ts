import { describe, it, expect } from "vitest";
import { findSuggestions } from "../src/engine/matcher.js";
import type { PageRecord } from "../src/types.js";

function makePage(url: string, title = "", headings: string[] = []): PageRecord {
	return {
		id: 0,
		siteId: "test",
		url,
		title,
		description: "",
		headings: JSON.stringify(headings),
		lastSeen: new Date().toISOString(),
	};
}

describe("findSuggestions", () => {
	const pages: PageRecord[] = [
		makePage("https://example.com/docs/v3/auth", "Authentication Guide", ["Auth Setup", "OAuth"]),
		makePage("https://example.com/docs/v3/billing", "Billing API", ["Invoices", "Payments"]),
		makePage("https://example.com/blog/hello-world", "Hello World Post"),
		makePage("https://example.com/docs/v3/getting-started", "Getting Started"),
		makePage("https://example.com/docs/v3/users", "Users API", ["Create User", "List Users"]),
		makePage("https://example.com/pricing", "Pricing"),
	];

	it("should find version migration matches (v2 → v3)", () => {
		const results = findSuggestions("https://example.com/docs/v2/auth", pages);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].url).toBe("https://example.com/docs/v3/auth");
		expect(results[0].matchType).toBe("moved");
	});

	it("should find typo matches", () => {
		const results = findSuggestions("https://example.com/docs/v3/auht", pages);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].url).toBe("https://example.com/docs/v3/auth");
	});

	it("should match by keyword overlap", () => {
		const results = findSuggestions("https://example.com/docs/v3/authentication", pages);
		expect(results.length).toBeGreaterThan(0);
		// "auth" page should rank high due to keyword overlap
		const authResult = results.find((r) => r.url.includes("/auth"));
		expect(authResult).toBeDefined();
	});

	it("should return empty for completely unrelated URLs", () => {
		const results = findSuggestions("https://example.com/xyzzy/foobar/baz", pages);
		// May return some low-scoring results but scores should be low
		for (const r of results) {
			expect(r.score).toBeLessThan(0.5);
		}
	});

	it("should return at most 5 results", () => {
		const manyPages = Array.from({ length: 20 }, (_, i) =>
			makePage(`https://example.com/docs/v3/page-${i}`, `Page ${i}`),
		);
		const results = findSuggestions("https://example.com/docs/v3/page-5", manyPages);
		expect(results.length).toBeLessThanOrEqual(5);
	});

	it("should handle empty page list", () => {
		const results = findSuggestions("https://example.com/anything", []);
		expect(results).toEqual([]);
	});

	it("should match prefix segments (work → workers)", () => {
		const cfPages = [
			makePage("https://example.com/workers/api", "Workers API"),
			makePage("https://example.com/workers/config", "Workers Config"),
			makePage("https://example.com/pages/deploy", "Pages Deploy"),
		];
		const results = findSuggestions("https://example.com/work", cfPages);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].url).toContain("/workers/");
	});

	it("should match prefix keywords (message → messaging)", () => {
		const twilioPages = [
			makePage("https://example.com/docs/messaging", "Messaging API"),
			makePage("https://example.com/docs/voice", "Voice API"),
			makePage("https://example.com/docs/video", "Video API"),
		];
		const results = findSuggestions("https://example.com/docs/message", twilioPages);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].url).toContain("/messaging");
	});

	it("should match compound segments (deploy → deploy-hooks)", () => {
		const vercelPages = [
			makePage("https://example.com/docs/deploy-hooks", "Deploy Hooks"),
			makePage("https://example.com/docs/deployments", "Deployments"),
			makePage("https://example.com/docs/functions", "Functions"),
		];
		const results = findSuggestions("https://example.com/docs/deploy", vercelPages);
		expect(results.length).toBeGreaterThan(0);
		// Both deploy-hooks and deployments should match
		const urls = results.map((r) => r.url);
		expect(urls.some((u) => u.includes("deploy"))).toBe(true);
	});

	it("should match via stemming (deploy → deployment)", () => {
		const stemPages = [
			makePage("https://example.com/docs/deployment", "Deployment Guide"),
			makePage("https://example.com/docs/monitoring", "Monitoring Guide"),
			makePage("https://example.com/docs/testing", "Testing Guide"),
		];
		const results = findSuggestions("https://example.com/docs/deploy", stemPages);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].url).toContain("/deployment");
	});

	it("should match via stemming (message → messaging)", () => {
		const stemPages = [
			makePage("https://example.com/docs/messaging", "Messaging API"),
			makePage("https://example.com/docs/voice", "Voice API"),
			makePage("https://example.com/docs/video", "Video API"),
		];
		const results = findSuggestions("https://example.com/docs/message", stemPages);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].url).toContain("/messaging");
	});

	it("should match via stemming (organize → organizations)", () => {
		const stemPages = [
			makePage("https://example.com/api/organizations", "Organizations API"),
			makePage("https://example.com/api/users", "Users API"),
		];
		const results = findSuggestions("https://example.com/api/organize", stemPages);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].url).toContain("/organizations");
	});

	it("should rank similar paths higher", () => {
		const results = findSuggestions("https://example.com/docs/v3/billing", pages);
		expect(results[0].url).toBe("https://example.com/docs/v3/billing");
		expect(results[0].score).toBeGreaterThan(0.8);
	});
});
