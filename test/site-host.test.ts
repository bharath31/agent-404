import { describe, expect, it } from "vitest";
import { hostBelongsToDomain, urlBelongsToSite } from "../src/lib/site-host.js";
import { isDisposableSmokeDomain } from "../src/lib/disposable-smoke-domain.js";

describe("hostBelongsToDomain", () => {
	it("matches the registered domain exactly", () => {
		expect(hostBelongsToDomain("example.com", "example.com")).toBe(true);
	});

	it("matches explicit subdomains, not string suffixes", () => {
		expect(hostBelongsToDomain("docs.example.com", "example.com")).toBe(true);
		expect(hostBelongsToDomain("www.example.com", "example.com")).toBe(true);
		expect(hostBelongsToDomain("notexample.com", "example.com")).toBe(false);
		expect(hostBelongsToDomain("example.com.evil.com", "example.com")).toBe(false);
	});

	it("rejects unrelated hosts on URLs", () => {
		expect(urlBelongsToSite("https://example.com/x", "example.com")).toBe(true);
		expect(urlBelongsToSite("https://evil.com/x", "example.com")).toBe(false);
		expect(urlBelongsToSite("javascript:alert(1)", "example.com")).toBe(false);
	});
});

describe("isDisposableSmokeDomain", () => {
	it("matches CI smoke hosts only", () => {
		expect(isDisposableSmokeDomain("smoke-1786853393592.example.com")).toBe(true);
		expect(isDisposableSmokeDomain("new.example.com")).toBe(false);
		expect(isDisposableSmokeDomain("smoke-abc.example.com")).toBe(false);
		expect(isDisposableSmokeDomain("smoke-1.example.net")).toBe(false);
	});
});
