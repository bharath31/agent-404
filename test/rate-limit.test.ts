import { describe, expect, it, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimiter, resetRateLimitHits } from "../src/api/middleware/rate-limit.js";

describe("rateLimiter", () => {
	beforeEach(() => {
		resetRateLimitHits();
	});

	function app(customOpts = {}) {
		const h = new Hono();
		h.use("/api/suggest", rateLimiter({ windowMs: 60_000, max: 2, ...customOpts }));
		h.post("/api/suggest", (c) => c.json({ ok: true }));
		return h;
	}

	it("rate-limits per API key, not globally", async () => {
		const h = app();
		const a = { "x-api-key": "key_aaaa", "Content-Type": "application/json" };
		const b = { "x-api-key": "key_bbbb", "Content-Type": "application/json" };
		
		const res1 = await h.request("/api/suggest", { method: "POST", headers: a });
		expect(res1.status).toBe(200);
		expect(res1.headers.get("X-RateLimit-Limit")).toBe("2");
		expect(res1.headers.get("X-RateLimit-Remaining")).toBe("1");
		expect(res1.headers.get("X-Quota-Limit")).toBe("2");
		expect(res1.headers.get("X-Quota-Remaining")).toBe("1");
		expect(res1.headers.get("X-RateLimit-Reset")).toBeDefined();

		const res2 = await h.request("/api/suggest", { method: "POST", headers: a });
		expect(res2.status).toBe(200);
		expect(res2.headers.get("X-RateLimit-Remaining")).toBe("0");

		const res3 = await h.request("/api/suggest", { method: "POST", headers: a });
		expect(res3.status).toBe(429);
		expect(res3.headers.get("Retry-After")).toBeDefined();
		const body = await res3.json();
		expect(body.error).toBe("Too many requests");
		expect(body.retryAfter).toBeGreaterThan(0);

		// Different tenant is unaffected
		const resB = await h.request("/api/suggest", { method: "POST", headers: b });
		expect(resB.status).toBe(200);
		expect(resB.headers.get("X-RateLimit-Remaining")).toBe("1");
	});

	it("falls back to IP when no API key is present", async () => {
		const h = app();
		const headers = { "x-forwarded-for": "203.0.113.9", "Content-Type": "application/json" };
		expect((await h.request("/api/suggest", { method: "POST", headers })).status).toBe(200);
		expect((await h.request("/api/suggest", { method: "POST", headers })).status).toBe(200);
		const blocked = await h.request("/api/suggest", { method: "POST", headers });
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get("Retry-After")).toBeDefined();
	});

	it("supports custom quota limits via getLimit", async () => {
		const h = app({
			getLimit: (c: any) => (c.req.header("x-plan") === "pro" ? 5 : 2),
		});
		const proHeaders = { "x-api-key": "key_pro", "x-plan": "pro", "Content-Type": "application/json" };
		
		for (let i = 0; i < 5; i++) {
			const res = await h.request("/api/suggest", { method: "POST", headers: proHeaders });
			expect(res.status).toBe(200);
		}
		const blocked = await h.request("/api/suggest", { method: "POST", headers: proHeaders });
		expect(blocked.status).toBe(429);
	});
});
