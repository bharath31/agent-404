/**
 * Auth0 Management API — find or create the user for a verified email.
 *
 * The app verifies email ownership itself (its own OTP). When the email
 * belongs to an existing Auth0 user (any connection), we reuse that sub so
 * existing sites/ownership keep working. Otherwise we create the user via
 * the Management API with email_verified=true (ownership was just proven).
 *
 * Requires a per-app client grant to the Management API (read:users +
 * create:users) on the agent-404 client — no tenant-level changes.
 */

import type { Auth0AppConfig } from "./config.js";
import { OtpFlowError } from "./otp.js";

export interface MgmtUser {
	sub: string;
	email: string;
	name?: string;
}

const TENANT_DEFAULT_CONNECTION = "Username-Password-Authentication";

/* ---- access token (client credentials, cached) ---- */

interface TokenCache {
	domain: string;
	clientId: string;
	token: string;
	expiresAt: number;
}

let tokenCache: TokenCache | null = null;

/** Test seam: clear the cached Management API token. */
export function __resetMgmtCache(): void {
	tokenCache = null;
}

export async function getMgmtToken(
	cfg: Auth0AppConfig,
	fetchImpl: typeof fetch = fetch,
): Promise<string> {
	const audience = `https://${cfg.domain}/api/v2/`;
	if (
		tokenCache &&
		tokenCache.domain === cfg.domain &&
		tokenCache.clientId === cfg.clientID &&
		Date.now() < tokenCache.expiresAt
	) {
		return tokenCache.token;
	}

	let res: Response;
	try {
		res = await fetchImpl(`https://${cfg.domain}/oauth/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: cfg.clientID,
				client_secret: cfg.clientSecret,
				audience,
			}).toString(),
			signal: AbortSignal.timeout(15_000),
		});
	} catch (err) {
		console.error("[mgmt] token request network error:", err);
		throw new OtpFlowError("Sign-in is temporarily unavailable. Try again.", 502);
	}
	const body = (await res.json().catch(() => null)) as
		| { access_token?: string; expires_in?: number; error_description?: string }
		| null;
	if (!res.ok || !body?.access_token) {
		console.error(
			"[mgmt] token request failed:",
			body?.error_description || `HTTP ${res.status}`,
		);
		throw new OtpFlowError("Sign-in is temporarily unavailable. Try again.", 502);
	}
	tokenCache = {
		domain: cfg.domain,
		clientId: cfg.clientID,
		token: body.access_token,
		expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000,
	};
	return body.access_token;
}

/* ---- users ---- */

async function findUserByEmail(
	cfg: Auth0AppConfig,
	token: string,
	email: string,
	fetchImpl: typeof fetch,
): Promise<MgmtUser | null> {
	const url = `https://${cfg.domain}/api/v2/users-by-email?email=${encodeURIComponent(email)}`;
	let res: Response;
	try {
		res = await fetchImpl(url, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(15_000),
		});
	} catch (err) {
		console.error("[mgmt] users-by-email network error:", err);
		throw new OtpFlowError("Sign-in is temporarily unavailable. Try again.", 502);
	}
	if (!res.ok) {
		console.error(`[mgmt] users-by-email failed (${res.status})`);
		throw new OtpFlowError("Sign-in is temporarily unavailable. Try again.", 502);
	}
	const users = (await res.json().catch(() => [])) as Array<{
		user_id?: string;
		email?: string;
		name?: string;
	}>;
	const first = users[0];
	if (!first?.user_id) return null;
	return {
		sub: first.user_id,
		email: first.email || email,
		name: first.name,
	};
}

async function createUser(
	cfg: Auth0AppConfig,
	token: string,
	email: string,
	fetchImpl: typeof fetch,
): Promise<MgmtUser> {
	let res: Response;
	try {
		res = await fetchImpl(`https://${cfg.domain}/api/v2/users`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email,
				email_verified: true,
				verify_email: false,
				connection: TENANT_DEFAULT_CONNECTION,
				user_metadata: { sign_in: "embedded-otp" },
			}),
			signal: AbortSignal.timeout(15_000),
		});
	} catch (err) {
		console.error("[mgmt] create user network error:", err);
		throw new OtpFlowError("Sign-in is temporarily unavailable. Try again.", 502);
	}
	const body = (await res.json().catch(() => null)) as
		| { user_id?: string; email?: string; name?: string }
		| null;
	if (!res.ok || !body?.user_id) {
		console.error(
			`[mgmt] create user failed (${res.status}):`,
			(body as { message?: string } | null)?.message ?? "",
		);
		throw new OtpFlowError("We couldn't finish signing you in. Try again.", 502);
	}
	return { sub: body.user_id, email: body.email || email, name: body.name };
}

/** Find an existing Auth0 user by email, or create one. Never touches other apps. */
export async function findOrCreateUser(
	cfg: Auth0AppConfig,
	email: string,
	fetchImpl: typeof fetch = fetch,
): Promise<MgmtUser> {
	const token = await getMgmtToken(cfg, fetchImpl);
	const existing = await findUserByEmail(cfg, token, email, fetchImpl);
	if (existing) return existing;
	return createUser(cfg, token, email, fetchImpl);
}