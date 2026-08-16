import type { Context, Next } from "hono";
import type { ServerClient } from "@auth0/auth0-server-js";
import { AUTH_LOGIN_PATH } from "./config.js";
import { normalizeDomain } from "../api/domain.js";
import { isDisposableSmokeDomain } from "../lib/disposable-smoke-domain.js";

type AuthVars = {
	ownerSub?: string;
	auth0Client?: ServerClient<Context>;
};

export async function sessionOwnerSub(c: Context): Promise<string | null> {
	const vars = c.var as AuthVars;
	if (vars.ownerSub) return vars.ownerSub;

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
					// POST /api/sites request timed out with zero response).
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
