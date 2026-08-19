import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as nodeCrypto from "node:crypto";
import type { Context } from "hono";
import {
	OtpFlowError,
	computeSessionExpiry,
	exchangeOtpCode,
	issueSessionCookie,
	normalizeCode,
	normalizeEmail,
	readSessionCookie,
	safeReturnTo,
	sendOtpCode,
	sessionCookieString,
	sessionNeedsRoll,
	rollSessionCookie,
	type OtpIdentity,
} from "../src/auth/otp.js";
import { readAuth0Config, DEFAULT_OTP_CONNECTION } from "../src/auth/config.js";
import { loginPageHtml } from "../src/views/login.js";
import { loginRoutes } from "../src/auth/login-routes.js";

const SESSION_SECRET = "0123456789abcdef0123456789abcdef"; // 32 chars
const DOMAIN = "tenant.test";
const CLIENT_ID = "test-client-id";

function authCfg(overrides: Record<string, string | undefined> = {}) {
	return readAuth0Config({
		AUTH0_DOMAIN: DOMAIN,
		AUTH0_CLIENT_ID: CLIENT_ID,
		AUTH0_CLIENT_SECRET: "test-client-secret",
		AUTH0_SESSION_ENCRYPTION_KEY: SESSION_SECRET,
		APP_BASE_URL: "http://localhost:3000",
		...overrides,
	});
}

function fakeContext(headerValue: string | null): Context {
	return {
		req: { header: (name: string) => (name === "a404_session" ? (headerValue ?? undefined) : undefined) },
	} as unknown as Context;
}

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

describe("normalizeEmail", () => {
	it("accepts valid emails (trimmed, lowercased)", () => {
		expect(normalizeEmail("  Bharath@Test.Dev ")).toBe("bharath@test.dev");
	});
	it("rejects invalid input", () => {
		expect(normalizeEmail("")).toBeNull();
		expect(normalizeEmail("nope")).toBeNull();
		expect(normalizeEmail("a b@c.de")).toBeNull();
		expect(normalizeEmail(123)).toBeNull();
		expect(normalizeEmail("x".repeat(200) + "@a.b")).toBeNull();
	});
});

describe("normalizeCode", () => {
	it("strips spaces and dashes", () => {
		expect(normalizeCode("123 456")).toBe("123456");
		expect(normalizeCode("123-456")).toBe("123456");
	});
	it("rejects non-digits", () => {
		expect(normalizeCode("12ab")).toBeNull();
		expect(normalizeCode("12")).toBeNull(); // too short
		expect(normalizeCode("123456789")).toBeNull(); // too long
	});
});

describe("safeReturnTo", () => {
	it("allows relative paths", () => {
		expect(safeReturnTo("/dashboard")).toBe("/dashboard");
		expect(safeReturnTo("/report/abc?x=1")).toBe("/report/abc?x=1");
	});
	it("rejects absolute and protocol-relative targets", () => {
		expect(safeReturnTo("https://evil.com")).toBe("/dashboard");
		expect(safeReturnTo("//evil.com")).toBe("/dashboard");
		expect(safeReturnTo("\\evil.com")).toBe("/dashboard");
		expect(safeReturnTo("javascript:alert(1)")).toBe("/dashboard");
		expect(safeReturnTo(undefined)).toBe("/dashboard");
	});
	it("respects a custom fallback", () => {
		expect(safeReturnTo("https://evil.com", "/")).toBe("/");
	});
});

/* ------------------------------------------------------------------ */
/* Session cookie (HMAC JWT)                                           */
/* ------------------------------------------------------------------ */

const identity: OtpIdentity = {
	sub: "auth0|test123",
	email: "bharath@test.dev",
	name: "Bharath",
	sid: "sess-1",
	iss: `https://${DOMAIN}`,
};

