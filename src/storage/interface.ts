import type {
	PageRecord,
	SiteRecord,
	SiteStats,
	SuggestionLog,
	MatchQualityStats,
	FunnelStep,
	FunnelConversionMetrics,
	RecoveryEvent,
	RecoveryRateStats,
	AgentCategory,
	StandingAuditReport,
	InstallProbe,
} from "../types";
import type {
	ActivityPage,
	ActivityPageOptions,
	IndexedPagePage,
	IndexedPagePageOptions,
	RotateSiteKeyOutcome,
	SiteInstallation,
	SiteKeyKind,
	SiteOverview,
	SiteSettings,
	SiteSummary,
} from "../data/dashboard";

export interface StorageAdapter {
	createSite(domain: string, ownerSub: string): Promise<SiteRecord>;
	getSite(id: string): Promise<SiteRecord | null>;
	getSiteByApiKey(apiKey: string): Promise<SiteRecord | null>;
	getSiteByKey(key: string): Promise<{ site: SiteRecord; keyType: "secret" | "public" } | null>;
	getSiteByDomain(domain: string): Promise<SiteRecord | null>;
	/** Owner-scoped lookup used by domain dashboard routes to avoid tenant enumeration. */
	getOwnedSiteByDomain(domain: string, ownerSub: string): Promise<SiteRecord | null>;
	markVerified(id: string): Promise<void>;
	rotateReclaimToken(id: string): Promise<string>;
	reclaimSite(id: string, ownerSub: string): Promise<SiteRecord>;
	listSitesByOwner(ownerSub: string): Promise<SiteRecord[]>;
	/** One batched portfolio query; returned rows never include a write key. */
	listSiteSummaries(ownerSub: string): Promise<SiteSummary[]>;
	claimSite(domain: string, apiKey: string, ownerSub: string): Promise<SiteRecord | null>;
	getSiteOverview(domain: string, ownerSub: string): Promise<SiteOverview | null>;
	getActivityPage(siteId: string, opts?: ActivityPageOptions): Promise<ActivityPage>;
	getIndexedPagePage(siteId: string, opts?: IndexedPagePageOptions): Promise<IndexedPagePage>;
	getSiteInstallation(domain: string, ownerSub: string): Promise<SiteInstallation | null>;
	getSiteSettings(domain: string, ownerSub: string): Promise<SiteSettings | null>;
	rotateSiteKey(
		siteId: string,
		ownerSub: string,
		kind: SiteKeyKind,
		overlapHours?: number,
	): Promise<RotateSiteKeyOutcome>;
	/** Put the site at the front of the crawl backlog and return its safe identity. */
	requestSiteReindex(
		siteId: string,
		ownerSub: string,
	): Promise<{ id: string; domain: string } | null>;
	/** Clear the explicit request marker after a successful manual crawl. */
	completeSiteReindex(siteId: string): Promise<void>;
	/** Exact owner + normalized-domain match; site-owned rows cascade in one statement. */
	deleteOwnedSite(siteId: string, ownerSub: string, normalizedDomain: string): Promise<boolean>;

	upsertPage(
		siteId: string,
		page: Pick<PageRecord, "url" | "title" | "description" | "headings"> & {
			contentHash?: string | null;
		},
		embedding?: number[] | null,
	): Promise<void>;
	upsertPages(
		siteId: string,
		pages: (Pick<PageRecord, "url" | "title" | "description" | "headings"> & {
			contentHash?: string | null;
		})[],
		embeddings?: (number[] | null)[],
	): Promise<void>;
	getPages(siteId: string, opts?: { limit?: number; pathHint?: string }): Promise<PageRecord[]>;
	getPageContentHash(siteId: string, url: string): Promise<string | null>;
	touchPage(siteId: string, url: string): Promise<void>;
	searchByEmbedding(siteId: string, embedding: number[], limit: number): Promise<PageRecord[]>;
	deleteStalePagesOlderThan(siteId: string, cutoff: string): Promise<number>;

