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
	pageCount: number;
	suggestionsServed: number;
	lastBeaconAt: string | null;
	recentLogs: SuggestionLog[];
	matchQuality: MatchQualityStats;
}

export interface DashboardData {
	email: string | null;
	sites: DashboardSiteData[];
	claimDomain: string | null;
	notice: string | null;
}
