import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { loginRoutes, __setOtpStoreForTests } from "../src/auth/login-routes.js";
import { MemoryOtpStore } from "../src/storage/otp.js";
import {
	OtpFlowError,
	computeSessionExpiry,
	generateOtp,
	hashOtp,
	issueSessionCookie,
	normalizeCode,
	normalizeEmail,
	readSessionCookie,
	safeReturnTo,
	sendOtpEmail as sendOtpEmailDirect,
	sessionCookieString,
	sessionNeedsRoll,
	rollSessionCookie,
	verifyOtp,
	type OtpIdentity,
} from "../src/auth/otp.js";
import { readAuth0Config, DEFAULT_OTP_CONNECTION } from "../src/auth/config.js";
import { findOrCreateUser, __resetMgmtCache } from "../src/auth/mgmt.js";
import { sendOtpEmail } from "../src/lib/email.js";
import { loginPageHtml } from "../src/views/login.js";
import type { Context } from "hono";

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

function fakeContext(cookieValue: string | null): Context {
	const headers = new Headers();
	if (cookieValue) headers.set("Cookie", `a404_session=${cookieValue}`);
	return {
		req: {
			raw: { headers },
			header: (name: string) => headers.get(name) ?? undefined,
		},
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
		expect(normalizeCode("12")).toBeNull();
		expect(normalizeCode("123456789")).toBeNull();
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
/* OTP generation + verification                                       */
/* ------------------------------------------------------------------ */

describe("otp generation + verification", () => {
	it("generates 6-digit codes", () => {
		for (let i = 0; i < 50; i++) {
			const code = generateOtp();
			expect(code).toMatch(/^\d{6}$/);
		}
	});
	it("hashes and verifies codes (constant-time)", () => {
		const code = "482913";
		const hash = hashOtp(code);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(verifyOtp(code, hash)).toBe(true);
		expect(verifyOtp("482914", hash)).toBe(false);
		expect(verifyOtp("000000", hash)).toBe(false);
	});
	it("never stores the plaintext code", () => {
		const code = "123456";
		expect(hashOtp(code)).not.toContain(code);
	});
});

/* ------------------------------------------------------------------ */
/* Session cookie (HMAC JWT)                                           */
/* ------------------------------------------------------------------ */

const identity: OtpIdentity = {
	sub: "auth0|test123",
	email: "bharath@test.dev",
	name: "Bharath",
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
		const claims = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
		claims.exp = 1_700_000_000 + 60 * 86400;
		const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
		const sig = createHmac("sha256", SESSION_SECRET).update(`${h}.${body}`).digest("base64url");
		const forged = `${h}.${body}.${sig}`;
		expect(readSessionCookie(fakeContext(forged), SESSION_SECRET, 1_700_000_000 + 20 * 86400)).toBeNull();
	});

	it("rolls before the inactivity window runs out", () => {
		const now = 1_700_000_000;
		const { value } = issueSessionCookie(identity, SESSION_SECRET, now);
		const later = now + 8 * 86400;
		const parsed = readSessionCookie(fakeContext(value), SESSION_SECRET, later)!;
		expect(parsed.roll).toBe(true);
		const rolled = rollSessionCookie(parsed.claims, SESSION_SECRET, later)!;
		const re = readSessionCookie(fakeContext(rolled.value), SESSION_SECRET, later)!;
		expect(re.roll).toBe(false);
		expect(re.claims.login_at).toBe(now);
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
		expect(computeSessionExpiry(login, login + 1 * 86400)).toBe(login + 15 * 86400);
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
	it("defaults the OTP connection for legacy flows", () => {
		expect(DEFAULT_OTP_CONNECTION).toBe("agent404-email");
	});
	it("returns null without secrets", () => {
		expect(readAuth0Config({ AUTH0_DOMAIN: DOMAIN })).toBeNull();
	});
});

/* ------------------------------------------------------------------ */
/* Resend delivery                                                     */
/* ------------------------------------------------------------------ */

describe("sendOtpEmail (Resend)", () => {
	const resendCfg = { apiKey: "re_testkey", from: "agent-404 <no-reply@test.dev>" };

	it("POSTs a branded email to Resend", async () => {
		const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			calls.push({
				url: String(url),
				body: JSON.parse(String(init?.body)),
				auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null,
			});
			return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
		});
		await sendOtpEmail(resendCfg, "bharath@test.dev", "482913", fetchMock as unknown as typeof fetch);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe("https://api.resend.com/emails");
		expect(calls[0].auth).toBe("Bearer re_testkey");
		expect(calls[0].body).toMatchObject({
			from: "agent-404 <no-reply@test.dev>",
			to: ["bharath@test.dev"],
			subject: "Your agent-404 sign-in code",
		});
		const text = calls[0].body.text as string;
		expect(text).toContain("482913");
		const html = calls[0].body.html as string;
		expect(html).toContain("482913");
		expect(html).toContain("#10b981"); // brand mark
	});

	it("maps Resend failures to a friendly error", async () => {
		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({ name: "validation_error", message: "bad sender" }), { status: 422 }),
		);
		await expect(
			sendOtpEmail(resendCfg, "bharath@test.dev", "482913", fetchMock as unknown as typeof fetch),
		).rejects.toBeInstanceOf(OtpFlowError);
	});
});

