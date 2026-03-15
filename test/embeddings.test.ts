import { describe, it, expect } from "vitest";
import { buildEmbeddingText } from "../src/engine/embeddings.js";
import { cosineSimilarity } from "../src/engine/matcher.js";

describe("buildEmbeddingText", () => {
	it("should combine path segments, title, and description", () => {
		const text = buildEmbeddingText({
			url: "https://example.com/docs/v3/auth",
			title: "Authentication Guide",
			description: "How to set up auth",
		});
		expect(text).toBe("docs v3 auth — Authentication Guide — How to set up auth");
	});

	it("should replace dashes and underscores in path segments", () => {
		const text = buildEmbeddingText({
			url: "https://example.com/getting-started/api_reference",
			title: "API Ref",
			description: "",
		});
		expect(text).toBe("getting started api reference — API Ref");
	});

	it("should handle missing title and description", () => {
		const text = buildEmbeddingText({
			url: "https://example.com/docs/auth",
			title: "",
			description: "",
		});
		expect(text).toBe("docs auth");
	});

	it("should handle invalid URLs gracefully", () => {
		const text = buildEmbeddingText({
			url: "not-a-url",
			title: "Page Title",
			description: "",
		});
		expect(text).toBe("not-a-url — Page Title");
	});
});

describe("cosineSimilarity", () => {
	it("should return 1 for identical vectors", () => {
		const v = [1, 2, 3, 4];
		expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
	});

	it("should return 0 for orthogonal vectors", () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
	});

	it("should return -1 for opposite vectors", () => {
		expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 5);
	});

	it("should handle zero vectors", () => {
		expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
	});

	it("should handle different length vectors", () => {
		expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
	});

	it("should handle empty vectors", () => {
		expect(cosineSimilarity([], [])).toBe(0);
	});

	it("should compute similarity for similar vectors", () => {
		const a = [0.8, 0.6, 0.1];
		const b = [0.7, 0.65, 0.15];
		const sim = cosineSimilarity(a, b);
		expect(sim).toBeGreaterThan(0.99);
	});
});
