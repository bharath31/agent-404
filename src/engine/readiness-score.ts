/**
 * Shared Agent Readiness Score components (0-100).
 *
 * The public web audit (src/api/routes/audit.ts, a single-probe "quick
 * check" meant to render fast for a shareable badge) and the CLI audit
 * (src/cli/audit.ts, a comprehensive multi-signal audit that also crawls
 * the sitemap and runs a hallucination-recovery stress test) previously
 * computed this score with two independently-authored formulas using
 * different point values for the *same* checks — the same live site could
 * get a materially different score and pass/fail verdict depending on
 * which tool audited it, undermining trust in the number.
 *
 * The three checks both tools can run cheaply from a single probe (clean
 * 404 status, Link headers, JSON-LD) now share one weighting here. Each
 * tool still adds its own deeper, tool-specific checks on top — the web
 * quick-check substitutes a lighter "has any suggestions" signal for the
 * CLI's sitemap-crawl-dependent hallucination-recovery and broken-link
 * checks, so both still total 100, and a shared check reads the same
 * either way.
 */
export const READINESS_WEIGHTS = {
	/** Clean HTTP 404 on the dead path. */
	statusClean: 25,
	/** Consolation credit for a soft-404 (200-399) that still isn't a true 404. */
	statusSoft: 5,
	/** Link: rel="alternate" response headers present. */
	linkHeaders: 20,
	/** schema.org/ItemList JSON-LD present in the 404 body. */
	jsonLd: 15,
	/** CLI only: hallucinated-path recovery rate from the sitemap-crawl stress test. */
	hallucinationRecovery: 25,
	/** CLI only: internal broken-link health from the sitemap crawl. */
	brokenLinkHealth: 15,
	/** Web quick-check only: single-probe substitute for the two CLI-only checks above. */
	hasSuggestions: 40,
} as const;

export function scoreCleanStatus(httpStatus: number): number {
	if (httpStatus === 404) return READINESS_WEIGHTS.statusClean;
	if (httpStatus >= 200 && httpStatus < 400) return READINESS_WEIGHTS.statusSoft;
	return 0;
}

export function scoreLinkHeaders(present: boolean): number {
	return present ? READINESS_WEIGHTS.linkHeaders : 0;
}

export function scoreJsonLd(present: boolean): number {
	return present ? READINESS_WEIGHTS.jsonLd : 0;
}

export function scoreHallucinationRecovery(recoveryRate: number): number {
	return Math.round(recoveryRate * READINESS_WEIGHTS.hallucinationRecovery);
}

export function scoreBrokenLinkHealth(brokenCount: number): number {
	if (brokenCount === 0) return READINESS_WEIGHTS.brokenLinkHealth;
	if (brokenCount < 3) return Math.round((READINESS_WEIGHTS.brokenLinkHealth * 2) / 3);
	if (brokenCount < 8) return Math.round(READINESS_WEIGHTS.brokenLinkHealth / 3);
	return 0;
}