/* ------------------------------------------------------------------ */
/* Auth0 Management API                                                */
/* ------------------------------------------------------------------ */

describe("findOrCreateUser (Management API)", () => {
	beforeEach(() => __resetMgmtCache());
	afterEach(() => __resetMgmtCache());

	function mgmtFetchMock(opts: { existing?: boolean } = {}) {
		const calls: string[] = [];
		const fn = vi.fn(async (url: string, init?: RequestInit) => {
			const u = String(url);
			calls.push(u);
			if (u.endsWith("/oauth/token")) {
				return new Response(JSON.stringify({ access_token: "mgmt-token", expires_in: 3600 }), {
					status: 200,
				});
			}
			if (u.includes("/api/v2/users-by-email")) {
				return new Response(
					JSON.stringify(
						opts.existing
							? [{ user_id: "auth0|existing", email: "bharath@test.dev", name: "Bharath" }]
							: [],
					),
					{ status: 200 },
				);
			}
			if (u.endsWith("/api/v2/users")) {
				return new Response(
					JSON.stringify({ user_id: "auth0|newuser", email: "bharath@test.dev" }),
					{ status: 201 },
				);
			}
			return new Response("nope", { status: 404 });
		});
		return { fn, calls };
	}

	it("reuses an existing Auth0 user by email", async () => {
		const { fn, calls } = mgmtFetchMock({ existing: true });
		const user = await findOrCreateUser(authCfg()!, "bharath@test.dev", fn as unknown as typeof fetch);
		expect(user).toEqual({ sub: "auth0|existing", email: "bharath@test.dev", name: "Bharath" });
		expect(calls.some((u) => u.includes("/api/v2/users-by-email"))).toBe(true);
		expect(calls.some((u) => u.endsWith("/api/v2/users"))).toBe(false);
	});

	it("creates a user when none exists (email_verified: true)", async () => {
		const { fn, calls } = mgmtFetchMock();
		const user = await findOrCreateUser(authCfg()!, "bharath@test.dev", fn as unknown as typeof fetch);
		expect(user.sub).toBe("auth0|newuser");
		const createCall = calls.find((u) => u.endsWith("/api/v2/users"));
		expect(createCall).toBeTruthy();
		// Verify the create body included email_verified + a connection.
		const init = fn.mock.calls.find(([u]) => String(u).endsWith("/api/v2/users"))?.[1];
		const body = JSON.parse(String(init?.body));
		expect(body.email_verified).toBe(true);
		expect(body.connection).toBe("Username-Password-Authentication");
	});

	it("requests a token with the Management API audience", async () => {
		const { fn, calls } = mgmtFetchMock();
		await findOrCreateUser(authCfg()!, "bharath@test.dev", fn as unknown as typeof fetch);
		const tokenCall = calls.find((u) => u.endsWith("/oauth/token"));
		expect(tokenCall).toBeTruthy();
		const init = fn.mock.calls.find(([u]) => String(u).endsWith("/oauth/token"))?.[1];
		const body = new URLSearchParams(String(init?.body));
		expect(body.get("grant_type")).toBe("client_credentials");
		expect(body.get("audience")).toBe(`https://${DOMAIN}/api/v2/`);
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
		expect(html).toContain("Send code");
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
/* Route-level tests (mocked Resend + Management API + memory store)   */
/* ------------------------------------------------------------------ */

const routeEnv = {
	AUTH0_DOMAIN: DOMAIN,
	AUTH0_CLIENT_ID: CLIENT_ID,
	AUTH0_CLIENT_SECRET: "test-client-secret",
	AUTH0_SESSION_ENCRYPTION_KEY: SESSION_SECRET,
	APP_BASE_URL: "http://localhost:3000",
	RESEND_API_KEY: "re_testkey",
	RESEND_FROM: "agent-404 <no-reply@test.dev>",
} as never;

function authFetchMock(opts: { userExists?: boolean } = {}) {
	return vi.fn(async (url: string, init?: RequestInit) => {
		const u = String(url);
		if (u === "https://api.resend.com/emails") {
			return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
		}
		if (u.endsWith("/oauth/token")) {
			return new Response(JSON.stringify({ access_token: "mgmt-token", expires_in: 3600 }), {
				status: 200,
			});
		}
		if (u.includes("/api/v2/users-by-email")) {
			return new Response(
				JSON.stringify(
					opts.userExists
						? [{ user_id: "auth0|existing", email: "bharath@test.dev", name: "Bharath" }]
						: [],
				),
				{ status: 200 },
			);
		}
		if (u.endsWith("/api/v2/users")) {
			return new Response(
				JSON.stringify({ user_id: "auth0|newuser", email: "bharath@test.dev" }),
				{ status: 201 },
			);
		}
		return new Response("not found", { status: 404 });
	});
}

/** Unique per-test IP so the shared in-memory rate limiter doesn't throttle tests. */
function routeIp(n: number): { "x-forwarded-for": string } {
	return { "x-forwarded-for": `10.1.0.${n}` };
}

/** Extract the code from the Resend email text body. */
function codeFromResend(mock: ReturnType<typeof vi.fn>): string {
	const call = mock.mock.calls.find(([u]) => String(u) === "https://api.resend.com/emails");
	expect(call).toBeTruthy();
	const body = JSON.parse(String(call![1]?.body));
	const match = /^  (\d{6})$/m.exec(String(body.text));
	if (!match) throw new Error("code not found in email body");
	return match[1];
}

describe("login routes", () => {
	let originalFetch: typeof fetch;
	let store: MemoryOtpStore;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		store = new MemoryOtpStore();
		__setOtpStoreForTests(store);
		__resetMgmtCache();
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
		__setOtpStoreForTests(null);
		__resetMgmtCache();
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
			{ headers: { Cookie: `a404_session=${value}` } },
			routeEnv,
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/dashboard");
	});

	it("POST /auth/login/code rejects invalid emails", async () => {
		const res = await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", headers: routeIp(1), body: new URLSearchParams({ email: "not-an-email" }) },
			routeEnv,
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("Enter a valid email address.");
	});

	it("POST /auth/login/code emails a code and shows the code step", async () => {
		const mock = authFetchMock();
		globalThis.fetch = mock as unknown as typeof fetch;
		const res = await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", headers: routeIp(2), body: new URLSearchParams({ email: "bharath@test.dev" }) },
			routeEnv,
		);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Enter the code");
		expect(html).toContain("bharath@test.dev");
		expect(mock).toHaveBeenCalledWith(
			"https://api.resend.com/emails",
			expect.anything(),
		);
		// A pending code is persisted (hashed).
		const pending = await store.getOtp("bharath@test.dev");
		expect(pending).not.toBeNull();
		expect(pending?.codeHash).not.toContain(codeFromResend(mock));
	});

	it("full round trip: code → verify → session cookie → redirect", async () => {
		const mock = authFetchMock({ userExists: true });
		globalThis.fetch = mock as unknown as typeof fetch;

		const codeRes = await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", headers: routeIp(3), body: new URLSearchParams({ email: "bharath@test.dev", return_to: "/dashboard" }) },
			routeEnv,
		);
		expect(codeRes.status).toBe(200);
		const code = codeFromResend(mock);

		const verifyRes = await loginRoutes.request(
			"/auth/login/verify",
			{
				method: "POST",
				body: new URLSearchParams({ email: "bharath@test.dev", code, return_to: "/dashboard" }),
			},
			routeEnv,
		);
		expect(verifyRes.status).toBe(302);
		expect(verifyRes.headers.get("Location")).toBe("/dashboard");
		const setCookie = verifyRes.headers.get("Set-Cookie") ?? "";
		expect(setCookie).toContain("a404_session=");
		expect(setCookie).toContain("HttpOnly");
		// Code consumed.
		expect(await store.getOtp("bharath@test.dev")).toBeNull();
		// Existing user reused, no create call.
		expect(
			mock.mock.calls.some(([u]) => String(u).endsWith("/api/v2/users") && String(u) !== "/api/v2/users-by-email"),
		).toBe(false);
	});

	it("the issued session cookie is recognized on the next request (regression)", async () => {
		const mock = authFetchMock({ userExists: true });
		globalThis.fetch = mock as unknown as typeof fetch;
		await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", headers: routeIp(7), body: new URLSearchParams({ email: "bharath@test.dev" }) },
			routeEnv,
		);
		const code = codeFromResend(mock);
		const verifyRes = await loginRoutes.request(
			"/auth/login/verify",
			{
				method: "POST",
				body: new URLSearchParams({ email: "bharath@test.dev", code, return_to: "/dashboard" }),
			},
			routeEnv,
		);
		const match = /a404_session=([^;]+)/.exec(verifyRes.headers.get("Set-Cookie") ?? "");
		expect(match).toBeTruthy();

		// The cookie must be readable from the Cookie header on the next request.
		const next = await loginRoutes.request(
			"/auth/login",
			{ headers: { Cookie: `a404_session=${match![1]}` } },
			routeEnv,
		);
		expect(next.status).toBe(302);
		expect(next.headers.get("Location")).toBe("/dashboard");
	});

	it("POST /auth/login/code respects a 30s cooldown (friendly message, no JSON 429)", async () => {
		const mock = authFetchMock();
		globalThis.fetch = mock as unknown as typeof fetch;
		const first = await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", headers: routeIp(8), body: new URLSearchParams({ email: "bharath@test.dev" }) },
			routeEnv,
		);
		expect(first.status).toBe(200);
		expect(await first.text()).toContain("Enter the code");

		const second = await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", headers: routeIp(8), body: new URLSearchParams({ email: "bharath@test.dev" }) },
			routeEnv,
		);
		const html = await second.text();
		expect(html).toContain("Please wait");
		expect(html).not.toContain("Too many requests");
		// Resend was only called once.
		expect(
			mock.mock.calls.filter(([u]) => String(u) === "https://api.resend.com/emails"),
		).toHaveLength(1);
	});

	it("creates a new Auth0 user on first sign-in", async () => {
		const mock = authFetchMock(); // userExists: false
		globalThis.fetch = mock as unknown as typeof fetch;
		await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", headers: routeIp(4), body: new URLSearchParams({ email: "new@test.dev" }) },
			routeEnv,
		);
		const code = codeFromResend(mock);
		const verifyRes = await loginRoutes.request(
			"/auth/login/verify",
			{
				method: "POST",
				body: new URLSearchParams({ email: "new@test.dev", code }),
			},
			routeEnv,
		);
		expect(verifyRes.status).toBe(302);
		expect(
			mock.mock.calls.some(([u]) => String(u).endsWith("/api/v2/users")),
		).toBe(true);
	});

	it("POST /auth/login/verify shows a friendly error on a wrong code", async () => {
		const mock = authFetchMock();
		globalThis.fetch = mock as unknown as typeof fetch;
		await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", headers: routeIp(5), body: new URLSearchParams({ email: "bharath@test.dev" }) },
			routeEnv,
		);
		codeFromResend(mock); // consume to get the real code out of the way

		const res = await loginRoutes.request(
			"/auth/login/verify",
			{
				method: "POST",
				body: new URLSearchParams({ email: "bharath@test.dev", code: "999999" }),
			},
			routeEnv,
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("isn&#39;t right");
	});

	it("rejects expired codes", async () => {
		await store.saveOtp("bharath@test.dev", hashOtp("111111"), new Date(Date.now() - 1000));
		const res = await loginRoutes.request(
			"/auth/login/verify",
			{
				method: "POST",
				body: new URLSearchParams({ email: "bharath@test.dev", code: "111111" }),
			},
			routeEnv,
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("expired");
		expect(await store.getOtp("bharath@test.dev")).toBeNull();
	});

	it("locks out after too many incorrect attempts", async () => {
		await store.saveOtp("bharath@test.dev", hashOtp("111111"), new Date(Date.now() + 60_000));
		let lastHtml = "";
		for (let i = 0; i < 5; i++) {
			const res = await loginRoutes.request(
				"/auth/login/verify",
				{
					method: "POST",
					body: new URLSearchParams({ email: "bharath@test.dev", code: "000000" }),
				},
				routeEnv,
			);
			expect(res.status).toBe(200);
			lastHtml = await res.text();
		}
		expect(lastHtml).toContain("Too many incorrect attempts");
		expect(await store.getOtp("bharath@test.dev")).toBeNull();
	});

	it("blocks a phishing return_to on verify", async () => {
		const mock = authFetchMock({ userExists: true });
		globalThis.fetch = mock as unknown as typeof fetch;
		await loginRoutes.request(
			"/auth/login/code",
			{ method: "POST", headers: routeIp(6), body: new URLSearchParams({ email: "bharath@test.dev" }) },
			routeEnv,
		);
		const code = codeFromResend(mock);
		const res = await loginRoutes.request(
			"/auth/login/verify",
			{
				method: "POST",
				body: new URLSearchParams({
					email: "bharath@test.dev",
					code,
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