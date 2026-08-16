export function normalizeDeadUrl(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hash = "";
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
