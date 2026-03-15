import type { Context, Next } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

/**
 * Validates x-api-key header and attaches site to context.
 */
export function apiKeyAuth() {
	return async (
		c: Context<{ Variables: { siteId: string; storage: PostgresStorage } }>,
		next: Next,
	) => {
		const apiKey = c.req.header("x-api-key");
		if (!apiKey || typeof apiKey !== "string" || apiKey.length > 128) {
			return c.json({ error: "Missing x-api-key header" }, 401);
		}

		const storage = c.get("storage");
		const site = await storage.getSiteByApiKey(apiKey);
		if (!site) {
			return c.json({ error: "Invalid API key" }, 401);
		}

		// Timing-safe comparison to prevent timing attacks
		if (!timingSafeEqual(site.apiKey, apiKey)) {
			return c.json({ error: "Invalid API key" }, 401);
		}

		c.set("siteId", site.id);
		await next();
	};
}
