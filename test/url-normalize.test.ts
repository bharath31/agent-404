import { describe, expect, it } from "vitest";
import { normalizeDeadUrl, pathHint } from "../src/engine/url-normalize.js";

describe("normalizeDeadUrl", () => {
	it("strips query, hash, and trailing slash", () => {
		expect(normalizeDeadUrl("https://Docs.Example.com/v2/auth/?q=1#x")).toBe(
			"https://docs.example.com/v2/auth",
		);
	});

	it("drops query strings so /product?id=1 and /product?id=2 share a cache key", () => {
		expect(normalizeDeadUrl("https://example.com/product?id=1")).toBe(
			normalizeDeadUrl("https://example.com/product?id=2"),
		);
		expect(normalizeDeadUrl("https://example.com/product?id=1")).toBe("https://example.com/product");
	});

	it("extracts a lexical path hint", () => {
		expect(pathHint("https://example.com/docs/v2/authentication")).toBe("authentication");
	});
});
