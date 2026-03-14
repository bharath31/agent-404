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

export type Bindings = {
	DB: D1Database;
};
