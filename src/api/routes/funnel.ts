import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { trackFunnelEvent } from "../../lib/funnel-telemetry.js";
import { rateLimiter } from "../middleware/rate-limit.js";

type Env = { Variables: { storage?: PostgresStorage } };

// BAT-42 funnel step beacons for client-side events that have no natural
// server-side hook (e.g. the landing page "Get Keys" CTA click). These are
// public and fire-and-forget — telemetry must never break the page.
const funnel = new Hono<Env>();

funnel.use("/*", rateLimiter({ windowMs: 60_000, max: 60 }));

// Landing page install CTA click
funnel.post("/install-cta", async (c) => {
	const body = await c.req
		.json<{ domain?: string }>()
		.catch(() => ({ domain: "" }));
	trackFunnelEvent(c.get("storage"), "install_cta_clicked", body.domain || undefined);
	return c.json({ ok: true });
});

export { funnel };
