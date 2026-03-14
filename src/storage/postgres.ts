import { sql } from "@vercel/postgres";
import type { PageRecord, SiteRecord, SiteStats } from "../types.js";
import type { StorageAdapter } from "./interface.js";

export class PostgresStorage implements StorageAdapter {
	async createSite(domain: string): Promise<SiteRecord> {
		const id = crypto.randomUUID();
		const apiKey = `key_${crypto.randomUUID().replace(/-/g, "")}`;

		const { rows } = await sql`
			INSERT INTO sites (id, domain, api_key)
			VALUES (${id}, ${domain}, ${apiKey})
			RETURNING id, domain, api_key, created_at
		`;

		return this.mapSiteRow(rows[0]);
	}

	async getSite(id: string): Promise<SiteRecord | null> {
		const { rows } = await sql`SELECT * FROM sites WHERE id = ${id}`;
		return rows[0] ? this.mapSiteRow(rows[0]) : null;
	}

	async getSiteByApiKey(apiKey: string): Promise<SiteRecord | null> {
		const { rows } = await sql`SELECT * FROM sites WHERE api_key = ${apiKey}`;
		return rows[0] ? this.mapSiteRow(rows[0]) : null;
	}

	async upsertPage(
		siteId: string,
		page: Pick<PageRecord, "url" | "title" | "description" | "headings">,
	): Promise<void> {
		await sql`
			INSERT INTO pages (site_id, url, title, description, headings)
			VALUES (${siteId}, ${page.url}, ${page.title}, ${page.description}, ${page.headings})
			ON CONFLICT (site_id, url) DO UPDATE SET
				title = EXCLUDED.title,
				description = EXCLUDED.description,
				headings = EXCLUDED.headings,
				last_seen = NOW()
		`;
	}

	async upsertPages(
		siteId: string,
		pages: Pick<PageRecord, "url" | "title" | "description" | "headings">[],
	): Promise<void> {
		for (const page of pages) {
			await this.upsertPage(siteId, page);
		}
	}

	async getPages(siteId: string): Promise<PageRecord[]> {
		const { rows } = await sql`SELECT * FROM pages WHERE site_id = ${siteId}`;
		return rows.map(this.mapPageRow);
	}

	async deleteStalePagesOlderThan(siteId: string, cutoff: string): Promise<number> {
		const { rowCount } = await sql`
			DELETE FROM pages WHERE site_id = ${siteId} AND last_seen < ${cutoff}::timestamp
		`;
		return rowCount ?? 0;
	}

	async recordSuggestionServed(
		siteId: string,
		deadUrl: string,
		suggestedUrls: string[],
	): Promise<void> {
		await sql`
			INSERT INTO suggestion_logs (site_id, dead_url, suggested_urls)
			VALUES (${siteId}, ${deadUrl}, ${JSON.stringify(suggestedUrls)})
		`;
	}

	async getStats(siteId: string): Promise<SiteStats> {
		const pages = await sql`SELECT COUNT(*) as count FROM pages WHERE site_id = ${siteId}`;
		const suggestions = await sql`SELECT COUNT(*) as count FROM suggestion_logs WHERE site_id = ${siteId}`;

		return {
			pageCount: Number(pages.rows[0]?.count ?? 0),
			suggestionsServed: Number(suggestions.rows[0]?.count ?? 0),
		};
	}

	private mapSiteRow(row: Record<string, unknown>): SiteRecord {
		return {
			id: row.id as string,
			domain: row.domain as string,
			apiKey: row.api_key as string,
			createdAt: String(row.created_at),
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
			lastSeen: String(row.last_seen),
		};
	}
}
