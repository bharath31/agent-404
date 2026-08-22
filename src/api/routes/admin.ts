import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { getCronSecret } from "../../config.js";
import { getFunnelMetrics } from "../../lib/funnel-telemetry.js";
import { getRecoveryRateStats } from "../../lib/recovery-tracker.js";
import { adminMetricsPageHtml } from "../../views/admin-metrics.js";

type Env = {
	Bindings: { CRON_SECRET?: string };
	Variables: { storage: PostgresStorage };
};

const admin = new Hono<Env>();

export function isCronAuthorized(c: {
	req: { header: (name: string) => string | undefined };
	env?: { CRON_SECRET?: string };
}): boolean {
	const authHeader = c.req.header("authorization");
	const cronSecret = getCronSecret(c.env as Record<string, unknown>);
	return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

// BAT-62: read-only "are we on track for 1,000 live installs" metric.
// Protected the same way as /api/cron (CRON_SECRET bearer token) — this is
// operator-facing, not a public dashboard endpoint.
admin.get("/metrics", async (c) => {
	if (!isCronAuthorized(c)) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	const storage = c.get("storage");
	const [liveInstalls, totalSites] = await Promise.all([
		storage.getLiveInstallCount(),
		storage.getTotalSiteCount(),
	]);
	return c.json({ liveInstalls, totalSites, goal: 1000 });
});

// BAT-42: Audit-to-install funnel telemetry metrics
admin.get("/funnel", async (c) => {
	if (!isCronAuthorized(c)) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	const storage = c.get("storage");
	const metrics = await getFunnelMetrics(storage);
	return c.json(metrics);
});

// BAT-61: Agent recovery rate metrics
admin.get("/recovery-metrics", async (c) => {
	if (!isCronAuthorized(c)) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	const siteId = c.req.query("siteId");
	const storage = c.get("storage");
	const stats = await getRecoveryRateStats(storage, siteId);
	return c.json(stats);
});

// BAT-26 / Theme 7 gate: all four decision numbers on one page, with the
// week-12 kill criteria written next to them. Same operator auth as the
// JSON endpoints above.
admin.get("/page", async (c) => {
	if (!isCronAuthorized(c)) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	const storage = c.get("storage");
	const [liveInstalls, totalSites, recovery, funnel, precision] = await Promise.all([
		storage.getLiveInstallCount(),
		storage.getTotalSiteCount(),
		getRecoveryRateStats(storage).catch(() => null),
		getFunnelMetrics(storage).catch(() => null),
		storage.getLabelPrecision().catch(() => null),
	]);
	// A rate over a zero denominator is "no data yet", not 0% — passing null
	// keeps the kill-criteria verdict honest on a fresh product.
	return c.html(
		adminMetricsPageHtml({
			liveInstalls,
			totalSites,
			recoveryRate:
				recovery && recovery.overall.totalSuggestions > 0 ? recovery.overall.recoveryRate : null,
			overallFunnelConversion:
				funnel && funnel.totalAuditsStarted > 0 ? funnel.rates.overallFunnelConversion : null,
			precision: precision && precision.labeled > 0 ? precision : null,
		}),
	);
});

export { admin };
