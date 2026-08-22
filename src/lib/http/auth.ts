import type { PostgresStorage } from "../../storage/postgres";
import type { SiteRecord } from "../../types";
import { readAuth0Config } from "../../auth/config";
import {
	readSessionCookie,
	rollSessionCookie,
	sessionCookieString,
} from "../../auth/otp";
import { originBelongsToSite } from "../site-host";
import { json } from "./responses";

export type KeyType = "secret" | "public";
export type ApiCredential = { site: SiteRecord; siteId: string; keyType: KeyType };

export async function authenticateApiKey(
	request: Request,
	storage: PostgresStorage,
	mode: "read" | "write" = "write",
): Promise<ApiCredential | Response> {
	const apiKey = request.headers.get("x-api-key") || "";
	if (!apiKey || apiKey.length > 128) return json(request, { error: "Missing x-api-key header" }, 401);
	const found = await storage.getSiteByKey(apiKey);
	if (!found) return json(request, { error: "Invalid API key" }, 401);
	// Storage verifies current and overlapping previous credentials. A second
	// comparison against the active fields would reject a valid previous key.
	if (mode === "write" && found.keyType !== "secret") {
		return json(request, { error: "Public key cannot write. Use the secret key on the server, not in page HTML." }, 403);
	}
	if (mode === "write" && request.headers.get("origin")) {
		return json(request, {
			error: "Secret key cannot be used from a browser. Put data-public-key in HTML; index pages via sitemap after verification.",
		}, 403);
	}
	if (mode === "read" && found.keyType === "public") {
		const origin = request.headers.get("origin") || "";
		if (!origin || !originBelongsToSite(origin, found.site.domain)) {
			return json(request, {
				error: "Public key requires Origin on the site's registered domain (or a subdomain).",
			}, 403);
		}
	}
	return { site: found.site, siteId: found.site.id, keyType: found.keyType };
}

export function requireVerified(request: Request, credential: ApiCredential): Response | null {
	if (credential.site.verifiedAt) return null;
	return json(request, {
		error: "Domain is not verified. Prove ownership via DNS TXT or /.well-known/agent-404.txt.",
	}, 403);
}

export type RequestOwner = {
	ownerSub: string;
	rolledCookie?: string;
	email?: string;
	name?: string;
};

export function requestOwner(request: Request): RequestOwner | Response {
	const config = readAuth0Config();
	if (!config) {
		return json(request, {
			error: "Sign-in is not configured. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SESSION_ENCRYPTION_KEY, and BASE_URL.",
		}, 503);
	}
	const parsed = readSessionCookie(request, config.sessionSecret);
	if (!parsed) return json(request, { error: "Authentication required" }, 401);
	let rolledCookie: string | undefined;
	if (parsed.roll) {
		const rolled = rollSessionCookie(parsed.claims, config.sessionSecret);
		if (rolled) rolledCookie = sessionCookieString(rolled.value, rolled.maxAge);
	}
	return {
		ownerSub: parsed.claims.sub,
		email: parsed.claims.email,
		name: parsed.claims.name,
		rolledCookie,
	};
}

export function attachRolledCookie(response: Response, owner: RequestOwner): Response {
	if (owner.rolledCookie) response.headers.append("Set-Cookie", owner.rolledCookie);
	return response;
}

/** Browser cookie mutations must come from this origin. Non-browser clients
 * without Origin remain compatible; Sec-Fetch-Site still catches stripped
 * cross-site browser requests. */
export function requireSameOrigin(request: Request): Response | null {
	const fetchSite = request.headers.get("sec-fetch-site");
	if (fetchSite === "cross-site") return json(request, { error: "Invalid request origin" }, 403);
	const origin = request.headers.get("origin");
	if (!origin) return null;
	const url = new URL(request.url);
	const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
	const forwardedProto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
	let actual: URL;
	try {
		actual = new URL(origin);
	} catch {
		return json(request, { error: "Invalid request origin" }, 403);
	}
	if (`${actual.protocol}//${actual.host}` !== `${forwardedProto}://${forwardedHost}`) {
		return json(request, { error: "Invalid request origin" }, 403);
	}
	return null;
}
