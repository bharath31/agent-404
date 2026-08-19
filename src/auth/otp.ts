/**
 * Embedded passwordless email-OTP login.
 *
 * The app owns the entire sign-in UI (see src/views/login.ts) and talks to
 * Auth0 server-to-server with two documented endpoints:
 *
 *   1. POST /passwordless/start            → sends the one-time code email
 *   2. POST /oauth/token (passwordless-otp) → exchanges the code for tokens
 *
 * Both calls target a *dedicated* passwordless connection (AUTH0_OTP_CONNECTION,
 * default "agent404-email") that is only used by this app — so its email
 * template and brute-force settings never affect other apps in the shared
 * tenant. The @auth0/auth0-* SDKs hardcode the built-in "email" connection
 * name, which is shared across the tenant, so we call the endpoints directly
 * using the same wire protocol the SDKs use.
 *
 * The resulting id_token is verified against the tenant JWKS (RS256), and the
 * verified claims are stored in a short-lived HMAC-signed session cookie
 * (AUTH0_SESSION_ENCRYPTION_KEY doubles as the HMAC key). Sessions roll:
 * 14 days of inactivity, 30 days absolute from login.
 */

import {
	createHmac,
	createPublicKey,
	timingSafeEqual,
	verify as cryptoVerify,
} from "node:crypto";
import type { Context } from "hono";
import type { Auth0AppConfig } from "./config.js";

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class OtpFlowError extends Error {
	readonly status: number;
	constructor(userMessage: string, status = 400) {
		super(userMessage);
		this.name = "OtpFlowError";
		this.status = status;
	}
	get userMessage(): string {
		return this.message;
	}
}

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const email = raw.trim().toLowerCase();
	if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
	return email;
}

export function normalizeCode(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const code = raw.replace(/[\s-]/g, "");
	if (!/^\d{4,8}$/.test(code)) return null;
	return code;
}

/** Only allow relative in-site return paths (no protocol-relative, no absolute). */
export function safeReturnTo(raw: unknown, fallback = "/dashboard"): string {
	if (typeof raw !== "string") return fallback;
	const value = raw.trim();
	if (
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.includes("\\") ||
		value.includes("\u0000")
	) {
		return fallback;
	}
	if (value.length > 2048) return fallback;
	return value;
}

/* ------------------------------------------------------------------ */
/* 1. Send the one-time code                                           */
/* ------------------------------------------------------------------ */

type FetchImpl = typeof fetch;

export async function sendOtpCode(
	cfg: Auth0AppConfig,
	email: string,
	fetchImpl: FetchImpl = fetch,
): Promise<void> {
	const url = `https://${cfg.domain}/passwordless/start`;
	let res: Response;
	try {
		res = await fetchImpl(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				client_id: cfg.clientID,
				client_secret: cfg.clientSecret,
				connection: cfg.otpConnection,
				email,
				send: "code",
			}),
		});
	} catch (err) {
		console.error("[otp] passwordless/start network error:", err);
		throw new OtpFlowError(
			"We couldn't reach the sign-in service. Try again in a moment.",
			502,
		);
	}

	if (res.ok) return;

	const body = await res.json().catch(() => null) as
		| { error?: string; error_description?: string }
		| null;
	const detail = body?.error_description || body?.error || `HTTP ${res.status}`;
	console.error(`[otp] passwordless/start failed (${res.status}):`, detail);

	if (res.status === 429) {
		throw new OtpFlowError(
			"Too many sign-in attempts. Wait a minute, then try again.",
			429,
		);
	}
	if (res.status === 404) {
		throw new OtpFlowError(
			"Sign-in isn't configured for this app yet. Check AUTH0_OTP_CONNECTION.",
			503,
		);
	}
	throw new OtpFlowError("We couldn't send the code. Try again.", 502);
}

/* ------------------------------------------------------------------ */
/* 2. Exchange the code for tokens + verify the id_token               */
/* ------------------------------------------------------------------ */

export interface OtpIdentity {
	sub: string;
	email?: string;
	name?: string;
	sid?: string;
	iss: string;
}