describe("session cookie", () => {
	it("signs and verifies a session", () => {
		const { value, maxAge } = issueSessionCookie(identity, SESSION_SECRET, 1_700_000_000);
		expect(value.split(".")).toHaveLength(3);
		expect(maxAge).toBeLessThanOrEqual(14 * 86400);
		const parsed = readSessionCookie(fakeContext(value), SESSION_SECRET, 1_700_000_000);
		expect(parsed?.claims.sub).toBe("auth0|test123");
		expect(parsed?.claims.email).toBe("bharath@test.dev");
	});

	it("rejects tampered payloads", () => {
		const { value } = issueSessionCookie(identity, SESSION_SECRET, 1_700_000_000);
		const [h, b, s] = value.split(".");
		const forged = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
		forged.sub = "auth0|attacker";
		const tampered = `${h}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${s}`;
		expect(readSessionCookie(fakeContext(tampered), SESSION_SECRET, 1_700_000_000)).toBeNull();
	});

	it("rejects a different secret", () => {
		const { value } = issueSessionCookie(identity, SESSION_SECRET, 1_700_000_000);
		expect(
			readSessionCookie(fakeContext(value), "ffffffffffffffffffffffffffffffff", 1_700_000_000),
		).toBeNull();
	});

	it("rejects expired sessions", () => {
		const { value } = issueSessionCookie(identity, SESSION_SECRET, 1_700_000_000);
		expect(readSessionCookie(fakeContext(value), SESSION_SECRET, 1_700_000_000 + 15 * 86400)).toBeNull();
	});

	it("enforces the 30-day absolute cap even if exp is forged higher", () => {
		const { value } = issueSessionCookie(identity, SESSION_SECRET, 1_700_000_000);
		const [h, b, s] = value.split(".");
		// Re-sign with a legitimate secret but an impossible exp (past absolute cap).
		const claims = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
		claims.exp = 1_700_000_000 + 60 * 86400;
		const { createHmac } = nodeCrypto;
		const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
		const sig = createHmac("sha256", SESSION_SECRET).update(`${h}.${body}`).digest("base64url");
		const forged = `${h}.${body}.${sig}`;
		expect(readSessionCookie(fakeContext(forged), SESSION_SECRET, 1_700_000_000 + 20 * 86400)).toBeNull();
	});

	it("rolls before the inactivity window runs out", () => {
		const now = 1_700_000_000;
		const { value } = issueSessionCookie(identity, SESSION_SECRET, now);
		// 8 days later: 6 days left → needs a roll.
		const later = now + 8 * 86400;
		const parsed = readSessionCookie(fakeContext(value), SESSION_SECRET, later)!;
		expect(parsed.roll).toBe(true);
		const rolled = rollSessionCookie(parsed.claims, SESSION_SECRET, later)!;
		const re = readSessionCookie(fakeContext(rolled.value), SESSION_SECRET, later)!;
		expect(re.roll).toBe(false);
		expect(re.claims.login_at).toBe(now); // absolute anchor preserved
	});

	it("does not roll when plenty of inactivity remains", () => {
		const now = 1_700_000_000;
		const { value } = issueSessionCookie(identity, SESSION_SECRET, now);
		const parsed = readSessionCookie(fakeContext(value), SESSION_SECRET, now + 2 * 86400)!;
		expect(sessionNeedsRoll(parsed.claims, now + 2 * 86400)).toBe(false);
	});

	it("computeSessionExpiry caps at the absolute duration", () => {
		const login = 1_700_000_000;
		expect(computeSessionExpiry(login, login + 20 * 86400)).toBe(login + 30 * 86400);
		expect(computeSessionExpiry(login, login + 1 * 86400)).toBe(login + 15 * 86400); // 1d used + 14d inactivity
	});

	it("cookie string has the right attributes", () => {
		const cookie = sessionCookieString("abc", 123);
		expect(cookie).toContain("a404_session=abc");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain("Max-Age=123");
	});
});

/* ------------------------------------------------------------------ */
/* readAuth0Config                                                     */
/* ------------------------------------------------------------------ */

