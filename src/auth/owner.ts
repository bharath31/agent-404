import type { Context, Next } from "hono";
import type { ServerClient } from "@auth0/auth0-server-js";
import { AUTH_LOGIN_PATH, readAuth0Config } from "./config";
import {
	readSessionCookie,
	rollSessionCookie,
	sessionCookieString,
} from "./otp";
import { normalizeDomain } from "../api/domain";
import { isDisposableSmokeDomain } from "../lib/disposable-smoke-domain";

type AuthVars = {
	ownerSub?: string;
	auth0Client?: ServerClient<Context>;
};

export async function sessionOwnerSub(c: Context): Promise<string | null> {
	const vars = c.var as AuthVars;
	if (vars.ownerSub) return vars.ownerSub;

	// 1) App-owned session cookie (embedded OTP login flow).
	//    Verified against the session secret; rolled when the inactivity
	//    window is running out (14 days idle / 30 days absolute).
	const cfg = readAuth0Config(c.env as unknown as Record<string, string | undefined>);
	if (cfg) {
		const parsed = readSessionCookie(c, cfg.sessionSecret);
		if (parsed) {
			if (parsed.roll) {
				const rolled = rollSessionCookie(parsed.claims, cfg.sessionSecret);
				if (rolled) {
					c.header(
						"Set-Cookie",
						sessionCookieString(rolled.value, rolled.maxAge),
					);
				}
			}
			return parsed.claims.sub;
		}
	}

	// 2) Legacy Auth0 middleware session (existing logins, magic links, callback).
	const client = vars.auth0Client;
	if (!client) return null;

	const session = await client.getSession(c);
	const sub = session?.user?.sub;
	return typeof sub === "string" && sub.length > 0 ? sub : null;
}

function loginRedirect(c: Context): Response {
	const url = new URL(c.req.url);
	const returnTo = `${url.pathname}${url.search}`;
	const target = `${AUTH_LOGIN_PATH}?return_to=${encodeURIComponent(returnTo || "/dashboard")}`;
	return c.redirect(target);
}

function authUnavailable(c: Context, json: boolean) {
	const message =
		"Sign-in is not configured. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SESSION_ENCRYPTION_KEY, and BASE_URL.";
	if (json) return c.json({ error: message }, 503);
	return c.html(
		`<!DOCTYPE html><html><body><p>${message}</p><p>Enable the Auth0 Passwordless Email connection (OTP only).</p></body></html>`,
		503,
	);
}

/** JSON APIs: 401 if signed out. Allows disposable smoke domains for CI smoke testing. */
export function requireOwnerApi() {
	return async (c: Context, next: Next) => {
		const sub = await sessionOwnerSub(c);
		if (!sub) {
			if (c.req.method === "POST" && (c.req.path === "/api/sites" || c.req.path === "/api/sites/")) {
				try {
					// c.req.json() caches on the HonoRequest instance, so the
					// route handler's own later c.req.json() call reuses this
					// parse for free — no extra stream read. Do NOT switch this
					// to c.req.raw.clone(): cloning the raw Request and reading
					// both the clone and the original body separately hung
					// indefinitely on Vercel's Node.js runtime (every real
					// POST /api/sites request timed out with zero response —
					// this is FUNCTION_INVOCATION_TIMEOUT in the smoke-production
					// CI job and "stuck in Registering..." in the dashboard UI).
					const body = (await c.req.json()) as { domain?: string };
					const domain = typeof body?.domain === "string" ? normalizeDomain(body.domain) : null;
					if (domain && isDisposableSmokeDomain(domain)) {
						c.set("ownerSub", "ci:disposable-smoke");
						await next();
						return;
					}
				} catch {}
			}
			const vars = c.var as AuthVars;
			if (!vars.auth0Client) return authUnavailable(c, true);
			return c.json({ error: "Authentication required" }, 401);
		}
		c.set("ownerSub", sub);
		await next();
	};
}

/** HTML pages: send signed-out users through passwordless email login. */
export function requireOwnerPage() {
	return async (c: Context, next: Next) => {
		const sub = await sessionOwnerSub(c);
		if (!sub) {
			const vars = c.var as AuthVars;
			if (!vars.auth0Client) return authUnavailable(c, false);
			return loginRedirect(c);
		}
		c.set("ownerSub", sub);
		await next();
	};
}