export async function exchangeOtpCode(
	cfg: Auth0AppConfig,
	email: string,
	code: string,
	fetchImpl: FetchImpl = fetch,
): Promise<OtpIdentity> {
	const params = new URLSearchParams({
		grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
		client_id: cfg.clientID,
		client_secret: cfg.clientSecret,
		realm: cfg.otpConnection,
		username: email,
		otp: code,
		scope: "openid profile email",
	});

	let res: Response;
	try {
		res = await fetchImpl(`https://${cfg.domain}/oauth/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: params.toString(),
		});
	} catch (err) {
		console.error("[otp] token endpoint network error:", err);
		throw new OtpFlowError(
			"We couldn't reach the sign-in service. Try again in a moment.",
			502,
		);
	}

	const body = (await res.json().catch(() => null)) as
		| {
				access_token?: string;
				id_token?: string;
				error?: string;
				error_description?: string;
		  }
		| null;

	if (!res.ok || !body?.id_token) {
		const detail = body?.error_description || body?.error || `HTTP ${res.status}`;
		console.error(`[otp] code exchange failed (${res.status}):`, detail);
		if (res.status === 429) {
			throw new OtpFlowError(
				"Too many sign-in attempts. Wait a minute, then try again.",
				429,
			);
		}
		throw new OtpFlowError(
			"That code isn't right or has expired. Request a new code if needed.",
			401,
		);
	}

	const claims = await verifyIdToken(
		body.id_token,
		cfg.domain,
		cfg.clientID,
		fetchImpl,
	);
	return {
		sub: claims.sub,
		email: claims.email,
		name: claims.name,
		sid: typeof claims.sid === "string" ? claims.sid : undefined,
		iss: claims.iss,
	};
}

/* ---- id_token verification (JWKS / RS256) ---- */

interface Jwk {
	kid?: string;
	kty?: string;
	use?: string;
	n?: string;
	e?: string;
	[claim: string]: unknown;
}

interface JwksCache {
	domain: string;
	keys: Jwk[];
	fetchedAt: number;
}

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: JwksCache | null = null;

async function getJwks(
	domain: string,
	fetchImpl: FetchImpl,
): Promise<Jwk[]> {
	if (
		jwksCache &&
		jwksCache.domain === domain &&
		Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS
	) {
		return jwksCache.keys;
	}
	let lastError: unknown;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetchImpl(`https://${domain}/.well-known/jwks.json`);
			if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
			const data = (await res.json()) as { keys?: Jwk[] };
			if (!Array.isArray(data.keys) || data.keys.length === 0) {
				throw new Error("JWKS has no keys");
			}
			jwksCache = { domain, keys: data.keys, fetchedAt: Date.now() };
			return data.keys;
		} catch (err) {
			lastError = err;
			if (attempt === 0) await new Promise((r) => setTimeout(r, 150));
		}
	}
	console.error("[otp] JWKS fetch failed:", lastError);
	throw new OtpFlowError(
		"We couldn't verify your sign-in. Try again in a moment.",
		502,
	);
}

function decodeSegment(segment: string): Record<string, unknown> {
	return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<
		string,
		unknown
	>;
}

export async function verifyIdToken(
	token: string,
	domain: string,
	expectedAud: string,
	fetchImpl: FetchImpl = fetch,
): Promise<OtpIdentity> {
	const parts = token.split(".");
	if (parts.length !== 3) {
		throw new OtpFlowError("We couldn't verify your sign-in. Try again.", 502);
	}
	const [headerSeg, payloadSeg, signatureSeg] = parts;

	const header = decodeSegment(headerSeg);
	if (header.alg !== "RS256") {
		throw new OtpFlowError("We couldn't verify your sign-in. Try again.", 502);
	}

	const keys = await getJwks(domain, fetchImpl);
	const kid = typeof header.kid === "string" ? header.kid : undefined;
	const jwk =
		kid !== undefined
			? keys.find((k) => k.kid === kid)
			: keys.length === 1
			  ? keys[0]
			  : undefined;
	if (!jwk || jwk.kty !== "RSA") {
		throw new OtpFlowError("We couldn't verify your sign-in. Try again.", 502);
	}

	let publicKey;
	try {
		publicKey = createPublicKey({ key: jwk, format: "jwk" });
	} catch (err) {
		console.error("[otp] bad JWK:", err);
		throw new OtpFlowError("We couldn't verify your sign-in. Try again.", 502);
	}

	const valid = cryptoVerify(
		"sha256",
		Buffer.from(`${headerSeg}.${payloadSeg}`, "utf8"),
		publicKey,
		Buffer.from(signatureSeg, "base64url"),
	);
	if (!valid) {
		throw new OtpFlowError("We couldn't verify your sign-in. Try again.", 502);
	}

	const claims = decodeSegment(payloadSeg);
	const now = Math.floor(Date.now() / 1000);
	if (claims.iss !== `https://${domain}`) {
		throw new OtpFlowError("We couldn't verify your sign-in. Try again.", 502);
	}
	const auds = Array.isArray(claims.aud)
		? (claims.aud as string[])
		: [claims.aud as string];
	if (!auds.includes(expectedAud)) {
		throw new OtpFlowError("We couldn't verify your sign-in. Try again.", 502);
	}
	if (typeof claims.exp !== "number" || claims.exp <= now) {
		throw new OtpFlowError("We couldn't verify your sign-in. Try again.", 502);
	}
	if (typeof claims.sub !== "string" || claims.sub.length === 0) {
		throw new OtpFlowError("We couldn't verify your sign-in. Try again.", 502);
	}

	const str = (v: unknown): string | undefined =>
		typeof v === "string" && v.length > 0 ? v : undefined;
	return {
		sub: claims.sub as string,
		email: str(claims.email),
		name: str(claims.name),
		sid: str(claims.sid),
		iss: claims.iss as string,
	};
}

