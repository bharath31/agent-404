/**
 * Embedded one-time-code sign-in (app-owned, no Auth0 OTP involvement).
 *
 * The app generates the 6-digit code, emails it itself via Resend (see
 * src/lib/email.ts), stores only its SHA-256 hash in Postgres (see
 * src/storage/otp.ts), and verifies it here. Once the code checks out, the
 * Auth0 Management API maps the verified email to a stable `sub`
 * (src/auth/mgmt.ts), which is stored in a short-lived HMAC-signed session
 * cookie. Sessions roll: 14 days of inactivity, 30 days absolute from login.
 *
 * The tenant's email provider, email templates, and connections are never
 * involved — nothing in the shared Auth0 tenant changes.
 */

import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { AUTH_SESSION_COOKIE, SESSION_ABSOLUTE_SECONDS, SESSION_INACTIVITY_SECONDS } from "./config";

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
/* OTP generation + verification                                       */
/* ------------------------------------------------------------------ */

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
	// randomInt with a range that is a multiple of 10 keeps digits uniform.
	return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

export function hashOtp(code: string): string {
	return createHash("sha256").update(code).digest("hex");
}

/** Constant-time comparison of the entered code against the stored hash. */
export function verifyOtp(code: string, storedHash: string): boolean {
	const candidate = createHash("sha256").update(code).digest();
	const expected = Buffer.from(storedHash, "hex");
	if (candidate.length !== expected.length) return false;
	return timingSafeEqual(candidate, expected);
}

/* ------------------------------------------------------------------ */
/* Session identity (from the Auth0 Management API user)               */
/* ------------------------------------------------------------------ */

export interface OtpIdentity {
	sub: string;
	email?: string;
	name?: string;
	iss: string;
	sid?: string;
}

/* ------------------------------------------------------------------ */
/* App-owned session cookie (HMAC-signed JWT, HS256)                   */
/* ------------------------------------------------------------------ */

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
	return Math.min(
		loginAt + SESSION_ABSOLUTE_SECONDS,
		now + SESSION_INACTIVITY_SECONDS,
	);
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
type CookieSource =
	| string
	| Request
	| { get: (name: string) => unknown }
	| {
		cookies?: { get: (name: string) => unknown };
		req?: { header?: (name: string) => string | undefined };
		headers?: Headers | { get: (name: string) => string | null };
	};

function cookieValue(source: CookieSource): string | null {
	if (typeof source === "string") {
		// A raw token has two dots. Everything else is interpreted as a Cookie
		// header, which keeps this helper useful outside of any web framework.
		if (source.split(".").length === 3 && !source.includes("=")) return source;
		const match = source.match(new RegExp(`(?:^|;\\s*)${AUTH_SESSION_COOKIE}=([^;]*)`));
		if (!match) return null;
		try {
			return decodeURIComponent(match[1]);
		} catch {
			return null;
		}
	}
	const honoCookie = "req" in source ? source.req?.header?.("cookie") : undefined;
	if (honoCookie) return cookieValue(honoCookie);
	if ("get" in source && typeof source.get === "function") {
		const value = source.get(AUTH_SESSION_COOKIE) as { value?: string } | string | undefined;
		if (typeof value === "string") return value;
		return typeof value?.value === "string" ? value.value : null;
	}
	const cookies = "cookies" in source ? source.cookies : undefined;
	const fromJar = cookies?.get(AUTH_SESSION_COOKIE) as { value?: string } | string | undefined;
	if (typeof fromJar === "string") return fromJar;
	if (fromJar && typeof fromJar.value === "string") return fromJar.value;
	if (source instanceof Request) return cookieValue(source.headers.get("cookie") || "");
	const directHeaders = "headers" in source ? source.headers : undefined;
	const directCookie = directHeaders?.get("cookie");
	if (directCookie) return cookieValue(directCookie);
	return null;
}

export function readSessionCookie(
	source: CookieSource,
	secret: string,
	now: number = Math.floor(Date.now() / 1000),
): ParsedSession | null {
	const token = cookieValue(source);
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
