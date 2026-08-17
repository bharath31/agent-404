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
} from "../types.js";

export interface StorageAdapter {
	createSite(domain: string, ownerSub: string): Promise<SiteRecord>;
	getSite(id: string): Promise<SiteRecord | null>;
	getSiteByApiKey(apiKey: string): Promise<SiteRecord | null>;
	getSiteByKey(key: string): Promise<{ site: SiteRecord; keyType: "secret" | "public" } | null>;
	getSiteByDomain(domain: string): Promise<SiteRecord | null>;
	markVerified(id: string): Promise<void>;
	rotateReclaimToken(id: string): Promise<string>;
	reclaimSite(id: string, ownerSub: string): Promise<SiteRecord>;
	listSitesByOwner(ownerSub: string): Promise<SiteRecord[]>;
	claimSite(domain: string, apiKey: string, ownerSub: string): Promise<SiteRecord | null>;

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
