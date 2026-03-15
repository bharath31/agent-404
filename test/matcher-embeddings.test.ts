import { describe, it, expect } from "vitest";
import { findSuggestions } from "../src/engine/matcher.js";
import type { PageRecord } from "../src/types.js";

function makePage(
	url: string,
	title = "",
	opts: { headings?: string[]; embedding?: number[] } = {},
): PageRecord {
	return {
		id: 0,
		siteId: "test",
		url,
		title,
		description: "",
		headings: JSON.stringify(opts.headings || []),
		lastSeen: new Date().toISOString(),
		embedding: opts.embedding || undefined,
	};
}

// Generate a fake embedding — a 256d vector with a seed
function fakeEmbedding(seed: number): number[] {
	const vec = new Array(256);
	for (let i = 0; i < 256; i++) {
		vec[i] = Math.sin(seed * (i + 1) * 0.1) * 0.5;
	}
	// Normalize to unit vector
	const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
	return vec.map((v) => v / norm);
}

describe("findSuggestions with embeddings", () => {
	it("should use 4-signal weights when embeddings are available", () => {
		// Two pages: one lexically similar, one semantically similar via embedding
		const authEmb = fakeEmbedding(1);
		const billingEmb = fakeEmbedding(2);

		const pages = [
			makePage("https://example.com/docs/v3/auth", "Auth Guide", { embedding: authEmb }),
			makePage("https://example.com/docs/v3/billing", "Billing", { embedding: billingEmb }),
		];

		// Dead URL embedding is close to auth embedding
		const deadUrlEmb = authEmb.map((v) => v + 0.01); // slightly perturbed

		const results = findSuggestions("https://example.com/docs/v2/auth", pages, deadUrlEmb);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].url).toContain("/auth");
	});

	it("should boost semantically similar pages that are lexically different", () => {
		// Page with completely different URL but same embedding as dead URL
		const sharedEmb = fakeEmbedding(42);
		const differentEmb = fakeEmbedding(99);

		const pages = [
			makePage("https://example.com/guides/security/oauth", "OAuth Security Guide", {
				embedding: sharedEmb,
			}),
			makePage("https://example.com/docs/authentication", "Auth Docs", {
				embedding: differentEmb,
			}),
		];

		// Dead URL is /docs/v2/auth — lexically closer to /docs/authentication
		// but embedding matches /guides/security/oauth
		const results = findSuggestions("https://example.com/docs/v2/auth", pages, sharedEmb);

		// The oauth page should appear in results thanks to embedding signal
		const oauthResult = results.find((r) => r.url.includes("oauth"));
		expect(oauthResult).toBeDefined();
	});

	it("should fall back to 3-signal weights when page has no embedding", () => {
		const pages = [
			makePage("https://example.com/docs/v3/auth", "Auth Guide"), // no embedding
			makePage("https://example.com/docs/v3/billing", "Billing"), // no embedding
		];

		const deadUrlEmb = fakeEmbedding(1);
		const results = findSuggestions("https://example.com/docs/v2/auth", pages, deadUrlEmb);

		// Should still work using 3-signal matching
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].url).toContain("/auth");
	});

	it("should fall back to 3-signal weights when dead URL has no embedding", () => {
		const pages = [
			makePage("https://example.com/docs/v3/auth", "Auth Guide", {
				embedding: fakeEmbedding(1),
			}),
		];

		const results = findSuggestions("https://example.com/docs/v2/auth", pages, null);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].url).toContain("/auth");
	});
});
