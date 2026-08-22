import { json } from "./responses";

type Entry = { count: number; resetAt: number };
const hits = new Map<string, Entry>();
const MAX_KEYS = 20_000;

export type RateLimit = { windowMs: number; max: number };

function prune(now: number): void {
	if (hits.size < MAX_KEYS / 2) return;
	for (const [key, entry] of hits) if (now > entry.resetAt) hits.delete(key);
	while (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value as string);
}

export function checkRateLimit(
	request: Request,
	options: RateLimit,
	siteId?: string,
): { response?: Response; headers: Headers } {
	const url = new URL(request.url);
	const credential = request.headers.get("x-api-key")?.slice(0, 64);
	const ip =
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("cf-connecting-ip") ||
		"unknown";
	const key = `${siteId || credential || ip}:${url.pathname}`;
	const now = Date.now();
	prune(now);
	let entry = hits.get(key);
	if (!entry || now > entry.resetAt) {
		entry = { count: 0, resetAt: now + options.windowMs };
		hits.set(key, entry);
	}
	entry.count++;
	const remaining = Math.max(0, options.max - entry.count);
	const headers = new Headers({
		"X-RateLimit-Limit": String(options.max),
		"X-RateLimit-Remaining": String(remaining),
		"X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
	});
	if (siteId || credential) {
		headers.set("X-Quota-Limit", String(options.max));
		headers.set("X-Quota-Remaining", String(remaining));
	}
	if (entry.count <= options.max) return { headers };
	const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
	headers.set("Retry-After", String(retryAfter));
	return {
		headers,
		response: json(
			request,
			{ error: "Too many requests", retryAfter, limit: options.max, remaining: 0, resetAt: entry.resetAt },
			429,
			headers,
		),
	};
}

export function resetRouteRateLimits(): void {
	hits.clear();
}
