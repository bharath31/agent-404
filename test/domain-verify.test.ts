import { describe, it, expect, vi, beforeEach } from "vitest";
import { proveDomainOwnership, tokenMatches } from "../src/engine/domain-verify.js";

describe("tokenMatches", () => {
	it("accepts exact and whitespace-delimited tokens", () => {
		expect(tokenMatches("abc", "abc")).toBe(true);
		expect(tokenMatches("  abc  ", "abc")).toBe(true);
		expect(tokenMatches("foo abc bar", "abc")).toBe(true);
	});

	it("rejects substrings", () => {
		expect(tokenMatches("xabcy", "abc")).toBe(false);
		expect(tokenMatches("prefix-abc", "abc")).toBe(false);
	});
});

describe("proveDomainOwnership", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("ignores well-known 302 redirects (SSRF)", async () => {
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			expect((init as RequestInit | undefined)?.redirect).not.toBe("follow");
			const url = String(input);
			if (url.includes("/.well-known/")) {
				return new Response("stolen-token", {
					status: 302,
					headers: { Location: "http://127.0.0.1/" },
				});
			}
			return new Response("{}", { status: 200 });
		});
		await expect(proveDomainOwnership("evil.example", "stolen-token")).resolves.toBe(false);
	});
});
