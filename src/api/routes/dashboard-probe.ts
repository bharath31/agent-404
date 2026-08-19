import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { probeClaudeBotResponse, deriveProbePath } from "../../engine/claudebot-probe.js";
import type { InstallProbe } from "../../types.js";

// `requireOwnerApi` is applied by the parent (src/index.ts) before this
// sub-app mounts, so ownerSub is guaranteed present and set here.
type Env = {
	Variables: {
		storage: PostgresStorage;
		ownerSub: string;
	};
};

const dashboardProbe = new Hono<Env>();

/**
 * POST /api/dashboard/probe  { siteId: string, path?: string }
 *
 * Fetches a dead URL on the owner's own domain with an AI-crawler User-Agent
 * and returns the live 404 exchange (status, Link header, JSON-LD detection,
 * verdict). The result is persisted to `install_probes` for the liveness
 * timeline. This is the dashboard's answer to "is my install working?" —
 * registrations and sitemap indexing are invisible to a middleware that
 * stopped running, so only a live exchange proves it.
 *
 * Ownership check: the site must belong to the signed-in owner. Sites the
 * dashboard lists come from listSitesByOwner(), so an exact ownerSub match is
 * the right boundary (legacy unowned sites never appear on the dashboard).
 */
dashboardProbe.post("/probe", async (c) => {
	const storage = c.get("storage");
	const ownerSub = c.get("ownerSub");

	const body = await c.req
		.json<{ siteId?: string; path?: string }>()
		.catch(() => ({} as { siteId?: string; path?: string }));

	const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
	const site = siteId ? await storage.getSite(siteId) : null;
	if (!site || site.ownerSub !== ownerSub) {
		return c.json({ error: "Site not found" }, 404);
	}

	// Optional custom path for the owner's own testing — must be a bare
	// pathname (no host, no query) to stay inside the SSRF guard's domain.
	let path = deriveProbePath();
	if (typeof body.path === "string") {
		const candidate = body.path.trim();
		if (candidate && candidate.startsWith("/") && candidate.length <= 120 && !candidate.includes("?") && !candidate.includes("//")) {
			path = candidate;
		}
	}

	const result = await probeClaudeBotResponse(site.domain, path);

	const probedAt = new Date().toISOString();
	const linkHeader = result.comparison.current.headers[0] ?? null;
	const probe: InstallProbe = {
		id: "manual",
		siteId: site.id,
		probedAt,
		probePath: path,
		status: result.status,
		verdict: result.verdict,
		hasLinkHeaders: result.hasLinkHeaders,
		hasJsonLd: result.hasJsonLd,
		linkHeader,
		summary: result.summary,
		source: "manual",
	};
	// Telemetry must not fail the request the owner is actively waiting on.
	await storage.saveInstallProbe(probe).catch(() => {});

	return c.json({
		ok: true,
		probe: {
			...probe,
			id: undefined,
			headers: result.headersSnippet,
			bodySnippet: result.bodySnippet,
		},
	});
});

export { dashboardProbe };