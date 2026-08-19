import { CANONICAL_ORIGIN } from "../config.js";

export type Auth0AppConfig = {
	domain: string;
	clientID: string;
	clientSecret: string;
	baseURL: string;
	sessionSecret: string;
	otpConnection: string;
};

function readEnv(env: Record<string, string | undefined> | undefined, key: string): string {
	return (env?.[key] || process.env[key] || "").trim();
}

/** Passwordless Email connection name in Auth0 (OTP to inbox, no password). */
export const AUTH0_PASSWORDLESS_CONNECTION = "email";

export const AUTH_LOGIN_PATH = "/auth/login";
export const AUTH_LOGOUT_PATH = "/auth/logout";
export const AUTH_CALLBACK_PATH = "/auth/callback";

/** App-owned session cookie for the embedded OTP login flow. */
export const AUTH_SESSION_COOKIE = "a404_session";

/** Session lifetimes (seconds): 14 days idle, 30 days absolute, rolling. */
export const SESSION_INACTIVITY_SECONDS = 14 * 24 * 3600;
export const SESSION_ABSOLUTE_SECONDS = 30 * 24 * 3600;

/**
 * Passwordless connection dedicated to this app. It must NOT be the tenant's
 * shared "email" connection — the per-connection email template belongs to
 * every app that uses that connection.
 */
export const DEFAULT_OTP_CONNECTION = "agent404-email";

export function readAuth0Config(
	env?: Record<string, string | undefined>,
): Auth0AppConfig | null {
	const domain = readEnv(env, "AUTH0_DOMAIN");
	const clientID = readEnv(env, "AUTH0_CLIENT_ID");
	const clientSecret = readEnv(env, "AUTH0_CLIENT_SECRET");
	const sessionSecret = readEnv(env, "AUTH0_SESSION_ENCRYPTION_KEY");
	const baseURL =
		readEnv(env, "APP_BASE_URL") || readEnv(env, "BASE_URL") || CANONICAL_ORIGIN;

	if (!domain || !clientID || !clientSecret || sessionSecret.length < 32) {
		return null;
	}

	const otpConnection = readEnv(env, "AUTH0_OTP_CONNECTION") || DEFAULT_OTP_CONNECTION;

	return { domain, clientID, clientSecret, baseURL, sessionSecret, otpConnection };
}