describe("readAuth0Config", () => {
	it("defaults the OTP connection to the dedicated app connection", () => {
		expect(authCfg()?.otpConnection).toBe(DEFAULT_OTP_CONNECTION);
		expect(DEFAULT_OTP_CONNECTION).toBe("agent404-email");
	});
	it("honours AUTH0_OTP_CONNECTION", () => {
		expect(authCfg({ AUTH0_OTP_CONNECTION: "custom-conn" })?.otpConnection).toBe("custom-conn");
	});
	it("returns null without secrets", () => {
		expect(readAuth0Config({ AUTH0_DOMAIN: DOMAIN })).toBeNull();
	});
});

/* ------------------------------------------------------------------ */
/* Auth0 wire calls (mocked fetch)                                     */
/* ------------------------------------------------------------------ */

const rsa = nodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = rsa.publicKey.export({ format: "jwk" }) as { kty: string; n: string; e: string };
const JWKS = { keys: [{ ...jwk, kid: "test-key-1", alg: "RS256", use: "sig" }] };

function makeIdToken(overrides: Record<string, unknown> = {}, key = rsa.privateKey): string {
	const now = Math.floor(Date.now() / 1000);
	const header = Buffer.from(
		JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key-1" }),
	).toString("base64url");
	const payload = Buffer.from(
		JSON.stringify({
			iss: `https://${DOMAIN}`,
			aud: CLIENT_ID,
			sub: "auth0|test123",
			email: "bharath@test.dev",
			name: "Bharath",
			sid: "sess-1",
			iat: now,
			exp: now + 3600,
			...overrides,
		}),
	).toString("base64url");
	const signature = nodeCrypto
		.sign("sha256", Buffer.from(`${header}.${payload}`), key)
		.toString("base64url");
	return `${header}.${payload}.${signature}`;
}

describe("sendOtpCode", () => {
	it("POSTs /passwordless/start with the dedicated connection", async () => {
		const calls: { url: string; body: Record<string, unknown> }[] = [];
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
			return new Response(null, { status: 204 });
		});
		await sendOtpCode(authCfg()!, "bharath@test.dev", fetchMock as unknown as typeof fetch);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(`https://${DOMAIN}/passwordless/start`);
		expect(calls[0].body).toMatchObject({
			client_id: CLIENT_ID,
			connection: "agent404-email",
			email: "bharath@test.dev",
			send: "code",
		});
	});

	it("maps 429 to a friendly rate-limit error", async () => {
		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({ error: "too_many_requests" }), { status: 429 }),
		);
		await expect(
			sendOtpCode(authCfg()!, "bharath@test.dev", fetchMock as unknown as typeof fetch),
		).rejects.toMatchObject({
			status: 429,
			message: expect.stringContaining("Too many"),
		});
	});

	it("maps network failures to a 502-friendly error", async () => {
		const fetchMock = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		await expect(
			sendOtpCode(authCfg()!, "bharath@test.dev", fetchMock as unknown as typeof fetch),
		).rejects.toMatchObject({ status: 502 });
	});
});

