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
	}>();

	if (!body.url) {
		return c.json({ error: "url is required" }, 400);
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
