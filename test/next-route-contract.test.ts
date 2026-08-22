import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { issueSessionCookie, sessionCookieString } from "../src/auth/otp";
import { requestOwner, requireSameOrigin } from "../src/lib/http/auth";
import { handleApiRequest } from "../src/lib/http/api-handler";
import { proxy } from "../src/proxy";
import { loginPage, logout } from "../src/lib/auth/login-handler";
import { renderAdminMetrics } from "../src/lib/http/admin-view";
import type { PostgresStorage } from "../src/storage/postgres";
import type { SiteRecord } from "../src/types";

const authEnv = [
	"AUTH0_DOMAIN",
	"AUTH0_CLIENT_ID",
	"AUTH0_CLIENT_SECRET",
	"AUTH0_SESSION_ENCRYPTION_KEY",
] as const;

const site: SiteRecord = {
	id: "site_1",
	domain: "example.com",
	apiKey: "key_secret",
	publicKey: "pk_public",
	verifiedAt: "2026-01-01T00:00:00.000Z",
	verificationToken: "vf_token",
	reclaimToken: null,
	reclaimRequestedAt: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	ownerSub: "auth0|owner",
};

function configureAuth(): string {
	process.env.AUTH0_DOMAIN = "tenant.example.auth0.com";
	process.env.AUTH0_CLIENT_ID = "client";
	process.env.AUTH0_CLIENT_SECRET = "secret";
	process.env.AUTH0_SESSION_ENCRYPTION_KEY = "a".repeat(32);
	const session = issueSessionCookie(
		{ sub: "auth0|owner", email: "owner@example.com", iss: "https://tenant.example.auth0.com" },
		process.env.AUTH0_SESSION_ENCRYPTION_KEY,
	);
	return sessionCookieString(session.value, session.maxAge).split(";")[0];
}

afterEach(() => {
	for (const key of authEnv) delete process.env[key];
	delete process.env.DATABASE_URL;
	delete process.env.POSTGRES_URL;
});