describe("exchangeOtpCode", () => {
	it("exchanges a valid code and returns verified identity", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			const u = String(url);
			if (u.endsWith("/.well-known/jwks.json")) {
				return new Response(JSON.stringify(JWKS), { status: 200 });
			}
			if (u.endsWith("/oauth/token")) {
				const body = new URLSearchParams(String(init?.body));
				expect(body.get("grant_type")).toBe("http://auth0.com/oauth/grant-type/passwordless/otp");
				expect(body.get("realm")).toBe("agent404-email");
				expect(body.get("username")).toBe("bharath@test.dev");
				expect(body.get("otp")).toBe("123456");
				return new Response(
					JSON.stringify({ access_token: "at", id_token: makeIdToken() }),
					{ status: 200 },
				);
			}
			return new Response("nope", { status: 404 });
		});
		const identity = await exchangeOtpCode(
			authCfg()!,
			"bharath@test.dev",
			"123456",
			fetchMock as unknown as typeof fetch,
		);
		expect(identity.sub).toBe("auth0|test123");
		expect(identity.email).toBe("bharath@test.dev");
	});

	it("rejects a token signed by the wrong key", async () => {
		const otherKey = nodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
		const fetchMock = vi.fn(async (url: string) => {
			const u = String(url);
			if (u.endsWith("/.well-known/jwks.json")) {
				return new Response(JSON.stringify(JWKS), { status: 200 });
			}
			if (u.endsWith("/oauth/token")) {
				return new Response(
					JSON.stringify({ access_token: "at", id_token: makeIdToken({}, otherKey.privateKey) }),
					{ status: 200 },
				);
			}
			return new Response("nope", { status: 404 });
		});
		await expect(
			exchangeOtpCode(authCfg()!, "bharath@test.dev", "123456", fetchMock as unknown as typeof fetch),
		).rejects.toBeInstanceOf(OtpFlowError);
	});

	it("rejects a token with the wrong audience", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			const u = String(url);
			if (u.endsWith("/.well-known/jwks.json")) {
				return new Response(JSON.stringify(JWKS), { status: 200 });
			}
			if (u.endsWith("/oauth/token")) {
				return new Response(
					JSON.stringify({
						access_token: "at",
						id_token: makeIdToken({ aud: "some-other-client" }),
					}),
					{ status: 200 },
				);
			}
			return new Response("nope", { status: 404 });
		});
		await expect(
			exchangeOtpCode(authCfg()!, "bharath@test.dev", "123456", fetchMock as unknown as typeof fetch),
		).rejects.toBeInstanceOf(OtpFlowError);
	});

	it("maps an invalid code to a friendly error", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (String(url).endsWith("/oauth/token")) {
				return new Response(
					JSON.stringify({ error: "invalid_grant", error_description: "invalid code" }),
					{ status: 401 },
				);
			}
			return new Response("nope", { status: 404 });
		});
		await expect(
			exchangeOtpCode(authCfg()!, "bharath@test.dev", "999999", fetchMock as unknown as typeof fetch),
		).rejects.toMatchObject({
			status: 401,
			message: expect.stringContaining("isn't right or has expired"),
		});
	});
});

/* ------------------------------------------------------------------ */
/* Login page rendering                                                */
/* ------------------------------------------------------------------ */

describe("loginPageHtml", () => {
	it("renders the email step", () => {
		const html = loginPageHtml({});
		expect(html).toContain("Welcome back");
		expect(html).toContain('action="/auth/login/code"');
		expect(html).toContain('name="email"');
		expect(html).toContain('Send code');
	});

	it("renders the code step with the recipient email", () => {
		const html = loginPageHtml({ state: "code", email: "bharath@test.dev" });
		expect(html).toContain("Enter the code");
		expect(html).toContain("bharath@test.dev");
		expect(html).toContain('action="/auth/login/verify"');
	});

	it("escapes user-supplied values", () => {
		const html = loginPageHtml({
			state: "code",
			email: '<img src=x onerror=alert(1)@evil.com>',
			error: '<script>alert(2)</script>',
		});
		expect(html).not.toContain("<img src=x");
		expect(html).not.toContain("<script>alert(2)</script>");
		expect(html).toContain("&lt;script&gt;");
	});

	it("escapes return_to against quote injection", () => {
		const html = loginPageHtml({ returnTo: '/dashboard" onmouseover="alert(1)' });
		expect(html).not.toContain('" onmouseover="alert(1)');
		expect(html).toContain("&quot;");
	});
});

/* ------------------------------------------------------------------ */
/* Route-level tests (mocked Auth0 fetch)                              */
/* ------------------------------------------------------------------ */

const routeEnv = {
	AUTH0_DOMAIN: DOMAIN,
	AUTH0_CLIENT_ID: CLIENT_ID,
	AUTH0_CLIENT_SECRET: "test-client-secret",
	AUTH0_SESSION_ENCRYPTION_KEY: SESSION_SECRET,
	APP_BASE_URL: "http://localhost:3000",
} as never;

