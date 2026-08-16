import { Hono } from "hono";
import type { Context } from "hono";
import type { ServerClient } from "@auth0/auth0-server-js";
import type { PostgresStorage } from "../../storage/postgres.js";
import { requireOwnerPage } from "../../auth/owner.js";
import { normalizeDomain } from "../domain.js";
import { dashboardHtml } from "../../dashboard.js";
import type { DashboardSiteData } from "../../types.js";

type Env = {
	Variables: {
		storage: PostgresStorage;
		ownerSub: string;
		auth0Client?: ServerClient<Context>;
	};
};

const dashboard = new Hono<Env>();

// Dashboard — Auth0 passwordless email session; snippet lives here
dashboard.get("/", requireOwnerPage(), async (c) => {
	const storage = c.get("storage");
	const ownerSub = c.get("ownerSub");
	let claimDomain: string | null = null;
	let pendingDomain: string | null = null;
	let notice: string | null = null;

	// Read-only: this is a GET handler, so registration itself must happen via
	// an explicit POST /api/sites (in the browser) — never as a side effect
	// of loading a URL. A top-level GET carries session cookies under
	// SameSite=Lax, so mutating here would let any page CSRF a signed-in owner
	// into registering (and crawling) an attacker-chosen domain.
	const registerRaw = c.req.query("register");
	if (registerRaw) {
		const domain = normalizeDomain(registerRaw);
		if (!domain) {
			notice = "That domain is not valid.";
		} else {
			const existing = await storage.getSiteByDomain(domain);
			if (!existing) {
				pendingDomain = domain;
			} else if (existing.ownerSub === ownerSub) {
				return c.redirect("/dashboard");
			} else if (!existing.ownerSub) {
				claimDomain = domain;
			} else {
				notice = "This domain is linked to another account. Sign in with the email that created it.";
			}
		}
	}

	const owned = await storage.listSitesByOwner(ownerSub);
	const sitesData: DashboardSiteData[] = await Promise.all(
		owned.map(async (site) => {
			const [stats, recentLogs, matchQuality] = await Promise.all([
				storage.getStats(site.id),
				storage.getSuggestionLogs(site.id, 20),
				storage.getMatchQualityStats(site.id),
			]);

			return {
				id: site.id,
				domain: site.domain,
				apiKey: site.apiKey,
				publicKey: site.publicKey,
				pageCount: stats.pageCount,
				suggestionsServed: stats.suggestionsServed,
				lastBeaconAt: stats.lastBeaconAt,
				recentLogs,
				matchQuality,
			};
		}),
	);

	let email: string | null = null;
	const client = c.get("auth0Client");
	if (client) {
		const session = await client.getSession(c);
		const sessionEmail = session?.user?.email;
		email = typeof sessionEmail === "string" ? sessionEmail : null;
	}

	return c.html(
		dashboardHtml({
			email,
			sites: sitesData,
			claimDomain,
			pendingDomain,
			notice,
		}),
	);
});

export { dashboard };