describe("Next Route Handler contracts", () => {
	it("preserves health JSON, CORS, and security headers", async () => {
		const request = new Request("https://www.agent404.dev/api/health", {
			headers: { Origin: "https://docs.example.com" },
		});
		const response = await handleApiRequest(request, ["health"]);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
		expect(response.headers.get("access-control-allow-origin")).toBe("https://docs.example.com");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("x-frame-options")).toBe("DENY");
	});

	it("answers preflight without requiring database configuration", async () => {
		const request = new Request("https://www.agent404.dev/api/suggest", {
			method: "OPTIONS",
			headers: { Origin: "https://customer.example" },
		});
		const response = await handleApiRequest(request, ["suggest"]);
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-methods")).toContain("POST");
		expect(response.headers.get("access-control-max-age")).toBe("86400");
	});

	it("returns a controlled 503 when storage is missing", async () => {
		const response = await handleApiRequest(
			new Request("https://www.agent404.dev/api/suggest?url=/dead"),
			["suggest"],
		);
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: "Service is not configured" });
	});

	it("preserves secret/public API-key modes before running endpoint work", async () => {
		const storage = {
			getSiteByKey: async (key: string) => key === site.apiKey
				? { site, keyType: "secret" as const }
				: key === site.publicKey ? { site, keyType: "public" as const } : null,
		} as unknown as PostgresStorage;
		const missing = await handleApiRequest(new Request("https://www.agent404.dev/api/register", { method: "POST" }), ["register"], { storage });
		expect(missing.status).toBe(401);
		expect(await missing.json()).toEqual({ error: "Missing x-api-key header" });
		const publicWrite = await handleApiRequest(new Request("https://www.agent404.dev/api/register", {
			method: "POST", headers: { "x-api-key": site.publicKey },
		}), ["register"], { storage });
		expect(publicWrite.status).toBe(403);
		expect(await publicWrite.json()).toEqual({ error: "Public key cannot write. Use the secret key on the server, not in page HTML." });
		const browserSecret = await handleApiRequest(new Request("https://www.agent404.dev/api/register", {
			method: "POST", headers: { "x-api-key": site.apiKey, Origin: "https://example.com" },
		}), ["register"], { storage });
		expect(browserSecret.status).toBe(403);
		const crossDomainPublic = await handleApiRequest(new Request("https://www.agent404.dev/api/suggest?url=/dead", {
			headers: { "x-api-key": site.publicKey, Origin: "https://attacker.example" },
		}), ["suggest"], { storage });
		expect(crossDomainPublic.status).toBe(403);
	});

	it("flattens rotation results and maps overlap to 409", async () => {
		const cookie = configureAuth();
		const rotatedAt = "2026-08-22T12:00:00.000Z";
		const previousKeyExpiresAt = "2026-08-23T12:00:00.000Z";
		let overlap = false;
		const storage = {
			getSite: async () => site,
			rotateSiteKey: async () => overlap
				? { ok: false as const, reason: "overlap_active" as const, retryAt: previousKeyExpiresAt }
				: { ok: true as const, result: { siteId: site.id, kind: "secret" as const, key: "key_rotated", previousKeyExpiresAt, rotatedAt } },
		} as unknown as PostgresStorage;
		const makeRequest = () => new Request(`https://www.agent404.dev/api/sites/${site.id}/keys/secret/rotate`, {
			method: "POST", headers: { Cookie: cookie, Origin: "https://www.agent404.dev" },
		});
		const success = await handleApiRequest(makeRequest(), ["sites", site.id, "keys", "secret", "rotate"], { storage });
		expect(success.status).toBe(201);
		expect(await success.json()).toEqual({ siteId: site.id, kind: "secret", key: "key_rotated", previousKeyExpiresAt, rotatedAt });
		overlap = true;
		const conflict = await handleApiRequest(makeRequest(), ["sites", site.id, "keys", "secret", "rotate"], { storage });
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toMatchObject({ code: "rotation_overlap_active", retryAt: previousKeyExpiresAt });
	});

	it("requires the exact normalized domain before hard deletion", async () => {
		const cookie = configureAuth();
		let deleted = false;
		const storage = {
			getSite: async () => site,
			deleteOwnedSite: async () => { deleted = true; return true; },
		} as unknown as PostgresStorage;
		const call = (domain: string) => handleApiRequest(new Request(`https://www.agent404.dev/api/sites/${site.id}`, {
			method: "DELETE",
			headers: { Cookie: cookie, Origin: "https://www.agent404.dev", "Content-Type": "application/json" },
			body: JSON.stringify({ domain }),
		}), ["sites", site.id], { storage });
		const mismatch = await call("EXAMPLE.com");
		expect(mismatch.status).toBe(400);
		expect(deleted).toBe(false);
		const success = await call("example.com");
		expect(success.status).toBe(200);
		expect(deleted).toBe(true);
	});

	it("never repeats the secret key for an already-owned site", async () => {
		const cookie = configureAuth();
		const storage = {
			getSiteByDomain: async () => site,
		} as unknown as PostgresStorage;
		const response = await handleApiRequest(new Request("https://www.agent404.dev/api/sites", {
			method: "POST",
			headers: { Cookie: cookie, Origin: "https://www.agent404.dev", "Content-Type": "application/json" },
			body: JSON.stringify({ domain: site.domain }),
		}), ["sites"], { storage });
		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.publicKey).toBe(site.publicKey);
		expect(payload).not.toHaveProperty("apiKey");
	});
});

describe("Next owner session boundary", () => {
	it("recognizes the existing a404_session format", () => {
		process.env.AUTH0_DOMAIN = "tenant.example.auth0.com";
		process.env.AUTH0_CLIENT_ID = "client";
		process.env.AUTH0_CLIENT_SECRET = "secret";
		process.env.AUTH0_SESSION_ENCRYPTION_KEY = "a".repeat(32);
		const cookie = issueSessionCookie(
			{ sub: "auth0|owner", email: "owner@example.com", iss: "https://tenant.example.auth0.com" },
			process.env.AUTH0_SESSION_ENCRYPTION_KEY,
		);
		const request = new Request("https://www.agent404.dev/api/sites", {
			headers: { Cookie: sessionCookieString(cookie.value, cookie.maxAge).split(";")[0] },
		});
		const owner = requestOwner(request);
		expect(owner).not.toBeInstanceOf(Response);
		if (!(owner instanceof Response)) {
			expect(owner.ownerSub).toBe("auth0|owner");
			expect(owner.email).toBe("owner@example.com");
		}
	});

	it("rejects cross-origin cookie mutations", async () => {
		const response = requireSameOrigin(new Request("https://www.agent404.dev/api/sites", {
			method: "POST",
			headers: { Origin: "https://attacker.example", Host: "www.agent404.dev" },
		}));
		expect(response?.status).toBe(403);
		expect(await response?.json()).toEqual({ error: "Invalid request origin" });
	});
});

