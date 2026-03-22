export interface SiteRecord {
	id: string;
	domain: string;
	apiKey: string;
	createdAt: string;
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

export interface DashboardData {
	domain: string;
	pageCount: number;
	suggestionsServed: number;
	recentLogs: SuggestionLog[];
	matchQuality: MatchQualityStats;
}