	recordSuggestionServed(
		siteId: string,
		deadUrl: string,
		suggestedUrls: string[],
		scores?: string,
		matchTypes?: string,
	): Promise<void>;
	getStats(siteId: string): Promise<SiteStats>;
	getSuggestionLogs(siteId: string, limit: number): Promise<SuggestionLog[]>;
	getMatchQualityStats(siteId: string): Promise<MatchQualityStats>;

	/**
	 * BAT-42: durable record of a single audit-to-install funnel step, backed
	 * by Postgres (`funnel_events`) rather than a per-isolate in-memory buffer
	 * — see `src/lib/funnel-telemetry.ts` for the fire-and-forget wrapper.
	 */
	recordFunnelEvent(
		step: FunnelStep,
		domain?: string,
		metadata?: Record<string, unknown>,
	): Promise<void>;
	/** Aggregate conversion metrics across all funnel stages, computed from durable storage. */
	getFunnelMetrics(): Promise<FunnelConversionMetrics>;
	/**
	 * BAT-26: hand-label precision ground truth over retained suggestion_logs
	 * rows (migration 0013). Raw rows are pruned after the retention window,
	 * so this reflects recent labeling — which is what the weekly loop wants.
	 */
	getLabelPrecision(): Promise<{ labeled: number; correct: number }>;

	/**
	 * BAT-61: durable record of a 404 suggestion served to an agent/visitor,
	 * backed by Postgres (`recovery_events`) so recovery metrics survive
	 * isolate cold-starts — see `src/lib/recovery-tracker.ts`.
	 */
	recordRecoveryEvent(
		siteId: string,
		deadUrl: string,
		suggestedUrls: string[],
		agentCategory: AgentCategory,
		userAgent?: string,
		clientHash?: string,
	): Promise<void>;
	/**
	 * BAT-61: correlate a follow-on page fetch with a recent unrecovered
	 * suggestion for the same site, marking it recovered in durable storage.
	 * Returns the updated event, or null when no recent unrecovered suggestion
	 * matches the fetched URL.
	 */
	markRecoveryEventRecovered(
		siteId: string,
		fetchedUrl: string,
		windowMs: number,
		clientHash?: string,
	): Promise<RecoveryEvent | null>;
	/** BAT-61: aggregate recovery rate statistics from durable storage. */
	getRecoveryRateStats(siteId?: string): Promise<RecoveryRateStats>;
	/** Recent 404 events for the dashboard activity table, newest first. */
	getRecentRecoveryEvents(siteId: string, limit: number): Promise<RecoveryEvent[]>;

	/**
	 * Dashboard rework: durable install-liveness probes. A probe fetches a
	 * dead URL on the customer's own domain with a crawler UA and records
	 * what the live 404 response contains — the only way to tell whether the
	 * install is actually serving recovery. See migrations/0011_install_probes.sql.
	 */
	saveInstallProbe(probe: InstallProbe): Promise<void>;
	getLatestInstallProbe(siteId: string): Promise<InstallProbe | null>;
	/** Sites whose latest probe is missing or older than maxAgeHours, stalest first. */
	listSitesNeedingProbe(
		limit: number,
		maxAgeHours: number,
	): Promise<{ id: string; domain: string }[]>;

	/**
	 * BAT-62: count of sites that are actually working — indexed a page AND
	 * served a suggestion in the last 7 days — not just registered. See
	 * `src/lib/live-installs.ts` for the full definition. Excludes CI/test
	 * domains (`isTestDomain`).
	 */
	getLiveInstallCount(): Promise<number>;
	/** Raw count of every `sites` row, unfiltered — registrations, not installs. */
	getTotalSiteCount(): Promise<number>;

	/**
	 * BAT-38/39 standing audit reports — durable so a report created on one
	 * serverless isolate is visible when a crawler fetches its permalink or
	 * OG image from a different instance. See migrations/0007_audit_reports.sql.
	 */
	saveAuditReport(report: StandingAuditReport): Promise<void>;
	getAuditReport(id: string): Promise<StandingAuditReport | null>;
}
