import { describe, expect, it, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimiter, resetRateLimitHits } from "../src/api/middleware/rate-limit.js";

describe("rateLimiter", () => {
	beforeEach(() => {
		resetRateLimitHits();
	});

	function app() {
		const h = new Hono();
		h.use("/api/suggest", rateLimiter({ windowMs: 60_000, max: 2 }));
		h.post("/api/suggest", (c) => c.json({ ok: true }));
		return h;
	}

	it("rate-limits per API key, not globally", async () => {
		const h = app();
		const a = { "x-api-key": "key_aaaa", "Content-Type": "application/json" };
		const b = { "x-api-key": "key_bbbb", "Content-Type": "application/json" };
		expect((await h.request("/api/suggest", { method: "POST", headers: a })).status).toBe(200);
		expect((await h.request("/api/suggest", { method: "POST", headers: a })).status).toBe(200);
		expect((await h.request("/api/suggest", { method: "POST", headers: a })).status).toBe(429);
		expect((await h.request("/api/suggest", { method: "POST", headers: b })).status).toBe(200);
	});

	it("falls back to IP when no API key is present", async () => {
		const h = app();
		const headers = { "x-forwarded-for": "203.0.113.9", "Content-Type": "application/json" };
		expect((await h.request("/api/suggest", { method: "POST", headers })).status).toBe(200);
		expect((await h.request("/api/suggest", { method: "POST", headers })).status).toBe(200);
		expect((await h.request("/api/suggest", { method: "POST", headers })).status).toBe(429);
	});
});
