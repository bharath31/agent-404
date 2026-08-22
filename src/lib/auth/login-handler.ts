import { getDatabaseUrl } from "../../config";
import { readResendConfig, sendOtpEmail } from "../email";
import { PostgresOtpStore, type OtpStore } from "../../storage/otp";
import { readAuth0Config } from "../../auth/config";
import { findOrCreateUser } from "../../auth/mgmt";
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
} from "../../auth/otp";
import { apiHeaders } from "../http/responses";
import { requireSameOrigin } from "../http/auth";
import { renderLoginPage } from "./login-view";

let injectedOtpStore: OtpStore | null = null;

export function __setNextOtpStoreForTests(store: OtpStore | null): void {
	injectedOtpStore = store;
}

function otpStore(): OtpStore | null {
	if (injectedOtpStore) return injectedOtpStore;
	const databaseUrl = getDatabaseUrl();
	return databaseUrl ? new PostgresOtpStore(databaseUrl) : null;
}

function html(request: Request, body: string, status = 200, headers?: HeadersInit): Response {
	const responseHeaders = apiHeaders(request, headers);
	responseHeaders.set("Content-Type", "text/html; charset=utf-8");
	return new Response(body, { status, headers: responseHeaders });
}

function redirect(request: Request, location: string, headers?: HeadersInit): Response {
	const responseHeaders = apiHeaders(request, headers);
	responseHeaders.set("Location", location);
	return new Response(null, { status: 302, headers: responseHeaders });
}

function authNotConfigured(request: Request): Response {
	return html(request, renderLoginPage({ unavailable: true, error: "Set the required authentication and email delivery configuration, then try again." }), 503);
}

function signInUnavailable(request: Request): Response {
	return html(request, renderLoginPage({ state: "email", error: "Sign-in is temporarily unavailable. Try again in a moment." }), 502);
}

function pageError(error: unknown, fallback: string): string {
	if (error instanceof OtpFlowError) return error.userMessage;
	console.error("[login] unexpected error:", error);
	return fallback;
}

async function readForm(request: Request): Promise<Record<string, string>> {
	const params = new URLSearchParams(await request.text().catch(() => ""));
	return Object.fromEntries(params.entries());
}

const RESEND_COOLDOWN_MS = 30_000;

async function sendCode(store: OtpStore, email: string): Promise<string | null> {
	const pending = await store.getOtp(email);
	if (pending && Date.now() - pending.createdAt.getTime() < RESEND_COOLDOWN_MS) {
		const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - pending.createdAt.getTime())) / 1000);
		return `Please wait ${wait}s before requesting another code.`;
	}
	const emailConfig = readResendConfig(undefined);
	if (!emailConfig) return null;
	const code = generateOtp();
	try {
		await store.saveOtp(email, hashOtp(code), new Date(Date.now() + OTP_TTL_MS));
		await sendOtpEmail(emailConfig, email, code);
	} catch (error) {
		await store.deleteOtp(email).catch(() => undefined);
		return pageError(error, "We couldn't send the code. Try again.");
	}
	return null;
}

export async function loginPage(request: Request): Promise<Response> {
	const config = readAuth0Config();
	if (!config) return authNotConfigured(request);
	if (readSessionCookie(request, config.sessionSecret)) return redirect(request, "/dashboard");
	return html(request, renderLoginPage({ returnTo: safeReturnTo(new URL(request.url).searchParams.get("return_to")) }));
}

export async function requestLoginCode(request: Request): Promise<Response> {
	const originError = requireSameOrigin(request);
	if (originError) return originError;
	const config = readAuth0Config();
	if (!config || !readResendConfig(undefined)) return authNotConfigured(request);
	const body = await readForm(request);
	const returnTo = safeReturnTo(body.return_to);
	const email = normalizeEmail(body.email);
	if (!email) return html(request, renderLoginPage({ state: "email", error: "Enter a valid email address.", returnTo }));
	const store = otpStore();
	if (!store) return signInUnavailable(request);
	const error = await sendCode(store, email);
	return html(request, renderLoginPage(error
		? { state: "email", email, error, returnTo }
		: { state: "code", email, returnTo }));
}

export async function verifyLoginCode(request: Request): Promise<Response> {
	const originError = requireSameOrigin(request);
	if (originError) return originError;
	const config = readAuth0Config();
	if (!config) return authNotConfigured(request);
	const body = await readForm(request);
	const email = normalizeEmail(body.email);
	const code = normalizeCode(body.code);
	const returnTo = safeReturnTo(body.return_to);
	if (!email || !code) return html(request, renderLoginPage({
		state: "code", email: email ?? "", error: "Enter the one-time code we emailed you.", returnTo,
	}));
	const store = otpStore();
	if (!store) return signInUnavailable(request);
	const pending = await store.getOtp(email);
	if (!pending) return html(request, renderLoginPage({
		state: "code", email, error: "That code has expired or was already used. Request a new code if needed.", returnTo,
	}));
	if (pending.expiresAt.getTime() <= Date.now()) {
		await store.deleteOtp(email).catch(() => undefined);
		return html(request, renderLoginPage({ state: "code", email, error: "That code has expired. Request a new code.", returnTo }));
	}
	if (!verifyOtp(code, pending.codeHash)) {
		const attempts = await store.incrementAttempts(email);
		if (attempts >= OTP_MAX_ATTEMPTS) {
			await store.deleteOtp(email).catch(() => undefined);
			return html(request, renderLoginPage({ state: "code", email, error: "Too many incorrect attempts. Request a new code to try again.", returnTo }));
		}
		return html(request, renderLoginPage({ state: "code", email, error: "That code isn't right. Check the email and try again.", returnTo }));
	}
	await store.deleteOtp(email).catch(() => undefined);
	let identity: OtpIdentity;
	try {
		const user = await findOrCreateUser(config, email);
		identity = { sub: user.sub, email: user.email, name: user.name, iss: `https://${config.domain}` };
	} catch (error) {
		return html(request, renderLoginPage({
			state: "code", email, error: pageError(error, "We couldn't finish signing you in. Try again."), returnTo,
		}));
	}
	const cookie = issueSessionCookie(identity, config.sessionSecret);
	return redirect(request, returnTo, { "Set-Cookie": sessionCookieString(cookie.value, cookie.maxAge) });
}

export async function resendLoginCode(request: Request): Promise<Response> {
	const originError = requireSameOrigin(request);
	if (originError) return originError;
	const config = readAuth0Config();
	if (!config || !readResendConfig(undefined)) return authNotConfigured(request);
	const body = await readForm(request);
	const email = normalizeEmail(body.email);
	const returnTo = safeReturnTo(body.return_to);
	if (!email) return html(request, renderLoginPage({ state: "email", returnTo }));
	const store = otpStore();
	if (!store) return signInUnavailable(request);
	const error = await sendCode(store, email);
	return html(request, renderLoginPage({ state: "code", email, ...(error ? { error } : {}), returnTo }));
}

export function logout(request: Request): Response {
	const config = readAuth0Config();
	const returnTo = safeReturnTo(new URL(request.url).searchParams.get("return_to"), "/");
	const headers = apiHeaders(request);
	headers.append("Set-Cookie", clearSessionCookieString());
	headers.append("Set-Cookie", "appSession=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0");
	if (config) {
		const target = `${config.baseURL}${returnTo === "/" ? "" : returnTo}`;
		headers.set("Location", `https://${config.domain}/v2/logout?client_id=${encodeURIComponent(config.clientID)}&returnTo=${encodeURIComponent(target)}`);
	} else headers.set("Location", returnTo);
	return new Response(null, { status: 302, headers });
}
