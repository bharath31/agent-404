import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { registerPage } from "../../engine/indexer.js";

type Env = { Variables: { storage: PostgresStorage; siteId: string } };

const register = new Hono<Env>();

// Beacon: register/update a page
register.post("/", async (c) => {
	const siteId = c.get("siteId");
	const storage = c.get("storage");

	const body = await c.req.json<{
		url: string;
		title?: string;
		description?: string;
		headings?: string[];
		contentHash?: string;
	}>();

	if (!body.url || typeof body.url !== "string") {
		return c.json({ error: "url is required" }, 400);
	}
	if (body.url.length > 2048) {
		return c.json({ error: "url too long" }, 400);
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

	if (body.contentHash && body.contentHash.length > 128) {
		return c.json({ error: "contentHash too long" }, 400);
	}

	const result = await registerPage(storage, siteId, {
		url: body.url,
		title: body.title || "",
		description: body.description || "",
		headings: JSON.stringify(body.headings || []),
		contentHash: body.contentHash || null,
	});

	return c.json({ ok: true, skipped: result.skipped });
});

export { register };
