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

export function pathHint(url: string): string {
	try {
		const parts = new URL(url).pathname.split("/").filter(Boolean);
		return parts[parts.length - 1] || "";
	} catch {
		return "";
	}
}
