/**
 * Routes for the embedded one-time-code sign-in flow (app-owned).
 *
 *   GET  /auth/login          → branded sign-in page (email step)
 *   POST /auth/login/code     → generate a code, persist its hash, email it via Resend
 *   POST /auth/login/verify   → verify the code, resolve the Auth0 user, set the session
 *   POST /auth/login/resend   → re-send the code (rate-limited)
 *   GET  /auth/logout         → clear app session + legacy Auth0 session
 *
 * The auth0-hono middleware is configured with customRoutes: ["login",
 * "logout"] so these routes take over from the default Universal Login
 * redirect. /auth/callback stays mounted by the middleware for backwards
 * compatibility (legacy sessions, magic links, direct /authorize links).
 *
 * Nothing here touches the tenant's email provider, templates, or shared
 * connections — the code is generated, delivered (Resend), and verified by
 * the app itself.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../index.js";
import { AUTH_LOGIN_PATH, AUTH_LOGOUT_PATH, readAuth0Config } from "./config.js";
import {
	OTP_MAX_ATTEMPTS,
	OTP_TTL_MS,
	OtpFlowError,
	clearSessionCookieString,
	generateOtp,
	hashOtp,
	issueSessionCookie,
	normalizeCode,
	normalizeEmail,
	readSessionCookie,
	safeReturnTo,
	sessionCookieString,
	verifyOtp,
	type OtpIdentity,
} from "./otp.js";
import { readResendConfig, sendOtpEmail } from "../lib/email.js";
import { findOrCreateUser } from "./mgmt.js";
import { loginPageHtml } from "../views/login.js";
import { getDatabaseUrl } from "../config.js";
import { PostgresOtpStore, type OtpStore } from "../storage/otp.js";

export const loginRoutes = new Hono<Env>();

/* ---- OTP store resolution (test seam: __setOtpStoreForTests) ---- */

let injectedOtpStore: OtpStore | null = null;

export function __setOtpStoreForTests(store: OtpStore | null): void {
	injectedOtpStore = store;
}

function storeFor(c: Context<Env>): OtpStore | null {
	if (injectedOtpStore) return injectedOtpStore;
	const dbUrl = getDatabaseUrl(c.env as unknown as Record<string, unknown>);
	return dbUrl ? new PostgresOtpStore(dbUrl) : null;
}

/* ---- helpers ---- */

function authNotConfigured(c: Context<Env>): Response {
	return c.html(
		`<!DOCTYPE html><html><body style="font-family:system-ui;background:#09090b;color:#f4f4f5;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;padding:2rem;text-align:center;border:1px solid #27272a;border-radius:14px;background:#121215"><h1 style="font-size:1.1rem;margin:0 0 0.75rem">Sign-in is not configured</h1><p style="font-size:0.85rem;color:#a1a1aa;line-height:1.6;margin:0">Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SESSION_ENCRYPTION_KEY, RESEND_API_KEY, and RESEND_FROM to enable owner sign-in.</p></div></body></html>`,
		503,
	);
}

function pageError(error: unknown, fallback: string): string {
	if (error instanceof OtpFlowError) return error.userMessage;
	console.error("[login] unexpected error:", error);
	return fallback;
}

/**
 * Read an application/x-www-form-urlencoded body as { [key]: string }.
 *
 * Deliberately NOT c.req.parseBody(): on Vercel's Node runtime, Hono's
 * parseBody → request.formData() hangs forever on POSTs with a body
 * (same bug family as the new Request() issue documented in api/index.ts).
 * Reading the body as text mirrors c.req.json(), which works fine.
 */
async function readForm(c: Context<Env>): Promise<Record<string, string>> {
	const text = await c.req.text().catch(() => "");
	const params = new URLSearchParams(text);
	const out: Record<string, string> = {};
	for (const [key, value] of params.entries()) out[key] = value;
	return out;
}

function signInUnavailable(c: Context<Env>): Response {
	return c.html(
		loginPageHtml({
			state: "email",
			error: "Sign-in is temporarily unavailable. Try again in a moment.",
		}),
		502,
	);
}

/* ---- routes ---- */

const RESEND_COOLDOWN_MS = 30_000;

/**
 * Generate + email a code, respecting a per-email cooldown. Returns null on
 * success, or a friendly error string when the user must wait.
 */
async function sendCodeForEmail(
	c: Context<Env>,
	store: OtpStore,
	runConfig: { email: string },
): Promise<string | null> {
	const pending = await store.getOtp(runConfig.email);
	if (pending && Date.now() - pending.createdAt.getTime() < RESEND_COOLDOWN_MS) {
		const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - pending.createdAt.getTime())) / 1000);
		return `Please wait ${wait}s before requesting another code.`;
	}
	const emailCfg = readResendConfig(c.env as unknown as Record<string, string | undefined>);
	if (!emailCfg) return null; // caller handles config checks

	const code = generateOtp();
	const expiresAt = new Date(Date.now() + OTP_TTL_MS);
	try {
		await store.saveOtp(runConfig.email, hashOtp(code), expiresAt);
		await sendOtpEmail(emailCfg, runConfig.email, code);
	} catch (error) {
		await store.deleteOtp(runConfig.email).catch(() => undefined);
		return pageError(error, "We couldn't send the code. Try again.");
	}
	return null;
}

/** GET /auth/login — branded sign-in page. */
loginRoutes.get(AUTH_LOGIN_PATH, async (c) => {
	const cfg = readAuth0Config(c.env as unknown as Record<string, string | undefined>);
	if (!cfg) return authNotConfigured(c);

	// Already signed in? Go straight to the dashboard.
	const existing = readSessionCookie(c, cfg.sessionSecret);
	if (existing) return c.redirect("/dashboard", 302);
	const legacy = c.var.auth0Client;
	if (legacy) {
		const session = await legacy.getSession(c);
		if (session?.user?.sub) return c.redirect("/dashboard", 302);
	}
	return c.html(loginPageHtml({ returnTo: safeReturnTo(c.req.query("return_to")) }));
});

