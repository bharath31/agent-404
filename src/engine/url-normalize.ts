export function normalizeDeadUrl(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hash = "";
		// Query strings are dropped so cache keys stay stable for typical 404s.
		// Distinct resources that only differ by `?id=` therefore share a key.
		parsed.search = "";
		parsed.hostname = parsed.hostname.toLowerCase();
		parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
		if (parsed.pathname.length > 1) {
			parsed.pathname = parsed.pathname.replace(/\/+$/, "");
		}
		return parsed.origin + parsed.pathname;
	} catch {
		return url.trim();
	}
}

/**
 * Canonical pathname comparison key: lowercased, trailing slash stripped,
 * "/" for the root. Shared by matcher.ts, hallucination-predictor.ts and
 * recovery-tracker.ts so "is this the same page" decisions agree across
 * modules — they previously each carried a slightly different copy (one
 * didn't lowercase, one had no relative-URL base fallback), which let a
 * suggestion that matcher.ts scored as an exact match read as a mismatch
 * elsewhere.
 */
export function normalizePathname(urlOrPath: string): string {
	try {
		const u = new URL(urlOrPath, "https://example.com");
		return u.pathname.replace(/\/+$/, "").toLowerCase() || "/";
	} catch {
		return urlOrPath.replace(/\/+$/, "").toLowerCase() || "/";
	}
}

export function pathHint(url: string): string {
	try {
		const parts = new URL(url).pathname.split("/").filter(Boolean);
		return parts[parts.length - 1] || "";
	} catch {
		return "";
	}
}
