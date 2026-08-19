/**
 * Routes for the embedded passwordless sign-in flow.
 *
 *   GET  /auth/login          → branded sign-in page (email step)
 *   POST /auth/login/code     → send the one-time code (code step)
 *   POST /auth/login/verify   → exchange the code, set the session cookie
 *   POST /auth/login/resend   → re-send the code (rate-limited)
 *   GET  /auth/logout         → clear app session + legacy Auth0 session
 *
 * The auth0-hono middleware is configured with customRoutes: ["login",
 * "logout"] so these routes take over from the default Universal Login
 * redirect. /auth/callback stays mounted by the middleware for backwards
 * compatibility (existing sessions, magic links, direct /authorize links).
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../index.js";
import { AUTH_LOGIN_PATH, AUTH_LOGOUT_PATH, readAuth0Config } from "./config.js";
import {
	OtpFlowError,
	clearSessionCookieString,
	exchangeOtpCode,
	issueSessionCookie,
	normalizeCode,
	normalizeEmail,
	readSessionCookie,
	safeReturnTo,
	sendOtpCode,
	sessionCookieString,
} from "./otp.js";
import { loginPageHtml } from "../views/login.js";
import { rateLimiter } from "../api/middleware/rate-limit.js";

export const loginRoutes = new Hono<Env>();

function authNotConfigured(c: Context<Env>): Response {
	return c.html(
		`<!DOCTYPE html><html><body style="font-family:system-ui;background:#09090b;color:#f4f4f5;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;padding:2rem;text-align:center;border:1px solid #27272a;border-radius:14px;background:#121215"><h1 style="font-size:1.1rem;margin:0 0 0.75rem">Sign-in is not configured</h1><p style="font-size:0.85rem;color:#a1a1aa;line-height:1.6;margin:0">Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, and AUTH0_SESSION_ENCRYPTION_KEY to enable owner sign-in.</p></div></body></html>`,
		503,
	);
}

function pageError(error: unknown, fallback: string): string {
	if (error instanceof OtpFlowError) return error.userMessage;
	console.error("[login] unexpected error:", error);
	return fallback;
}

/** GET /auth/login — branded sign-in page. */
loginRoutes.get(AUTH_LOGIN_PATH, (c) => {
	const cfg = readAuth0Config(c.env as unknown as Record<string, string | undefined>);
	if (!cfg) return authNotConfigured(c);

	// Already signed in? Go straight to the dashboard.
	const existing = readSessionCookie(c, cfg.sessionSecret);
	if (existing) return c.redirect("/dashboard", 302);
	const legacy = c.var.auth0Client;
	if (legacy) {
		return legacy.getSession(c).then((session) => {
			if (session?.user?.sub) return c.redirect("/dashboard", 302);
			return c.html(loginPageHtml({ returnTo: safeReturnTo(c.req.query("return_to")) }));
		});
	}
	return c.html(loginPageHtml({ returnTo: safeReturnTo(c.req.query("return_to")) }));
});

/** POST /auth/login/code — send the one-time code to the email. */
loginRoutes.post(
	"/auth/login/code",
	rateLimiter({ windowMs: 60_000, max: 5 }),
	async (c) => {
		const cfg = readAuth0Config(c.env as unknown as Record<string, string | undefined>);
		if (!cfg) return authNotConfigured(c);
		const body = await c.req.parseBody();
		const returnTo = safeReturnTo(body?.return_to);
		const email = normalizeEmail(body?.email);
		if (!email) {
			return c.html(
				loginPageHtml({
					state: "email",
					error: "Enter a valid email address.",
					returnTo,
				}),
			);
		}
		try {
			await sendOtpCode(cfg, email);
		} catch (error) {
			return c.html(
				loginPageHtml({
					state: "email",
					email,
					error: pageError(error, "We couldn't send the code. Try again."),
					returnTo,
				}),
			);
		}
		return c.html(loginPageHtml({ state: "code", email, returnTo }));
	},
);

/** POST /auth/login/verify — exchange the code and start the session. */
loginRoutes.post("/auth/login/verify", async (c) => {
	const cfg = readAuth0Config(c.env as unknown as Record<string, string | undefined>);
	if (!cfg) return authNotConfigured(c);
	const body = await c.req.parseBody();
	const email = normalizeEmail(body?.email);
	const code = normalizeCode(body?.code);
	const returnTo = safeReturnTo(body?.return_to);

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

	try {
		const identity = await exchangeOtpCode(cfg, email, code);
		const cookie = issueSessionCookie(identity, cfg.sessionSecret);
		c.header("Set-Cookie", sessionCookieString(cookie.value, cookie.maxAge));
		return c.redirect(returnTo, 302);
	} catch (error) {
		return c.html(
			loginPageHtml({
				state: "code",
				email,
				error: pageError(error, "That code isn't right or has expired."),
				returnTo,
			}),
		);
	}
});

/** POST /auth/login/resend — re-send the code (same page). */
loginRoutes.post(
	"/auth/login/resend",
	rateLimiter({ windowMs: 60_000, max: 5 }),
	async (c) => {
		const cfg = readAuth0Config(c.env as unknown as Record<string, string | undefined>);
		if (!cfg) return authNotConfigured(c);
		const body = await c.req.parseBody();
		const email = normalizeEmail(body?.email);
		const returnTo = safeReturnTo(body?.return_to);
		if (!email) {
			return c.html(loginPageHtml({ state: "email", returnTo }));
		}
		try {
			await sendOtpCode(cfg, email);
			return c.html(loginPageHtml({ state: "code", email, returnTo }));
		} catch (error) {
			return c.html(
				loginPageHtml({
					state: "code",
					email,
					error: pageError(error, "We couldn't send a new code. Try again."),
					returnTo,
				}),
			);
		}
	},
);

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