/** POST /auth/login/code — generate + email a one-time code. */
loginRoutes.post("/auth/login/code", async (c) => {
	const cfg = readAuth0Config(c.env as unknown as Record<string, string | undefined>);
	if (!cfg || !readResendConfig(c.env as unknown as Record<string, string | undefined>)) {
		return authNotConfigured(c);
	}

	const body = await readForm(c);
	const returnTo = safeReturnTo(body.return_to);
	const email = normalizeEmail(body.email);
	if (!email) {
		return c.html(
			loginPageHtml({
				state: "email",
				error: "Enter a valid email address.",
				returnTo,
			}),
		);
	}

	const store = storeFor(c);
	if (!store) return signInUnavailable(c);

	const error = await sendCodeForEmail(c, store, { email });
	if (error) {
		return c.html(
			loginPageHtml({ state: "email", email, error, returnTo }),
		);
	}
	return c.html(loginPageHtml({ state: "code", email, returnTo }));
});

/** POST /auth/login/verify — check the code, resolve the user, sign in. */
loginRoutes.post("/auth/login/verify", async (c) => {
	const cfg = readAuth0Config(c.env as unknown as Record<string, string | undefined>);
	if (!cfg) return authNotConfigured(c);

	const body = await readForm(c);
	const email = normalizeEmail(body.email);
	const code = normalizeCode(body.code);
	const returnTo = safeReturnTo(body.return_to);

	if (!email || !code) {
		return c.html(
			loginPageHtml({
				state: "code",
				email: email ?? "",
				error: "Enter the one-time code we emailed you.",
				returnTo,
			}),
		);
	}

	const store = storeFor(c);
	if (!store) return signInUnavailable(c);

	const pending = await store.getOtp(email);
	if (!pending) {
		return c.html(
			loginPageHtml({
				state: "code",
				email,
				error:
					"That code has expired or was already used. Request a new code if needed.",
				returnTo,
			}),
		);
	}
	if (pending.expiresAt.getTime() <= Date.now()) {
		await store.deleteOtp(email).catch(() => undefined);
		return c.html(
			loginPageHtml({
				state: "code",
				email,
				error: "That code has expired. Request a new code.",
				returnTo,
			}),
		);
	}

	if (!verifyOtp(code, pending.codeHash)) {
		const attempts = await store.incrementAttempts(email);
		if (attempts >= OTP_MAX_ATTEMPTS) {
			await store.deleteOtp(email).catch(() => undefined);
			return c.html(
				loginPageHtml({
					state: "code",
					email,
					error:
						"Too many incorrect attempts. Request a new code to try again.",
					returnTo,
				}),
			);
		}
		return c.html(
			loginPageHtml({
				state: "code",
				email,
				error: "That code isn't right. Check the email and try again.",
				returnTo,
			}),
		);
	}

	await store.deleteOtp(email).catch(() => undefined);

	let identity: OtpIdentity;
	try {
		const user = await findOrCreateUser(cfg, email);
		identity = {
			sub: user.sub,
			email: user.email,
			name: user.name,
			iss: `https://${cfg.domain}`,
		};
	} catch (error) {
		return c.html(
			loginPageHtml({
				state: "code",
				email,
				error: pageError(
					error,
					"We couldn't finish signing you in. Try again.",
				),
				returnTo,
			}),
		);
	}

	const cookie = issueSessionCookie(identity, cfg.sessionSecret);
	c.header("Set-Cookie", sessionCookieString(cookie.value, cookie.maxAge));
	return c.redirect(returnTo, 302);
});

/** POST /auth/login/resend — re-send the code (same page, cooldown-bounded). */
loginRoutes.post("/auth/login/resend", async (c) => {
	const cfg = readAuth0Config(c.env as unknown as Record<string, string | undefined>);
	if (!cfg || !readResendConfig(c.env as unknown as Record<string, string | undefined>)) {
		return authNotConfigured(c);
	}

	const body = await readForm(c);
	const email = normalizeEmail(body.email);
	const returnTo = safeReturnTo(body.return_to);
	if (!email) {
		return c.html(loginPageHtml({ state: "email", returnTo }));
	}

	const store = storeFor(c);
	if (!store) return signInUnavailable(c);

	const error = await sendCodeForEmail(c, store, { email });
	if (error) {
		return c.html(
			loginPageHtml({ state: "code", email, error, returnTo }),
		);
	}
	return c.html(loginPageHtml({ state: "code", email, returnTo }));
});

/** GET /auth/logout — clear app session + legacy Auth0 session, then IDP logout. */
loginRoutes.get(AUTH_LOGOUT_PATH, (c) => {
	const cfg = readAuth0Config(c.env as unknown as Record<string, string | undefined>);
	const returnTo = safeReturnTo(c.req.query("return_to"), "/");
	const headers = new Headers();
	headers.append("Set-Cookie", clearSessionCookieString());
	headers.append("Set-Cookie", "appSession=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0");
	if (cfg) {
		const target = `${cfg.baseURL}${returnTo === "/" ? "" : returnTo}`;
		const idpLogout = `https://${cfg.domain}/v2/logout?client_id=${encodeURIComponent(cfg.clientID)}&returnTo=${encodeURIComponent(target)}`;
		headers.append("Location", idpLogout);
		return new Response(null, { status: 302, headers });
	}
	headers.append("Location", returnTo);
	return new Response(null, { status: 302, headers });
});