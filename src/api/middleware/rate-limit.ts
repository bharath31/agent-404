import type { Context, Next } from "hono";

interface RateLimitOptions {
	windowMs: number;
	max: number;
}

const hits = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 20_000;

function prune(now: number): void {
	if (hits.size < MAX_KEYS / 2) return;
	for (const [key, entry] of hits) {
		if (now > entry.resetAt) hits.delete(key);
	}
	if (hits.size > MAX_KEYS) {
		const extra = hits.size - MAX_KEYS;
		let i = 0;
		for (const key of hits.keys()) {
			hits.delete(key);
			if (++i >= extra) break;
		}
	}
}

/**
 * Per-isolate counters (not a durable quota store). BAT-54 (plan limits,
 * shared store, quota headers beyond these best-effort X-RateLimit-*) is
 * a follow-up. Keyed by site credential when present so one tenant cannot
 * exhaust another tenant's budget in the same isolate. No global timers
 * (Cloudflare Workers disallow setInterval at module scope).
 */
export function rateLimiter(opts: RateLimitOptions) {
	return async (c: Context, next: Next) => {
		const siteKey = c.req.header("x-api-key")?.slice(0, 64);
		const ip =
			c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
			c.req.header("cf-connecting-ip") ||
			"unknown";
		const key = `${siteKey || ip}:${c.req.path}`;
		const now = Date.now();
		prune(now);

		let entry = hits.get(key);
		if (!entry || now > entry.resetAt) {
			entry = { count: 0, resetAt: now + opts.windowMs };
			hits.set(key, entry);
		}

		entry.count++;

		c.header("X-RateLimit-Limit", String(opts.max));
		c.header("X-RateLimit-Remaining", String(Math.max(0, opts.max - entry.count)));

		if (entry.count > opts.max) {
			return c.json({ error: "Too many requests" }, 429);
		}

		await next();
	};
}

/** Test-only. */
export function resetRateLimitHits(): void {
	hits.clear();
}
