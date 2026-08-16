/**
 * Host must equal the registered domain or be a subdomain of it.
 * Suffix match is not enough: `notexample.com` must not match `example.com`.
 */
export function hostBelongsToDomain(hostname: string, domain: string): boolean {
	const host = hostname.toLowerCase().replace(/\.$/, "");
	const registered = domain.toLowerCase().replace(/\.$/, "");
	if (!host || !registered) return false;
	if (host === registered) return true;
	return host.endsWith(`.${registered}`);
}

export function urlBelongsToSite(url: string, domain: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
		return hostBelongsToDomain(parsed.hostname, domain);
	} catch {
		return false;
	}
}

export function originBelongsToSite(origin: string, domain: string): boolean {
	try {
		return hostBelongsToDomain(new URL(origin).hostname, domain);
	} catch {
		return false;
	}
}
