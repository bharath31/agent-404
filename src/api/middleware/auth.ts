import type { Context, Next } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";

/**
 * Validates x-api-key header and attaches site to context.
 */
export function apiKeyAuth() {
	return async (
		c: Context<{ Variables: { siteId: string; storage: PostgresStorage } }>,
		next: Next,
	) => {
		const apiKey = c.req.header("x-api-key");
		if (!apiKey) {
			return c.json({ error: "Missing x-api-key header" }, 401);
		}

		const storage = c.get("storage");
		const site = await storage.getSiteByApiKey(apiKey);
		if (!site) {
			return c.json({ error: "Invalid API key" }, 401);
		}

		c.set("siteId", site.id);
		await next();
	};
}
