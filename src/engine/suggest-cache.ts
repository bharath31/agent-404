const cache = new Map<string, { expiresAt: number; body: string }>();
const TTL_MS = 10 * 60 * 1000;
const MAX = 4_000;

export function getCachedSuggest(siteId: string, urlKey: string): unknown | null {
	const hit = cache.get(`${siteId}:${urlKey}`);
	if (!hit) return null;
	if (Date.now() > hit.expiresAt) {
		cache.delete(`${siteId}:${urlKey}`);
		return null;
	}
	try {
		return JSON.parse(hit.body);
	} catch {
		return null;
	}
}

export function setCachedSuggest(siteId: string, urlKey: string, payload: unknown): void {
	if (cache.size > MAX) {
		const first = cache.keys().next().value;
		if (first) cache.delete(first);
	}
	cache.set(`${siteId}:${urlKey}`, {
		expiresAt: Date.now() + TTL_MS,
		body: JSON.stringify(payload),
	});
}

export function invalidateSuggestCache(siteId: string): void {
	for (const key of cache.keys()) {
		if (key.startsWith(`${siteId}:`)) cache.delete(key);
	}
}
