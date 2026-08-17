import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";

type Env = { Variables: { storage: PostgresStorage; siteId: string } };

const install = new Hono<Env>();

/**
 * Install verification for site owners. Never throws into the host page —
 * this is the endpoint the docs and dashboard point at when beacons are silent.
 */
install.get("/status", async (c) => {
	const siteId = c.get("siteId");
	const storage = c.get("storage");

	const site = await storage.getSite(siteId);
	if (!site) {
		return c.json({ error: "Site not found" }, 404);
	}

	const stats = await storage.getStats(siteId);
	const domainVerified = Boolean(site.verifiedAt);
	const installVerified = stats.pageCount > 0;

	let warning: string | null = null;
	if (!installVerified) {
		warning = domainVerified
			? "No beacons received. The script is not reaching /api/register. Use https://www.agent404.dev (apex redirects break CORS preflight) and check the browser console for [agent-404] warnings."
			: "Domain ownership is not verified yet. Indexing and crawling are paused until you verify — add the DNS TXT record (or well-known file) and confirm in the dashboard. This is not a script/CORS issue.";
	}

	return c.json({
		ok: true,
		domain: site.domain,
		pageCount: stats.pageCount,
		lastBeaconAt: stats.lastBeaconAt,
		suggestionsServed: stats.suggestionsServed,
		domainVerified,
		installVerified,
		warning,
	});
});

export { install };
