import type { PageRecord, SiteRecord, SiteStats, SuggestionLog, MatchQualityStats } from "../types.js";

export interface StorageAdapter {
	createSite(domain: string, ownerSub: string): Promise<SiteRecord>;
	getSite(id: string): Promise<SiteRecord | null>;
	getSiteByApiKey(apiKey: string): Promise<SiteRecord | null>;
	getSiteByKey(key: string): Promise<{ site: SiteRecord; keyType: "secret" | "public" } | null>;
	getSiteByDomain(domain: string): Promise<SiteRecord | null>;
	markVerified(id: string): Promise<void>;
	rotateReclaimToken(id: string): Promise<string>;
	reclaimSite(id: string): Promise<SiteRecord>;
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
}
