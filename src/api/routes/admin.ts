import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { getCronSecret } from "../../config.js";
import { getFunnelMetrics } from "../../lib/funnel-telemetry.js";

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
	const metrics = getFunnelMetrics();
	return c.json(metrics);
});

export { admin };
