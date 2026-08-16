/**
 * CI production smoke registers `smoke-<timestamp>.example.com` rows.
 * example.com is reserved (RFC 2606); these hosts cannot be proven via DNS
 * or well-known, so createSite marks them verified so the live snippet
 * job can exercise /api/register and /api/suggest after Theme 6.
 */
export function isDisposableSmokeDomain(domain: string): boolean {
	return /^smoke-\d+\.example\.com$/i.test(domain);
}
