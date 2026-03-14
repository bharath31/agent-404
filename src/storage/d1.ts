import type { PageRecord, SiteRecord, SiteStats } from "../types.js";
import type { StorageAdapter } from "./interface.js";

export class D1Storage implements StorageAdapter {
	constructor(private db: D1Database) {}

	async createSite(domain: string): Promise<SiteRecord> {
		const id = crypto.randomUUID();
		const apiKey = `key_${crypto.randomUUID().replace(/-/g, "")}`;
		const now = new Date().toISOString();

		await this.db
			.prepare("INSERT INTO sites (id, domain, api_key, created_at) VALUES (?, ?, ?, ?)")
			.bind(id, domain, apiKey, now)
			.run();

		return { id, domain, apiKey, createdAt: now };
	}

	async getSite(id: string): Promise<SiteRecord | null> {
		const row = await this.db.prepare("SELECT * FROM sites WHERE id = ?").bind(id).first();
		return row ? this.mapSiteRow(row) : null;
	}

	async getSiteByApiKey(apiKey: string): Promise<SiteRecord | null> {
		const row = await this.db
			.prepare("SELECT * FROM sites WHERE api_key = ?")
			.bind(apiKey)
			.first();
		return row ? this.mapSiteRow(row) : null;
	}

	async upsertPage(
		siteId: string,
		page: Pick<PageRecord, "url" | "title" | "description" | "headings">,
	): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO pages (site_id, url, title, description, headings, last_seen)
				 VALUES (?, ?, ?, ?, ?, datetime('now'))
				 ON CONFLICT(site_id, url) DO UPDATE SET
				   title = excluded.title,
				   description = excluded.description,
				   headings = excluded.headings,
				   last_seen = datetime('now')`,
			)
			.bind(siteId, page.url, page.title, page.description, page.headings)
			.run();
	}

	async upsertPages(
		siteId: string,
		pages: Pick<PageRecord, "url" | "title" | "description" | "headings">[],
	): Promise<void> {
		const batchSize = 50;
		for (let i = 0; i < pages.length; i += batchSize) {
			const batch = pages.slice(i, i + batchSize);
			const stmts = batch.map((page) =>
				this.db
					.prepare(
						`INSERT INTO pages (site_id, url, title, description, headings, last_seen)
						 VALUES (?, ?, ?, ?, ?, datetime('now'))
						 ON CONFLICT(site_id, url) DO UPDATE SET
						   title = excluded.title,
						   description = excluded.description,
						   headings = excluded.headings,
						   last_seen = datetime('now')`,
					)
					.bind(siteId, page.url, page.title, page.description, page.headings),
			);
			await this.db.batch(stmts);
		}
	}

	async getPages(siteId: string): Promise<PageRecord[]> {
		const { results } = await this.db
			.prepare("SELECT * FROM pages WHERE site_id = ?")
			.bind(siteId)
			.all();
		return (results || []).map(this.mapPageRow);
	}

	async deleteStalePagesOlderThan(siteId: string, cutoff: string): Promise<number> {
		const result = await this.db
			.prepare("DELETE FROM pages WHERE site_id = ? AND last_seen < ?")
			.bind(siteId, cutoff)
			.run();
		return result.meta?.changes ?? 0;
	}

	async recordSuggestionServed(
		siteId: string,
		deadUrl: string,
		suggestedUrls: string[],
	): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO suggestion_logs (site_id, dead_url, suggested_urls) VALUES (?, ?, ?)",
			)
			.bind(siteId, deadUrl, JSON.stringify(suggestedUrls))
			.run();
	}

	async getStats(siteId: string): Promise<SiteStats> {
		const pageCount = await this.db
			.prepare("SELECT COUNT(*) as count FROM pages WHERE site_id = ?")
			.bind(siteId)
			.first<{ count: number }>();

		const suggestionsServed = await this.db
			.prepare("SELECT COUNT(*) as count FROM suggestion_logs WHERE site_id = ?")
			.bind(siteId)
			.first<{ count: number }>();

		return {
			pageCount: pageCount?.count ?? 0,
			suggestionsServed: suggestionsServed?.count ?? 0,
		};
	}

	private mapSiteRow(row: Record<string, unknown>): SiteRecord {
		return {
			id: row.id as string,
			domain: row.domain as string,
			apiKey: row.api_key as string,
			createdAt: row.created_at as string,
		};
	}

	private mapPageRow(row: Record<string, unknown>): PageRecord {
		return {
			id: row.id as number,
			siteId: row.site_id as string,
			url: row.url as string,
			title: row.title as string,
			description: row.description as string,
			headings: row.headings as string,
			lastSeen: row.last_seen as string,
		};
	}
}
