import type { ClaudeBotProbeResult } from "./engine/claudebot-probe.js";

export interface SiteRecord {
	id: string;
	domain: string;
	apiKey: string;
	publicKey: string;
	verifiedAt: string | null;
	verificationToken: string;
	reclaimToken: string | null;
	reclaimRequestedAt: string | null;
	createdAt: string;
	ownerSub: string | null;
}

export interface PageRecord {
	id: number;
	siteId: string;
	url: string;
	title: string;
	description: string;
	headings: string; // JSON array of strings
	lastSeen: string;
	embedding?: number[] | null;
	contentHash?: string | null;
}

export interface Suggestion {
	url: string;
	title: string;
	description: string;
	score: number;
	matchType: "moved" | "similar" | "related";
}

export interface SiteStats {
	pageCount: number;
	suggestionsServed: number;
	lastBeaconAt: string | null;
}

export interface AnalysisReport {
	domain: string;
	analyzedAt: string;
	pagesAnalyzed: number;
	brokenLinks: { sourcePage: string; targetUrl: string }[];
	orphanPages: string[];
}

export interface SuggestionLog {
	deadUrl: string;
	suggestedUrls: string[];
	scores: string | null;
	matchTypes: string | null;
	createdAt: string;
}

export interface MatchQualityStats {
	last24h: number;
	last7d: number;
	last30d: number;
	matchTypeDistribution: { moved: number; similar: number; related: number };
}

export interface DashboardSiteData {
	id: string;
	domain: string;
	apiKey: string;
	publicKey: string;
	pageCount: number;
	suggestionsServed: number;
	lastBeaconAt: string | null;
	recentLogs: SuggestionLog[];
	matchQuality: MatchQualityStats;
	verified: boolean;
	verification: {
		dnsTxt: { name: string; value: string };
		wellKnown: { url: string; body: string };
	};
	/** Latest install-liveness probe, or null if never probed. */
	latestProbe: InstallProbe | null;
	/** Recent 404 events with agent + recovery outcome (BAT-61), newest first. */
	recentRecoveryEvents: RecoveryEvent[];
	/** Site-level recovery rate (BAT-61). */
	recovery: { total: number; recovered: number; rate: number };
	/** Derived lifecycle state driving the badge, status line, and checklist. */
	installState: InstallStateView;
}

export interface DashboardData {
	email: string | null;
	sites: DashboardSiteData[];
	claimDomain: string | null;
	pendingDomain: string | null;
	notice: string | null;
}

// Agent recovery tracking (BAT-61)
export type AgentCategory = "crawler" | "browser_agent" | "human";

// Install liveness probes (dashboard rework)
export type InstallProbeVerdict = "unrecovered_404" | "recovered_404" | "non_404" | "error";

export interface InstallProbe {
	id: string;
	siteId: string;
	probedAt: string;
	probePath: string;
	status: number;
	verdict: InstallProbeVerdict;
	hasLinkHeaders: boolean;
	hasJsonLd: boolean;
	/** Actual `Link:` header value from the response, when present. */
	linkHeader: string | null;
	summary: string | null;
	source: "manual" | "cron";
}

// Lifecycle states derived by lib/install-state.ts — the dashboard's answer
// to "is this working?" for each site.
export type InstallStateId =
	| "unverified"
	| "indexing"
	| "install_unknown"
	| "install_broken"
	| "soft_404"
	| "probe_failed"
	| "install_live"
	| "serving"
	| "recovering";

export interface InstallStepView {
	id: "verify" | "index" | "live_check" | "catch_404s" | "recovery";
	label: string;
	done: boolean;
	hint: string;
	tone: "ok" | "pending" | "problem";
}

export interface InstallStateView {
	stateId: InstallStateId;
	/** Header badge label, e.g. "Serving 404s". */
	badge: string;
	badgeTone: "success" | "warning" | "danger" | "neutral";
	/** One-sentence answer to "is this working?" */
	statusLine: string;
	steps: InstallStepView[];
}

export interface RecoveryEvent {
	id: string;
	siteId: string;
	deadUrl: string;
	suggestedUrls: string[];
	agentCategory: AgentCategory;
	userAgent: string;
	clientHash?: string;
	createdAt: string;
	recovered: boolean;
	recoveredUrl?: string;
	recoveryLatencyMs?: number;
}

export interface RecoveryRateStats {
	overall: {
		totalSuggestions: number;
		recoveredCount: number;
		recoveryRate: number; // 0.0 - 1.0 (e.g. 0.75 = 75%)
		medianLatencyMs: number | null;
	};
	byAgentCategory: Record<
		AgentCategory,
		{
			totalSuggestions: number;
			recoveredCount: number;
			recoveryRate: number;
			medianLatencyMs: number | null;
		}
	>;
}

// Audit-to-install conversion funnel (BAT-42)
export type FunnelStep =
	| "audit_started"
	| "audit_completed"
	| "report_shared"
	| "install_cta_clicked"
	| "site_registered"
	| "install_verified";

export interface FunnelConversionMetrics {
	totalAuditsStarted: number;
	totalAuditsCompleted: number;
	totalReportsShared: number;
	totalInstallCtaClicks: number;
	totalSitesRegistered: number;
	totalInstallsVerified: number;
	rates: {
		auditCompletionRate: number; // completed / started
		reportShareRate: number; // shared / completed
		installCtaRate: number; // cta / completed
		registrationRate: number; // registered / cta
		verificationRate: number; // verified / registered
		overallFunnelConversion: number; // verified / started
	};
}

/** A standing, shareable audit snapshot (BAT-38, BAT-39). Persisted in
 *  Postgres (`audit_reports`) — see StorageAdapter#saveAuditReport /
 *  #getAuditReport — so a report created on one serverless isolate is
 *  visible when a social crawler fetches its permalink or OG image from
 *  another. */
export interface StandingAuditReport {
	id: string;
	domain: string;
	createdAt: string;
	score: number; // 0 - 100 Agent Readiness Score
	claudeBotProbe: ClaudeBotProbeResult;
	summary: {
		status: "critical" | "warning" | "good";
		recommendation: string;
		crawlerAccessible: boolean;
		linkHeadersConfigured: boolean;
		jsonLdConfigured: boolean;
	};
	permalink: string;
	ogImageUrl: string;
}
