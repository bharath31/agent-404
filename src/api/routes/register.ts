import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { registerPage } from "../../engine/indexer.js";
import { urlBelongsToSite } from "../../lib/site-host.js";
import type { SiteRecord } from "../../types.js";

type Env = { Variables: { storage: PostgresStorage; siteId: string; site: SiteRecord } };

const register = new Hono<Env>();

register.post("/", async (c) => {
	const siteId = c.get("siteId");
	const storage = c.get("storage");
	const site = c.get("site") || (await storage.getSite(siteId));
	if (!site) {
		return c.json({ error: "Site not found" }, 404);
	}

	const body = await c.req.json<{
		url: string;
		title?: string;
		description?: string;
		headings?: string[];
	}>();

	if (!body.url || typeof body.url !== "string") {
		return c.json({ error: "url is required" }, 400);
	}
	if (body.url.length > 2048) {
		return c.json({ error: "url too long" }, 400);
	}
	if (!urlBelongsToSite(body.url, site.domain)) {
		return c.json(
			{
				error: "url host must match the registered domain or a subdomain of it",
				domain: site.domain,
			},
			400,
		);
	}
	if (body.title && body.title.length > 500) {
		return c.json({ error: "title too long" }, 400);
	}
	if (body.description && body.description.length > 2000) {
		return c.json({ error: "description too long" }, 400);
	}
	if (body.headings && body.headings.length > 50) {
		return c.json({ error: "too many headings" }, 400);
	}

	await registerPage(storage, siteId, {
		url: body.url,
		title: body.title || "",
		description: body.description || "",
		headings: JSON.stringify(body.headings || []),
	});

	return c.json({ ok: true });
});

export { register };
