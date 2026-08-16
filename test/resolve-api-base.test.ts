import { describe, expect, it } from "vitest";
import { DEFAULT_API_BASE, resolveApiBase } from "../script/resolve-api-base.js";
import { CANONICAL_ORIGIN } from "../src/config.js";

function script(attrs: Record<string, string | null>) {
	return {
		getAttribute(name: string): string | null {
			return Object.hasOwn(attrs, name) ? attrs[name] : null;
		},
	};
}

describe("resolveApiBase", () => {
	it("uses the canonical origin instead of script.src", () => {
		expect(resolveApiBase(script({}))).toBe(DEFAULT_API_BASE);
		expect(DEFAULT_API_BASE).toBe(CANONICAL_ORIGIN);
	});

	it("honors data-api-base for self-hosters", () => {
		expect(resolveApiBase(script({ "data-api-base": "https://api.example.com/v1" }))).toBe(
			"https://api.example.com",
		);
	});

	it("falls back when data-api-base is invalid", () => {
		expect(resolveApiBase(script({ "data-api-base": "not a url" }))).toBe(DEFAULT_API_BASE);
	});

	it("bakes the canonical origin into the published bundle", async () => {
		const { readFileSync } = await import("node:fs");
		const { join } = await import("node:path");
		const min = readFileSync(join(import.meta.dirname, "..", "public", "agent-404.min.js"), "utf-8");
		expect(min).toContain(CANONICAL_ORIGIN);
		expect(min).not.toContain("__AGENT404_API_BASE__");
	});
});
