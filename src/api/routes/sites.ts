import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { crawlSitemap } from "../../engine/sitemap.js";
import { normalizeDomain } from "../domain.js";

type Env = { Variables: { storage: PostgresStorage; siteId: string; ownerSub: string } };

const sites = new Hono<Env>();

function publicSite(site: { id: string; domain: string; apiKey: string; createdAt: string }) {
	return {
		id: site.id,
		domain: site.domain,
		apiKey: site.apiKey,
		createdAt: site.createdAt,
	};
}

// Register a new site (Auth0 session required — ownerSub set by middleware)
sites.post("/", async (c) => {
	const body = await c.req.json<{ domain: string }>().catch(() => ({ domain: "" }));
	if (!body.domain) {
		return c.json({ error: "domain is required" }, 400);
	}

	const domain = normalizeDomain(body.domain);
	if (!domain) {
		return c.json({ error: "Invalid domain format" }, 400);
	}

	const storage = c.get("storage");
	const ownerSub = c.get("ownerSub");

	const existing = await storage.getSiteByDomain(domain);
	if (existing) {
		if (existing.ownerSub === ownerSub) {
			return c.json(publicSite(existing), 200);
		}
		if (!existing.ownerSub) {
			return c.json(
				{
					error: "This site is already indexed. Enter the API key from your script tag to link it.",
					code: "unowned",
					domain,
				},
				409,
			);
		}
		return c.json(
			{
				error: "This domain is linked to another account. Sign in with the email that created it.",
				code: "owned_by_other",
			},
			409,
		);
	}

	try {
		const site = await storage.createSite(domain, ownerSub);
		crawlSitemap(domain, site.id, storage).catch(() => {});
		return c.json(publicSite(site), 201);
	} catch (err: any) {
		if (err?.message?.includes("unique") || err?.message?.includes("duplicate")) {
			const raced = await storage.getSiteByDomain(domain);
			if (raced?.ownerSub === ownerSub) {
				return c.json(publicSite(raced), 200);
			}
			if (raced && !raced.ownerSub) {
				return c.json(
					{
						error: "This site is already indexed. Enter the API key from your script tag to link it.",
						code: "unowned",
						domain,
					},
					409,
				);
			}
			return c.json(
				{
					error: "This domain is linked to another account. Sign in with the email that created it.",
					code: "owned_by_other",
				},
				409,
			);
		}
		console.error("Site registration error:", err.message);
		return c.json({ error: "Internal server error" }, 500);
	}
});

sites.post("/claim", async (c) => {
	const body = await c.req.json<{ domain: string; apiKey: string }>().catch(() => ({
		domain: "",
		apiKey: "",
	}));
	const domain = body.domain ? normalizeDomain(body.domain) : null;
	const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
	if (!domain || !apiKey) {
		return c.json({ error: "domain and apiKey are required" }, 400);
	}

	const site = await c.get("storage").claimSite(domain, apiKey, c.get("ownerSub"));
	if (!site) {
		return c.json({ error: "Could not link this site. Check the API key." }, 401);
	}
	return c.json(publicSite(site), 200);
});

// Get site stats
sites.get("/:id/stats", async (c) => {
	const id = c.req.param("id");
	const storage = c.get("storage");

	const site = await storage.getSite(id);
	if (!site) {
		return c.json({ error: "Site not found" }, 404);
	}
	if (site.ownerSub && site.ownerSub !== c.get("ownerSub")) {
		return c.json({ error: "Site not found" }, 404);
	}

	const stats = await storage.getStats(id);
	return c.json({ siteId: id, domain: site.domain, ...stats });
});

export { sites };
