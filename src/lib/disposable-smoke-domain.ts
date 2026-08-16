/**
 * CI production smoke registers `smoke-<timestamp>.example.com` rows.
 * example.com is reserved (RFC 2606); these hosts cannot be proven via DNS
 * or well-known, so createSite marks them verified so the live snippet
 * job can exercise /api/register and /api/suggest after Theme 6.
 */
export function isDisposableSmokeDomain(domain: string): boolean {
	return /^smoke-\d+\.example\.com$/i.test(domain);
}

/**
 * Broader test-artifact filter for reporting metrics (e.g. live install
 * counts, BAT-62). Every CI/manual-testing convention in this codebase —
 * smoke tests, browser tests, e2e tests, and ad-hoc registration-flow
 * testing — registers under the RFC 2606 reserved `example.com` TLD
 * (`smoke-*.example.com`, `browser-test-*.example.com`, `e2e-*.example.com`,
 * `test.example.com`, ...), plus any legacy `smoke-` prefixed domain that
 * predates the `.example.com` suffix convention. Counting these as
 * production installs is exactly how a real regression hides in the
 * numbers.
 */
export function isTestDomain(domain: string): boolean {
	return /\.example\.com$/i.test(domain) || /^smoke-/i.test(domain);
}
