import { describe, expect, it } from "vitest";
import {
	generateHallucinatedPaths,
	predictAndEvaluateHallucinations,
} from "../src/engine/hallucination-predictor.js";

describe("Hallucination Predictor (BAT-40)", () => {
	it("generates version drift variations", () => {
		const known = ["/docs/v3/authentication", "/v2/api/users"];
		const candidates = generateHallucinatedPaths(known);
		const paths = candidates.map((c) => c.path);

		expect(paths).toContain("/docs/v2/authentication");
		expect(paths).toContain("/docs/v1/authentication");
		expect(paths).toContain("/docs/v4/authentication");
		expect(paths).toContain("/v1/api/users");
		expect(paths).toContain("/v3/api/users");
	});

	it("generates pluralization and singular drift", () => {
		const known = ["/docs/user", "/api/settings", "/tools"];
		const candidates = generateHallucinatedPaths(known);
		const paths = candidates.map((c) => c.path);

		expect(paths).toContain("/docs/users");
		expect(paths).toContain("/api/setting");
		expect(paths).toContain("/tool");
	});

	it("generates delimiter drift variations", () => {
		const known = ["/docs/quick-start-guide", "/api/api_keys"];
		const candidates = generateHallucinatedPaths(known);
		const paths = candidates.map((c) => c.path);

		expect(paths).toContain("/docs/quick_start_guide");
		expect(paths).toContain("/docs/quickstartguide");
		expect(paths).toContain("/api/api-keys");
	});

	it("generates hierarchy drift variations", () => {
		const known = ["/docs/installation", "/pricing"];
		const candidates = generateHallucinatedPaths(known);
		const paths = candidates.map((c) => c.path);

		expect(paths).toContain("/installation");
		expect(paths).toContain("/docs/pricing");
		expect(paths).toContain("/api/pricing");
	});

	it("generates extension drift variations", () => {
		const known = ["/guides/getting-started", "/faq.html"];
		const candidates = generateHallucinatedPaths(known);
		const paths = candidates.map((c) => c.path);

		expect(paths).toContain("/guides/getting-started.html");
		expect(paths).toContain("/guides/getting-started.md");
		expect(paths).toContain("/faq");
	});

	it("does not generate already existing paths or root", () => {
		const known = ["/docs/v1", "/docs/v2", "/docs/v3"];
		const candidates = generateHallucinatedPaths(known);
		const paths = candidates.map((c) => c.path);

		expect(paths).not.toContain("/docs/v1");
		expect(paths).not.toContain("/docs/v2");
		expect(paths).not.toContain("/docs/v3");
		expect(paths).not.toContain("/");
	});

	it("bounds version-drift candidates for large bare numeric segments (years/IDs)", () => {
		// /blog/2024 must not explode into thousands of version candidates.
		const candidates = generateHallucinatedPaths(["/blog/2024"]);
		const versionDrift = candidates.filter((c) => c.mutationType === "version_drift");

		// A year-looking bare segment is not a version: no version drift at all.
		expect(versionDrift.length).toBe(0);
		// Total candidates stay small (other drift types only).
		expect(candidates.length).toBeLessThan(30);
	});

	it("bounds version-drift candidates for prefixed large versions to adjacent values", () => {
		const candidates = generateHallucinatedPaths(["/v2024/guide"]);
		const versionDrift = candidates.filter((c) => c.mutationType === "version_drift");

		// v2024-style: only adjacent (v2023, v2025, v2026) are plausible.
		expect(versionDrift.length).toBeLessThanOrEqual(3);
		const paths = versionDrift.map((c) => c.path);
		expect(paths).toContain("/v2023/guide");
		expect(paths).toContain("/v2025/guide");
		// Must not contain a runaway middle version like /v1000/guide.
		expect(paths).not.toContain("/v1000/guide");
	});

	it("keeps real small version segments (v2/v3) generating the full plausible range", () => {
		const candidates = generateHallucinatedPaths(["/docs/v3/auth"]);
		const versionDrift = candidates.filter((c) => c.mutationType === "version_drift");
		const paths = versionDrift.map((c) => c.path);

		expect(paths).toContain("/docs/v1/auth");
		expect(paths).toContain("/docs/v2/auth");
		expect(paths).toContain("/docs/v4/auth");
	});

	it("reports zero recovery rate when nothing was testable (no evidence, not perfect)", async () => {
		const summary = await predictAndEvaluateHallucinations([], "example.com");
		expect(summary.totalTested).toBe(0);
		expect(summary.recoveryRate).toBe(0);
	});

	it("predicts and evaluates recovery against matcher", async () => {
		const pages = [
			{ url: "https://example.com/docs/v3/auth", title: "Authentication Guide" },
			{ url: "https://example.com/docs/users", title: "User Management" },
			{ url: "https://example.com/docs/quickstart", title: "Quickstart" },
		];

		const summary = await predictAndEvaluateHallucinations(pages, "example.com");

		expect(summary.totalTested).toBeGreaterThan(0);
		expect(summary.recoveredCount).toBeGreaterThan(0);
		expect(summary.recoveryRate).toBeGreaterThan(0.5);

		// /docs/v2/auth should recover to /docs/v3/auth
		const v2Auth = summary.predictions.find((p) => p.hallucinatedPath === "/docs/v2/auth");
		expect(v2Auth).toBeDefined();
		expect(v2Auth?.recovered).toBe(true);
		expect(v2Auth?.topSuggestion?.url).toBe("https://example.com/docs/v3/auth");

		// /docs/user should recover to /docs/users
		const userPlural = summary.predictions.find((p) => p.hallucinatedPath === "/docs/user");
		expect(userPlural).toBeDefined();
		expect(userPlural?.recovered).toBe(true);
		expect(userPlural?.topSuggestion?.url).toBe("https://example.com/docs/users");
	});
});
