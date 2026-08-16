import { describe, it, expect, vi, beforeEach } from "vitest";
import { proveDomainOwnership, tokenMatches } from "../src/engine/domain-verify.js";

function mockDnsAndWellKnown(opts: {
	a?: string;
	wellKnownStatus?: number;
	wellKnownBody?: string;
	txt?: string;
}) {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		expect((init as RequestInit | undefined)?.redirect).not.toBe("follow");
		const url = String(input);
		if (url.includes("type=A")) {
			return new Response(JSON.stringify({ Answer: [{ data: opts.a ?? "93.184.216.34" }] }), {
				status: 200,
			});
		}
		if (url.includes("type=AAAA")) {
			return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
		}
		if (url.includes("type=TXT") && opts.txt) {
			return new Response(JSON.stringify({ Answer: [{ data: `"${opts.txt}"` }] }), { status: 200 });
		}
		if (url.includes("/.well-known/")) {
			return new Response(opts.wellKnownBody ?? "", { status: opts.wellKnownStatus ?? 404 });
		}
		return new Response("{}", { status: 200 });
	});
}

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
		mockDnsAndWellKnown({ wellKnownStatus: 302, wellKnownBody: "stolen-token" });
		await expect(proveDomainOwnership("evil.example", "stolen-token")).resolves.toBe(false);
	});

	it("does not fetch well-known when DNS points at a private IP", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes("/.well-known/")) {
				throw new Error("well-known must not be fetched for private A records");
			}
			if (url.includes("type=A")) {
				return new Response(JSON.stringify({ Answer: [{ data: "169.254.169.254" }] }), {
					status: 200,
				});
			}
			if (url.includes("type=AAAA") || url.includes("type=TXT")) {
				return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
			}
			return new Response("{}", { status: 200 });
		});
		await expect(proveDomainOwnership("evil.example", "token")).resolves.toBe(false);
		expect(fetchSpy.mock.calls.some(([input]) => String(input).includes("/.well-known/"))).toBe(
			false,
		);
	});
});