function authFetchMock(opts: { validCode?: string } = {}) {
	const validCode = opts.validCode ?? "123456";
	return vi.fn(async (url: string, init?: RequestInit) => {
		const u = String(url);
		if (u.endsWith("/.well-known/jwks.json")) {
			return new Response(JSON.stringify(JWKS), { status: 200 });
		}
		if (u.endsWith("/oauth/token")) {
			const body = new URLSearchParams(String(init?.body));
			if (body.get("otp") !== validCode) {
				return new Response(
					JSON.stringify({ error: "invalid_grant", error_description: "invalid code" }),
					{ status: 401 },
				);
			}
			return new Response(JSON.stringify({ access_token: "at", id_token: makeIdToken() }), {
				status: 200,
			});
		}
		if (u.endsWith("/passwordless/start")) {
			return new Response(null, { status: 204 });
		}
		return new Response("not found", { status: 404 });
	});
}

describe("login routes", () => {
	let originalFetch: typeof fetch;
	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("GET /auth/login renders the branded sign-in page", async () => {
		const res = await loginRoutes.request("/auth/login", undefined, routeEnv);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Welcome back");
		expect(html).toContain("/auth/login/code");
		expect(html).toContain("Send code");
	});

	it("GET /auth/login redirects signed-in users to the dashboard", async () => {
		const { value } = issueSessionCookie(identity, SESSION_SECRET);
		const res = await loginRoutes.request(
			"/auth/login",
			{ headers: { a404_session: value } },
			routeEnv,
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/dashboard");
	});

	it("POST /auth/login/code rejects invalid emails", async () => {
		const res = await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", body: new URLSearchParams({ email: "not-an-email" }) },
			routeEnv,
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("Enter a valid email address.");
	});

	it("POST /auth/login/code sends the code and shows the code step", async () => {
		const mock = authFetchMock();
		globalThis.fetch = mock as unknown as typeof fetch;
		const res = await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", body: new URLSearchParams({ email: "bharath@test.dev" }) },
			routeEnv,
		);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Enter the code");
		expect(html).toContain("bharath@test.dev");
		expect(mock).toHaveBeenCalledWith(
			expect.stringContaining("/passwordless/start"),
			expect.anything(),
		);
	});

	it("POST /auth/login/verify sets the session cookie and redirects", async () => {
		globalThis.fetch = authFetchMock() as unknown as typeof fetch;
		const res = await loginRoutes.request(
			"/auth/login/verify",
			{
				method: "POST",
				body: new URLSearchParams({
					email: "bharath@test.dev",
					code: "123456",
					return_to: "/dashboard",
				}),
			},
			routeEnv,
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/dashboard");
		const setCookie = res.headers.get("Set-Cookie") ?? "";
		expect(setCookie).toContain("a404_session=");
		expect(setCookie).toContain("HttpOnly");
	});

	it("POST /auth/login/verify shows a friendly error on a bad code", async () => {
		globalThis.fetch = authFetchMock({ validCode: "123456" }) as unknown as typeof fetch;
		const res = await loginRoutes.request(
			"/auth/login/verify",
			{
				method: "POST",
				body: new URLSearchParams({ email: "bharath@test.dev", code: "654321" }),
			},
			routeEnv,
		);
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain("right or has expired");
	});

	it("blocks a phishing return_to on verify", async () => {
		globalThis.fetch = authFetchMock() as unknown as typeof fetch;
		const res = await loginRoutes.request(
			"/auth/login/verify",
			{
				method: "POST",
				body: new URLSearchParams({
					email: "bharath@test.dev",
					code: "123456",
					return_to: "https://evil.com",
				}),
			},
			routeEnv,
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/dashboard");
	});

	it("GET /auth/logout clears both session cookies and redirects to IDP logout", async () => {
		const res = await loginRoutes.request("/auth/logout", undefined, routeEnv);
		expect(res.status).toBe(302);
		const location = res.headers.get("Location") ?? "";
		expect(location).toContain(`https://${DOMAIN}/v2/logout`);
		expect(location).toContain(`client_id=${CLIENT_ID}`);
		const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("Set-Cookie") ?? ""];
		const joined = cookies.join("\n");
		expect(joined).toContain("a404_session=;");
		expect(joined).toContain("appSession=;");
	});
});