import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { crawlSitemap } from "../../engine/sitemap.js";
import { proveDomainOwnership, verificationTxtName, wellKnownUrl } from "../../engine/domain-verify.js";
import { isDisposableSmokeDomain } from "../../lib/disposable-smoke-domain.js";
import type { SiteRecord } from "../../types.js";

export const VERIFIED_RECLAIM_GRACE_MS = 24 * 60 * 60 * 1000;

type Env = { Variables: { storage: PostgresStorage; siteId: string; site: SiteRecord } };

const sites = new Hono<Env>();

function normalizeDomain(raw: string): string | null {
	const domain = raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
	const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
	if (!domainRegex.test(domain) || domain.length > 253) return null;
	return domain.toLowerCase();
}

function verificationInstructions(domain: string, token: string) {
	return {
		dnsTxt: { name: verificationTxtName(domain), value: token },
		wellKnown: { url: wellKnownUrl(domain), body: token },
	};
}

sites.post("/", async (c) => {
	const body = await c.req.json<{ domain: string }>();
	if (!body.domain) {
		return c.json({ error: "domain is required" }, 400);
	}

	const domain = normalizeDomain(body.domain);
	if (!domain) {
		return c.json({ error: "Invalid domain format" }, 400);
	}

	const storage = c.get("storage");

	try {
		const site = await storage.createSite(domain);
		if (isDisposableSmokeDomain(domain) && !site.verifiedAt) {
			await storage.markVerified(site.id);
			site.verifiedAt = new Date().toISOString();
		}

		return c.json(
			{
				id: site.id,
				domain: site.domain,
				apiKey: site.apiKey,
				publicKey: site.publicKey,
				verified: Boolean(site.verifiedAt),
				verificationToken: site.verificationToken,
				verification: verificationInstructions(site.domain, site.verificationToken),
				createdAt: site.createdAt,
			},
			201,
		);
	} catch (err: any) {
		if (err?.message?.includes("unique") || err?.message?.includes("duplicate")) {
			return c.json(
				{
					error: "Domain already registered",
					hint: "If you own this domain, POST /api/sites/reclaim then prove ownership to take it over.",
				},
				409,
			);
		}
		console.error("Site registration error:", err.message);
		return c.json({ error: "Internal server error" }, 500);
	}
});

sites.post("/:id/verify", async (c) => {
	const id = c.req.param("id");
	const storage = c.get("storage");
	const site = await storage.getSite(id);
	if (!site) {
		return c.json({ error: "Site not found" }, 404);
	}
	if (site.verifiedAt) {
		return c.json({ ok: true, verified: true, domain: site.domain });
	}

	const ok = await proveDomainOwnership(site.domain, site.verificationToken);
	if (!ok) {
		return c.json(
			{
				error: "Ownership not proven",
				verification: verificationInstructions(site.domain, site.verificationToken),
			},
			400,
		);
	}

	await storage.markVerified(site.id);
	crawlSitemap(site.domain, site.id, storage).catch(() => {});
	return c.json({ ok: true, verified: true, domain: site.domain });
});

sites.post("/reclaim", async (c) => {
	const body = await c.req.json<{ domain: string }>();
	const domain = body.domain ? normalizeDomain(body.domain) : null;
	if (!domain) {
		return c.json({ error: "Invalid domain format" }, 400);
	}

	const storage = c.get("storage");
	const site = await storage.getSiteByDomain(domain);
	if (!site) {
		return c.json({ error: "Domain is not registered" }, 404);
	}

	const token = await storage.rotateReclaimToken(site.id);
	const coolingOff = Boolean(site.verifiedAt);
	return c.json({
		ok: true,
		domain,
		siteId: site.id,
		reclaimToken: token,
		verification: verificationInstructions(domain, token),
		verifiedSite: coolingOff,
		coolingOffHours: coolingOff ? 24 : 0,
		next: coolingOff
			? "Prove ownership, wait 24h, then POST /api/sites/reclaim/complete with { domain, confirm: true }"
			: "Prove ownership, then POST /api/sites/reclaim/complete with { domain }",
	});
});

sites.post("/reclaim/complete", async (c) => {
	const body = await c.req.json<{ domain: string; confirm?: boolean | string }>();
	const domain = body.domain ? normalizeDomain(body.domain) : null;
	if (!domain) {
		return c.json({ error: "Invalid domain format" }, 400);
	}

	const storage = c.get("storage");
	const site = await storage.getSiteByDomain(domain);
	if (!site) {
		return c.json({ error: "Domain is not registered" }, 404);
	}

	if (!site.reclaimToken) {
		return c.json({ error: "No reclaim in progress. POST /api/sites/reclaim first." }, 400);
	}

	if (site.verifiedAt) {
		const started = site.reclaimRequestedAt ? Date.parse(site.reclaimRequestedAt) : 0;
		const waitMs = VERIFIED_RECLAIM_GRACE_MS - (Date.now() - started);
		if (!started || waitMs > 0) {
			return c.json(
				{
					error: "Verified sites have a 24h cooling-off period before keys rotate.",
					retryAfterSeconds: Math.max(1, Math.ceil((waitMs || VERIFIED_RECLAIM_GRACE_MS) / 1000)),
					hint: "Unverified domains can complete immediately after proof.",
				},
				400,
			);
		}
		if (body.confirm !== true && body.confirm !== "replace-verified-site") {
			return c.json(
				{
					error: "Pass confirm: true to rotate keys on an already-verified site.",
				},
				400,
			);
		}
	}

	const ok = await proveDomainOwnership(domain, site.reclaimToken);
	if (!ok) {
		return c.json(
			{
				error: "Ownership not proven",
				verification: verificationInstructions(domain, site.reclaimToken),
			},
			400,
		);
	}

	const updated = await storage.reclaimSite(site.id);
	crawlSitemap(updated.domain, updated.id, storage).catch(() => {});
	return c.json({
		ok: true,
		id: updated.id,
		domain: updated.domain,
		apiKey: updated.apiKey,
		publicKey: updated.publicKey,
		verified: true,
	});
});

sites.get("/:id/stats", async (c) => {
	const id = c.req.param("id");
	const storage = c.get("storage");

	const site = await storage.getSite(id);
	if (!site) {
		return c.json({ error: "Site not found" }, 404);
	}

	const stats = await storage.getStats(id);
	return c.json({
		siteId: id,
		domain: site.domain,
		verified: Boolean(site.verifiedAt),
		...stats,
	});
});

export { sites };
