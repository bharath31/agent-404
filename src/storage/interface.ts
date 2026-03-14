import type { PageRecord, SiteRecord, SiteStats } from "../types.js";

export interface StorageAdapter {
	createSite(domain: string): Promise<SiteRecord>;
	getSite(id: string): Promise<SiteRecord | null>;
	getSiteByApiKey(apiKey: string): Promise<SiteRecord | null>;

	upsertPage(
		siteId: string,
		page: Pick<PageRecord, "url" | "title" | "description" | "headings">,
	): Promise<void>;
	upsertPages(
		siteId: string,
		pages: Pick<PageRecord, "url" | "title" | "description" | "headings">[],
	): Promise<void>;
	getPages(siteId: string): Promise<PageRecord[]>;
	deleteStalePagesOlderThan(siteId: string, cutoff: string): Promise<number>;

	recordSuggestionServed(siteId: string, deadUrl: string, suggestedUrls: string[]): Promise<void>;
	getStats(siteId: string): Promise<SiteStats>;
}
