import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { probeClaudeBotResponse, deriveProbePath } from "../src/engine/claudebot-probe.js";
import { dashboardProbe } from "../src/api/routes/dashboard-probe.js";
import type { PostgresStorage } from "../src/storage/postgres.js";
import type { SiteRecord, InstallProbe } from "../src/types.js";

// --- Engine ---------------------------------------------------------------

function jsonResponse(
	status: number,
	body: string,
	extraHeaders: Record<string, string> = {},
): Response {
	return new Response(body, {
		status,
		headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders },
	});
}

describe("deriveProbePath", () => {
	it("is a bare pathname with a random segment", () => {
		const p = deriveProbePath();
		expect(p).toMatch(/^\/agent404-probe-[a-z0-9]{10}$/);
	});

	it("is deterministic with a seed (for tests)", () => {
		expect(deriveProbePath("abc123def456")).toBe("/agent404-probe-abc123def4");
	});

	it("varies without a seed", () => {
		expect(deriveProbePath()).not.toBe(deriveProbePath());
	});
});

describe("probeClaudeBotResponse", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("verdict: recovered_404 when the 404 carries a Link header", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse(404, "<html><body>404</body></html>", {
					Link: `</writing/mcp>; rel="alternate"; title="MCP"`,
				}),
			),
		);
		const r = await probeClaudeBotResponse("example.org", "/agent404-probe-test123");
		expect(r.verdict).toBe("recovered_404");
		expect(r.hasLinkHeaders).toBe(true);
		expect(r.status).toBe(404);
	});

	it("verdict: unrecovered_404 for a bare 404", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(404, "<html><body>404</body></html>")));
		const r = await probeClaudeBotResponse("example.org", "/agent404-probe-test123");
		expect(r.verdict).toBe("unrecovered_404");
		expect(r.hasLinkHeaders).toBe(false);
		expect(r.hasJsonLd).toBe(false);
	});

	it("verdict: non_404 for a soft-404 SPA (HTTP 200 on a missing path)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(200, "<html><body>app shell</body></html>")),
		);
		const r = await probeClaudeBotResponse("example.org", "/agent404-probe-test123");
		expect(r.verdict).toBe("non_404");
		expect(r.status).toBe(200);
	});

	it("detects JSON-LD ItemList in the body", async () => {
		const body =
			'<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList"}</script></head><body></body></html>';
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(404, body)));
		const r = await probeClaudeBotResponse("example.org", "/agent404-probe-test123");
		expect(r.hasJsonLd).toBe(true);
		expect(r.verdict).toBe("recovered_404");
	});

	it("verdict: error when the site is unreachable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("connect ECONNREFUSED");
			}),
		);
		const r = await probeClaudeBotResponse("example.org", "/agent404-probe-test123");
		expect(r.verdict).toBe("error");
		expect(r.status).toBe(0);
	});

	it("rejects internal hosts (SSRF guard)", async () => {
		vi.stubGlobal("fetch", vi.fn());
		await expect(probeClaudeBotResponse("127.0.0.1", "/x")).rejects.toThrow(
			"Invalid or blocked domain",
		);
	});
});

// --- Route ----------------------------------------------------------------

function fakeSite(overrides: Partial<SiteRecord> = {}): SiteRecord {
	return {
		id: "site-1",
		domain: "example.org",
		apiKey: "key_abc",
		publicKey: "pk_abc",
		verifiedAt: new Date().toISOString(),
		verificationToken: "vf_abc",
		reclaimToken: null,
		reclaimRequestedAt: null,
		createdAt: new Date().toISOString(),
		ownerSub: "auth0|owner-1",
		...overrides,
	};
}

function probeRouteApp(sites: SiteRecord[], ownerSub: string) {
	const saved: InstallProbe[] = [];
	const storage = {
		saved,
		getSite: async (id: string) => sites.find((s) => s.id === id) ?? null,
		saveInstallProbe: async (p: InstallProbe) => {
			saved.push(p);
		},
	} as unknown as PostgresStorage & { saved: InstallProbe[] };

	const app = new Hono<{
		Variables: { storage: PostgresStorage; ownerSub: string };
	}>();
	app.use("/api/dashboard/*", async (c, next) => {
		c.set("storage", storage);
		c.set("ownerSub", ownerSub);
		await next();
	});
	app.route("/api/dashboard", dashboardProbe);
	return { app, storage };
}

describe("POST /api/dashboard/probe", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("404s for a site the owner does not control", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(404, "x")));
		const { app } = probeRouteApp([fakeSite({ id: "site-1" })], "auth0|someone-else");
		const res = await app.request("/api/dashboard/probe", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ siteId: "site-1" }),
		});
		expect(res.status).toBe(404);
	});

	it("404s for an unknown site", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(404, "x")));
		const { app } = probeRouteApp([fakeSite({ id: "site-1" })], "auth0|owner-1");
		const res = await app.request("/api/dashboard/probe", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ siteId: "nope" }),
		});
		expect(res.status).toBe(404);
	});

	it("runs the probe, returns the exchange, and persists it as manual", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse(404, "<html></html>", { Link: `</mcp>; rel="alternate"` }),
			),
		);
		const { app, storage } = probeRouteApp([fakeSite({ id: "site-1" })], "auth0|owner-1");
		const res = await app.request("/api/dashboard/probe", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ siteId: "site-1" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			ok: boolean;
			probe: {
				verdict: string;
				status: number;
				hasLinkHeaders: boolean;
				linkHeader: string | null;
				probePath: string;
				source: string;
			};
		};
		expect(body.ok).toBe(true);
		expect(body.probe.verdict).toBe("recovered_404");
		expect(body.probe.status).toBe(404);
		expect(body.probe.hasLinkHeaders).toBe(true);
		expect(body.probe.linkHeader).toBe('</mcp>; rel="alternate"');
		expect(body.probe.probePath).toMatch(/^\/agent404-probe-/);
		expect(body.probe.source).toBe("manual");

		expect(storage.saved).toHaveLength(1);
		expect(storage.saved[0].source).toBe("manual");
		expect(storage.saved[0].siteId).toBe("site-1");
	});

	it("honors a custom bare pathname but rejects host- and query-laden paths", async () => {
		let fetchedPath = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				fetchedPath = new URL(url).pathname;
				return jsonResponse(404, "<html></html>");
			}),
		);
		const { app } = probeRouteApp([fakeSite({ id: "site-1" })], "auth0|owner-1");

		await app.request("/api/dashboard/probe", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ siteId: "site-1", path: "/docs/v1/auth" }),
		});
		expect(fetchedPath).toBe("/docs/v1/auth");

		await app.request("/api/dashboard/probe", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ siteId: "site-1", path: "https://evil.example/x" }),
		});
		// Non-bare input falls back to the generated probe path, not the input.
		expect(fetchedPath).toMatch(/^\/agent404-probe-/);
	});
});