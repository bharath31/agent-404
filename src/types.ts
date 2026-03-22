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
