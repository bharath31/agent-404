import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { PageRecord, SiteRecord, SiteStats, SuggestionLog, MatchQualityStats } from "../types.js";
import type { StorageAdapter } from "./interface.js";

type Sql = NeonQueryFunction<false, true>;

export class PostgresStorage implements StorageAdapter {
	private sql: Sql;

	constructor(databaseUrl?: string) {
		const url =
			databaseUrl ||
			process.env.DATABASE_URL ||
			process.env.POSTGRES_URL ||
			"";
		this.sql = neon(url, { fullResults: true });
	}

	/** Expose sql for cron handler's direct queries */
	getSql(): Sql {
		return this.sql;
	}

	async createSite(domain: string): Promise<SiteRecord> {
		const id = crypto.randomUUID();
		const apiKey = `key_${crypto.randomUUID().replace(/-/g, "")}`;

		const { rows } = await this.sql`
			INSERT INTO sites (id, domain, api_key)
			VALUES (${id}, ${domain}, ${apiKey})
			RETURNING id, domain, api_key, created_at
		`;

		return this.mapSiteRow(rows[0]);
	}

	async getSite(id: string): Promise<SiteRecord | null> {
		const { rows } = await this.sql`SELECT * FROM sites WHERE id = ${id}`;
		return rows[0] ? this.mapSiteRow(rows[0]) : null;
	}

	async getSiteByApiKey(apiKey: string): Promise<SiteRecord | null> {
		const { rows } =
			await this.sql`SELECT * FROM sites WHERE api_key = ${apiKey}`;
		return rows[0] ? this.mapSiteRow(rows[0]) : null;
	}

	private validateEmbedding(embedding: number[]): string | null {
		if (!Array.isArray(embedding)) return null;
		for (const v of embedding) {
			if (typeof v !== "number" || !Number.isFinite(v)) return null;
		}
		return `[${embedding.join(",")}]`;
	}

	async upsertPage(
		siteId: string,
		page: Pick<PageRecord, "url" | "title" | "description" | "headings">,
		embedding?: number[] | null,
	): Promise<void> {
		const embeddingStr = embedding ? this.validateEmbedding(embedding) : null;

		if (embeddingStr) {
			await this.sql.query(
				`INSERT INTO pages (site_id, url, title, description, headings, embedding)
				VALUES ($1, $2, $3, $4, $5, $6::vector)
				ON CONFLICT (site_id, url) DO UPDATE SET
					title = EXCLUDED.title,
					description = EXCLUDED.description,
					headings = EXCLUDED.headings,
					embedding = COALESCE(EXCLUDED.embedding, pages.embedding),
					last_seen = NOW()`,
				[
					siteId,
					page.url,
					page.title,
					page.description,
					page.headings,
					embeddingStr,
				],
			);
		} else {
			await this.sql`
				INSERT INTO pages (site_id, url, title, description, headings)
				VALUES (${siteId}, ${page.url}, ${page.title}, ${page.description}, ${page.headings})
				ON CONFLICT (site_id, url) DO UPDATE SET
					title = EXCLUDED.title,
					description = EXCLUDED.description,
					headings = EXCLUDED.headings,
					last_seen = NOW()
			`;
		}
	}

	async upsertPages(
		siteId: string,
		pages: Pick<PageRecord, "url" | "title" | "description" | "headings">[],
		embeddings?: (number[] | null)[],
	): Promise<void> {
		for (let i = 0; i < pages.length; i++) {
			const embedding = embeddings?.[i] ?? null;
			await this.upsertPage(siteId, pages[i], embedding);
		}
	}

	async searchByEmbedding(
		siteId: string,
		embedding: number[],
		limit: number,
	): Promise<PageRecord[]> {
		const embeddingStr = this.validateEmbedding(embedding);
		if (!embeddingStr) return [];
		const { rows } = await this.sql.query(
			`SELECT * FROM pages
			WHERE site_id = $1 AND embedding IS NOT NULL
			ORDER BY embedding <=> $2::vector
			LIMIT $3`,
			[siteId, embeddingStr, limit],
		);
		return rows.map(this.mapPageRow);
	}

	async getPages(siteId: string): Promise<PageRecord[]> {
		const { rows } =
			await this.sql`SELECT * FROM pages WHERE site_id = ${siteId}`;
		return rows.map(this.mapPageRow);
	}

	async deleteStalePagesOlderThan(
		siteId: string,
		cutoff: string,
	): Promise<number> {
		const { rowCount } = await this.sql`
			DELETE FROM pages WHERE site_id = ${siteId} AND last_seen < ${cutoff}::timestamp
		`;
		return rowCount ?? 0;
	}

	async recordSuggestionServed(
		siteId: string,
		deadUrl: string,
		suggestedUrls: string[],
		scores?: string,
		matchTypes?: string,
	): Promise<void> {
		await this.sql`
			INSERT INTO suggestion_logs (site_id, dead_url, suggested_urls, scores, match_types)
			VALUES (${siteId}, ${deadUrl}, ${JSON.stringify(suggestedUrls)}, ${scores ?? null}, ${matchTypes ?? null})
		`;
	}

	async getStats(siteId: string): Promise<SiteStats> {
		const pages =
			await this.sql`SELECT COUNT(*) as count FROM pages WHERE site_id = ${siteId}`;
		const suggestions =
			await this.sql`SELECT COUNT(*) as count FROM suggestion_logs WHERE site_id = ${siteId}`;

		return {
			pageCount: Number(pages.rows[0]?.count ?? 0),
			suggestionsServed: Number(suggestions.rows[0]?.count ?? 0),
		};
	}

	async getSuggestionLogs(siteId: string, limit: number): Promise<SuggestionLog[]> {
		const { rows } = await this.sql.query(
			`SELECT dead_url, suggested_urls, scores, match_types, created_at
			FROM suggestion_logs
			WHERE site_id = $1
			ORDER BY created_at DESC
			LIMIT $2`,
			[siteId, limit],
		);
		return rows.map((row: Record<string, unknown>) => ({
			deadUrl: row.dead_url as string,
			suggestedUrls: JSON.parse((row.suggested_urls as string) || "[]"),
			scores: (row.scores as string) || null,
			matchTypes: (row.match_types as string) || null,
			createdAt: String(row.created_at),
		}));
	}

	async getMatchQualityStats(siteId: string): Promise<MatchQualityStats> {
		const { rows } = await this.sql`
			SELECT
				COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
				COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d,
				COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30d,
				COUNT(*) FILTER (WHERE match_types LIKE '%moved%') as moved_count,
				COUNT(*) FILTER (WHERE match_types LIKE '%similar%') as similar_count,
				COUNT(*) FILTER (WHERE match_types LIKE '%related%') as related_count
			FROM suggestion_logs
			WHERE site_id = ${siteId}
		`;
		const row = rows[0] || {};
		return {
			last24h: Number(row.last_24h ?? 0),
			last7d: Number(row.last_7d ?? 0),
			last30d: Number(row.last_30d ?? 0),
			matchTypeDistribution: {
				moved: Number(row.moved_count ?? 0),
				similar: Number(row.similar_count ?? 0),
				related: Number(row.related_count ?? 0),
			},
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
