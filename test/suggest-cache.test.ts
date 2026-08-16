import { describe, expect, it, beforeEach } from "vitest";
import {
	getCachedSuggest,
	invalidateSuggestCache,
	resetSuggestCache,
	setCachedSuggest,
} from "../src/engine/suggest-cache.js";

describe("suggest-cache", () => {
	beforeEach(() => {
		resetSuggestCache();
	});

	it("returns null on miss and the payload on hit", () => {
		expect(getCachedSuggest("site-a", "https://ex.com/a")).toBeNull();
		setCachedSuggest("site-a", "https://ex.com/a", { ok: 1 });
		expect(getCachedSuggest("site-a", "https://ex.com/a")).toEqual({ ok: 1 });
	});

	it("isolates tenants", () => {
		setCachedSuggest("site-a", "https://ex.com/a", { from: "a" });
		setCachedSuggest("site-b", "https://ex.com/a", { from: "b" });
		expect(getCachedSuggest("site-a", "https://ex.com/a")).toEqual({ from: "a" });
		expect(getCachedSuggest("site-b", "https://ex.com/a")).toEqual({ from: "b" });
	});

	it("invalidates one site without touching another", () => {
		setCachedSuggest("site-a", "https://ex.com/a", { from: "a" });
		setCachedSuggest("site-b", "https://ex.com/a", { from: "b" });
		invalidateSuggestCache("site-a");
		expect(getCachedSuggest("site-a", "https://ex.com/a")).toBeNull();
		expect(getCachedSuggest("site-b", "https://ex.com/a")).toEqual({ from: "b" });
	});
});
