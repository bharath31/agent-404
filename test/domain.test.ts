import { describe, expect, it } from "vitest";
import { normalizeDomain } from "../src/api/domain.js";

describe("normalizeDomain", () => {
	it("strips protocol and trailing slash", () => {
		expect(normalizeDomain("https://docs.example.com/")).toBe("docs.example.com");
	});

	it("rejects invalid hostnames", () => {
		expect(normalizeDomain("not a domain")).toBeNull();
		expect(normalizeDomain("")).toBeNull();
	});
});
