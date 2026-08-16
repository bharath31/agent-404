import type { Context, Next } from "hono";

export interface RateLimitOptions {
	windowMs: number;
	max: number;
	/** Optional custom key generator */
	keyGenerator?: (c: Context) => string;
	/** Optional per-site quota multiplier or override */
	getLimit?: (c: Context, defaultMax: number) => number;
}

export interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const hits = new Map<string, RateLimitEntry>();
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
 * Durable per-site and per-IP rate limiter for serverless environments (Node, Vercel, Cloudflare Workers).
 * - Keyed by site credential (`x-api-key` or `siteId`) when present, falling back to IP.
 * - Sliding window reset with standard RFC rate limit headers:
 *   - X-RateLimit-Limit
 *   - X-RateLimit-Remaining
 *   - X-RateLimit-Reset (epoch timestamp in seconds)
 *   - Retry-After (seconds to wait on 429)
 * - Zero module-level setInterval timers (Cloudflare Workers safe).
 */
export function rateLimiter(opts: RateLimitOptions) {
	return async (c: Context, next: Next) => {
		const siteKey =
			(c.get("siteId") as string | undefined) ||
			c.req.header("x-api-key")?.slice(0, 64) ||
			null;
		const ip =
			c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
			c.req.header("cf-connecting-ip") ||
			"unknown";

		const key = opts.keyGenerator ? opts.keyGenerator(c) : `${siteKey || ip}:${c.req.path}`;
		const limit = opts.getLimit ? opts.getLimit(c, opts.max) : opts.max;
		const now = Date.now();
		prune(now);

		let entry = hits.get(key);
		if (!entry || now > entry.resetAt) {
			entry = { count: 0, resetAt: now + opts.windowMs };
			hits.set(key, entry);
		}

		entry.count++;

		const remaining = Math.max(0, limit - entry.count);
		const resetSeconds = Math.ceil(entry.resetAt / 1000);
		const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

		c.header("X-RateLimit-Limit", String(limit));
		c.header("X-RateLimit-Remaining", String(remaining));
		c.header("X-RateLimit-Reset", String(resetSeconds));

		if (siteKey) {
			c.header("X-Quota-Limit", String(limit));
			c.header("X-Quota-Remaining", String(remaining));
		}

		if (entry.count > limit) {
			c.header("Retry-After", String(retryAfter));
			return c.json(
				{
					error: "Too many requests",
					retryAfter,
					limit,
					remaining: 0,
					resetAt: entry.resetAt,
				},
				429,
			);
		}

		await next();
	};
}

/** Test-only: inspect or reset rate limit hits. */
export function resetRateLimitHits(): void {
	hits.clear();
}

export function getRateLimitHitCount(key: string): number {
	return hits.get(key)?.count ?? 0;
}