describe("branded auth and operator documents", () => {
	it("renders the email login state with accessible product-native markup", async () => {
		process.env.AUTH0_DOMAIN = "tenant.example.auth0.com";
		process.env.AUTH0_CLIENT_ID = "client";
		process.env.AUTH0_CLIENT_SECRET = "secret";
		process.env.AUTH0_SESSION_ENCRYPTION_KEY = "a".repeat(32);
		const response = await loginPage(new Request("https://www.agent404.dev/auth/login?return_to=%2Fdashboard"));
		const body = await response.text();
		expect(response.status).toBe(200);
		expect(body).toContain('action="/auth/login/code"');
		expect(body.toLowerCase()).toContain('autocomplete="email"');
		expect(body).toContain("#fafafa");
		expect(body).toContain("prefers-color-scheme:dark");
	});

	it("clears both current and compatibility sessions on logout", () => {
		const response = logout(new Request("https://www.agent404.dev/auth/logout"));
		const setCookie = response.headers.get("set-cookie") || "";
		expect(response.status).toBe(302);
		expect(setCookie).toContain("a404_session=");
		expect(setCookie).toContain("appSession=");
	});

	it("renders no-data operator metrics honestly", () => {
		const body = renderAdminMetrics({
			liveInstalls: 0,
			totalSites: 0,
			recoveryRate: null,
			overallFunnelConversion: null,
			precision: null,
		});
		expect(body).toContain("No data");
		expect(body).toContain("Not enough data to evaluate");
		expect(body).not.toContain(">0.0%<");
	});
});

describe("Next dashboard proxy", () => {
	it("returns a controlled page when database configuration is absent", () => {
		const response = proxy(new NextRequest("https://www.agent404.dev/dashboard"));
		expect(response.status).toBe(503);
		expect(response.headers.get("content-type")).toContain("text/html");
	});

	it("keeps CORS on controlled API configuration errors", async () => {
		const response = proxy(new NextRequest("https://www.agent404.dev/api/suggest?url=/dead", {
			headers: { Origin: "https://customer.example" },
		}));
		expect(response.status).toBe(503);
		expect(response.headers.get("access-control-allow-origin")).toBe("https://customer.example");
		expect(await response.json()).toEqual({ error: "Service is not configured" });
	});

	it("redirects signed-out dashboard requests to branded login", () => {
		process.env.DATABASE_URL = "postgres://configured.example/db";
		process.env.AUTH0_DOMAIN = "tenant.example.auth0.com";
		process.env.AUTH0_CLIENT_ID = "client";
		process.env.AUTH0_CLIENT_SECRET = "secret";
		process.env.AUTH0_SESSION_ENCRYPTION_KEY = "a".repeat(32);
		const response = proxy(new NextRequest("https://www.agent404.dev/dashboard/example.com/activity?range=7d"));
		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location")!);
		expect(location.pathname).toBe("/auth/login");
		expect(location.searchParams.get("return_to")).toBe("/dashboard/example.com/activity?range=7d");
	});

	it("rolls an authenticated cookie without moving the absolute login cap", () => {
		process.env.DATABASE_URL = "postgres://configured.example/db";
		process.env.AUTH0_DOMAIN = "tenant.example.auth0.com";
		process.env.AUTH0_CLIENT_ID = "client";
		process.env.AUTH0_CLIENT_SECRET = "secret";
		process.env.AUTH0_SESSION_ENCRYPTION_KEY = "a".repeat(32);
		const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 86400;
		const cookie = issueSessionCookie(
			{ sub: "auth0|owner", iss: "https://tenant.example.auth0.com" },
			process.env.AUTH0_SESSION_ENCRYPTION_KEY,
			eightDaysAgo,
		);
		const response = proxy(new NextRequest("https://www.agent404.dev/dashboard", {
			headers: { Cookie: sessionCookieString(cookie.value, cookie.maxAge).split(";")[0] },
		}));
		expect(response.status).toBe(200);
		expect(response.headers.get("set-cookie")).toContain("a404_session=");
	});
});
