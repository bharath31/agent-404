import { isTestDomain } from "./disposable-smoke-domain.js";

/**
 * BAT-62: "Report verified installs, not registrations."
 *
 * A site counts as a live install only if it has BOTH indexed at least one
 * page AND served a suggestion within the trailing window — not merely
 * registered a domain (a `sites` row). Registering a domain proves nothing
 * about whether the script actually works end-to-end; that gap is exactly
 * how a CORS failure went unnoticed in production for five months while
 * "registered sites" kept climbing.
 *
 * This is deliberately a tiny, pure, independently-testable definition —
 * the query in PostgresStorage.getLiveInstallCount() and the in-memory
 * mirror in the test double both implement the same rule below. Keep them
 * in sync; the value of this metric is entirely in the definition.
 */
export const LIVE_INSTALL_WINDOW_DAYS = 7;

export interface SiteActivitySummary {
	domain: string;
	/** True if at least one page's last_seen falls within the window (the client script is beaconing). */
	hasRecentPage: boolean;
	/** True if at least one suggestion was served within the window (a real 404 was recovered, not just indexed). */
	hasRecentSuggestion: boolean;
}

/** The install definition, in one place, so the SQL and the docs can't drift apart. */
export function isLiveInstall(site: SiteActivitySummary): boolean {
	if (isTestDomain(site.domain)) return false;
	return site.hasRecentPage && site.hasRecentSuggestion;
}

export function countLiveInstalls(sites: SiteActivitySummary[]): number {
	return sites.filter(isLiveInstall).length;
}
