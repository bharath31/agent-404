import { CANONICAL_ORIGIN } from "../config.js";

export type Auth0AppConfig = {
	domain: string;
	clientID: string;
	clientSecret: string;
	baseURL: string;
	sessionSecret: string;
};

function readEnv(env: Record<string, string | undefined> | undefined, key: string): string {
	return (env?.[key] || process.env[key] || "").trim();
}

/** Passwordless Email connection name in Auth0 (OTP to inbox, no password). */
export const AUTH0_PASSWORDLESS_CONNECTION = "email";

export const AUTH_LOGIN_PATH = "/auth/login";
export const AUTH_LOGOUT_PATH = "/auth/logout";
export const AUTH_CALLBACK_PATH = "/auth/callback";

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

	return { domain, clientID, clientSecret, baseURL, sessionSecret };
}