/* ------------------------------------------------------------------ */
/* 3. App-owned session cookie (HMAC-signed JWT, HS256)                */
/* ------------------------------------------------------------------ */

import {
	AUTH_SESSION_COOKIE,
	SESSION_ABSOLUTE_SECONDS,
	SESSION_INACTIVITY_SECONDS,
} from "./config.js";

export interface SessionClaims {
	sub: string;
	email?: string;
	name?: string;
	iss: string;
	sid?: string;
	/** Unix seconds. Fixed at login; caps the session at the absolute duration. */
	login_at: number;
	iat: number;
	exp: number;
}

function b64url(input: string | Buffer): string {
	return Buffer.from(input).toString("base64url");
}

function signHs256(payload: SessionClaims, secret: string): string {
	const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = b64url(JSON.stringify(payload));
	const signature = createHmac("sha256", secret)
		.update(`${header}.${body}`)
		.digest("base64url");
	return `${header}.${body}.${signature}`;
}

function verifyHs256(
	token: string,
	secret: string,
): Record<string, unknown> | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [headerSeg, payloadSeg, signatureSeg] = parts;
	const expected = createHmac("sha256", secret)
		.update(`${headerSeg}.${payloadSeg}`)
		.digest();
	const got = Buffer.from(signatureSeg, "base64url");
	if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
		return null;
	}
	try {
		const header = JSON.parse(Buffer.from(headerSeg, "base64url").toString("utf8"));
		if (header.alg !== "HS256") return null;
		return JSON.parse(Buffer.from(payloadSeg, "base64url").toString("utf8"));
	} catch {
		return null;
	}
}

export function computeSessionExpiry(loginAt: number, now: number): number {
	return Math.min(loginAt + SESSION_ABSOLUTE_SECONDS, now + SESSION_INACTIVITY_SECONDS);
}

/** Re-issue when less than half the inactivity window remains. */
export function sessionNeedsRoll(claims: SessionClaims, now: number): boolean {
	return claims.exp - now < SESSION_INACTIVITY_SECONDS / 2;
}

export function issueSessionCookie(
	identity: OtpIdentity,
	secret: string,
	now: number = Math.floor(Date.now() / 1000),
): { value: string; maxAge: number } {
	const claims: SessionClaims = {
		sub: identity.sub,
		email: identity.email,
		name: identity.name,
		iss: identity.iss,
		sid: identity.sid,
		login_at: now,
		iat: now,
		exp: computeSessionExpiry(now, now),
	};
	return { value: signHs256(claims, secret), maxAge: claims.exp - now };
}

export interface ParsedSession {
	claims: SessionClaims;
	roll: boolean;
}

/**
 * Read + verify the app session cookie. Returns null when absent/invalid/
 * expired (including sessions past the absolute duration).
 */
export function readSessionCookie(
	c: Context,
	secret: string,
	now: number = Math.floor(Date.now() / 1000),
): ParsedSession | null {
	const token = c.req.header(AUTH_SESSION_COOKIE);
	if (!token) return null;
	const raw = verifyHs256(token, secret);
	if (!raw) return null;
	const loginAt = typeof raw.login_at === "number" ? raw.login_at : NaN;
	const exp = typeof raw.exp === "number" ? raw.exp : NaN;
	const sub = typeof raw.sub === "string" ? raw.sub : "";
	if (!sub || Number.isNaN(exp) || exp <= now) return null;
	// Hard cap: absolute duration from login.
	if (!Number.isNaN(loginAt) && exp > loginAt + SESSION_ABSOLUTE_SECONDS) {
		return null;
	}
	const claims: SessionClaims = {
		sub,
		email: typeof raw.email === "string" ? raw.email : undefined,
		name: typeof raw.name === "string" ? raw.name : undefined,
		iss: typeof raw.iss === "string" ? raw.iss : "",
		sid: typeof raw.sid === "string" ? raw.sid : undefined,
		login_at: Number.isNaN(loginAt) ? now : loginAt,
		iat: typeof raw.iat === "number" ? raw.iat : now,
		exp,
	};
	return { claims, roll: sessionNeedsRoll(claims, now) };
}

/** Re-issue a rolled session (extends inactivity, keeps the absolute cap). */
export function rollSessionCookie(
	claims: SessionClaims,
	secret: string,
	now: number = Math.floor(Date.now() / 1000),
): { value: string; maxAge: number } | null {
	const exp = computeSessionExpiry(claims.login_at, now);
	if (exp <= now) return null;
	const rolled: SessionClaims = { ...claims, iat: now, exp };
	return { value: signHs256(rolled, secret), maxAge: exp - now };
}

export function sessionCookieString(
	value: string,
	maxAgeSeconds: number,
): string {
	return [
		`${AUTH_SESSION_COOKIE}=${encodeURIComponent(value)}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		"Secure",
		`Max-Age=${Math.max(1, Math.floor(maxAgeSeconds))}`,
	].join("; ");
}

export function clearSessionCookieString(): string {
	return `${AUTH_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}