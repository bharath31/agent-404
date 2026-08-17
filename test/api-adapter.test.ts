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

	it("preserves request instance and body stream without consuming body", async () => {
		const req = new Request("http://www.agent404.dev/api/sites", {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-forwarded-proto": "https" },
			body: JSON.stringify({ domain: "example.com" }),
		});
		const out = applyForwardedProto(req);
		expect(out).toBe(req);
		expect(out.url).toBe("https://www.agent404.dev/api/sites");
		expect(out.bodyUsed).toBe(false);
		const json = await out.json();
		expect(json).toEqual({ domain: "example.com" });
	});
});