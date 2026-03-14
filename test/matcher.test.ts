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

	it("should rank similar paths higher", () => {
		const results = findSuggestions("https://example.com/docs/v3/billing", pages);
		expect(results[0].url).toBe("https://example.com/docs/v3/billing");
		expect(results[0].score).toBeGreaterThan(0.8);
	});
});
