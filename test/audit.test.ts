import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { audit } from "../src/api/routes/audit.js";
import { probeClaudeBotResponse } from "../src/engine/claudebot-probe.js";

describe("ClaudeBot Probe & Standing Audit (BAT-38, BAT-39)", () => {
	it("rejects invalid or blocked internal domains", async () => {
		await expect(probeClaudeBotResponse("localhost")).rejects.toThrow();
		await expect(probeClaudeBotResponse("127.0.0.1")).rejects.toThrow();
		await expect(probeClaudeBotResponse("169.254.169.254")).rejects.toThrow();
	});

	it("handles probe errors gracefully", async () => {
		const result = await probeClaudeBotResponse("example.invalid-domain-nonexistent");
		expect(result.status).toBe(0);
		expect(result.verdict).toBe("error");
		expect(result.comparison.withAgent404.status).toBe(404);
		expect(result.comparison.withAgent404.recoverySupported).toBe(true);
	});

	it("creates and retrieves a standing audit via API", async () => {
		const app = new Hono();
		app.route("/api/audit", audit);

		const createRes = await app.request("/api/audit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ domain: "example.com", deadPath: "/non-existent" }),
		});

		expect(createRes.status).toBe(201);
		const report = await createRes.json();
		expect(report.id).toMatch(/^audit_/);
		expect(report.domain).toBe("example.com");
		expect(report.score).toBeGreaterThan(0);
		expect(report.permalink).toContain(report.id);
		expect(report.claudeBotProbe).toBeDefined();

		// Retrieve by ID
		const getRes = await app.request(`/api/audit/${report.id}`);
		expect(getRes.status).toBe(200);
		const fetched = await getRes.json();
		expect(fetched.id).toBe(report.id);
		expect(fetched.domain).toBe("example.com");
	});

	it("returns 404 for non-existent audit ID", async () => {
		const app = new Hono();
		app.route("/api/audit", audit);

		const res = await app.request("/api/audit/audit_nonexistent_123");
		expect(res.status).toBe(404);
	});
});
