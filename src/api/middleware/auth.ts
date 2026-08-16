import type { Context, Next } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import type { SiteRecord } from "../../types.js";
import { originBelongsToSite } from "../../lib/site-host.js";

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

export type KeyType = "secret" | "public";

type AuthVars = {
	siteId: string;
	site: SiteRecord;
	keyType: KeyType;
	storage: PostgresStorage;
};

/**
 * Validates x-api-key.
 * - write: secret key only (register, analyze)
 * - read: public or secret; public keys must present a matching Origin
 */
export function apiKeyAuth(mode: "read" | "write" = "write") {
	return async (c: Context<{ Variables: AuthVars }>, next: Next) => {
		const apiKey = c.req.header("x-api-key");
		if (!apiKey || typeof apiKey !== "string" || apiKey.length > 128) {
			return c.json({ error: "Missing x-api-key header" }, 401);
		}

		const storage = c.get("storage");
		const found = await storage.getSiteByKey(apiKey);
		if (!found) {
			return c.json({ error: "Invalid API key" }, 401);
		}

		const expected = found.keyType === "secret" ? found.site.apiKey : found.site.publicKey;
		if (!timingSafeEqual(expected, apiKey)) {
			return c.json({ error: "Invalid API key" }, 401);
		}

		if (mode === "write" && found.keyType !== "secret") {
			return c.json(
				{ error: "Public key cannot write. Use the secret key on the server, not in page HTML." },
				403,
			);
		}

		// Secret keys must not be used from browsers (Origin is set by the UA).
		// Sitemap crawls and curl have no Origin. Legacy HTML `data-api-key` beacons
		// will start failing — use data-public-key + sitemap indexing instead.
		if (mode === "write" && found.keyType === "secret" && c.req.header("origin")) {
			return c.json(
				{
					error: "Secret key cannot be used from a browser. Put data-public-key in HTML; index pages via sitemap after verification.",
				},
				403,
			);
		}

		if (mode === "read" && found.keyType === "public") {
			const origin = c.req.header("origin") || "";
			if (!origin || !originBelongsToSite(origin, found.site.domain)) {
				return c.json(
					{
						error: "Public key requires Origin on the site's registered domain (or a subdomain).",
					},
					403,
				);
			}
		}

		c.set("siteId", found.site.id);
		c.set("site", found.site);
		c.set("keyType", found.keyType);
		await next();
	};
}

export function requireVerified() {
	return async (c: Context<{ Variables: AuthVars }>, next: Next) => {
		const site = c.get("site");
		if (!site?.verifiedAt) {
			return c.json(
				{ error: "Domain is not verified. Prove ownership via DNS TXT or /.well-known/agent-404.txt." },
				403,
			);
		}
		await next();
	};
}
