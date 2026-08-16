import { describe, it, expect } from "vitest";
import { applyForwardedProto } from "../api/index.js";

describe("applyForwardedProto", () => {
	it("upgrades http to https when x-forwarded-proto is https", () => {
		const req = new Request("http://www.agent404.dev/auth/callback?code=x", {
			headers: { "x-forwarded-proto": "https" },
		});
		const out = applyForwardedProto(req);
		expect(out.url).toBe("https://www.agent404.dev/auth/callback?code=x");
		expect(out.headers.get("x-forwarded-proto")).toBe("https");
	});

	it("preserves the request when x-forwarded-proto is absent", () => {
		const req = new Request("http://localhost:8787/auth/callback");
		expect(applyForwardedProto(req)).toBe(req);
	});

	it("preserves the request when x-forwarded-proto is http", () => {
		const req = new Request("http://localhost:8787/auth/callback", {
			headers: { "x-forwarded-proto": "http" },
		});
		expect(applyForwardedProto(req)).toBe(req);
	});

	it("leaves https requests untouched", () => {
		const req = new Request("https://www.agent404.dev/auth/callback", {
			headers: { "x-forwarded-proto": "https" },
		});
		expect(applyForwardedProto(req)).toBe(req);
	});
});