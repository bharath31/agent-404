import type { Context, Next } from "hono";

interface RateLimitOptions {
	windowMs: number;
	max: number;
}

const hits = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries periodically
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of hits) {
		if (now > entry.resetAt) hits.delete(key);
	}
}, 60_000);

export function rateLimiter(opts: RateLimitOptions) {
	return async (c: Context, next: Next) => {
		const ip =
			c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
			c.req.header("cf-connecting-ip") ||
			"unknown";
		const key = `${ip}:${c.req.path}`;
		const now = Date.now();

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
