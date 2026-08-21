import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type {
	PageRecord,
	SiteRecord,
	SiteStats,
	SuggestionLog,
	MatchQualityStats,
	FunnelStep,
	FunnelConversionMetrics,
	RecoveryEvent,
	RecoveryRateStats,
	AgentCategory,
	StandingAuditReport,
	InstallProbe,
} from "../types.js";
import type { StorageAdapter } from "./interface.js";
import { getDatabaseUrl } from "../config.js";
import { normalizePathname } from "../engine/url-normalize.js";

/** JSONB columns come back already parsed via the neon driver's default type
 *  parsers, but fall back to JSON.parse defensively in case a column is ever
 *  read as raw text (e.g. a future driver/config change). */
function parseJsonColumn<T>(value: unknown): T {
	return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

type Sql = NeonQueryFunction<false, true>;

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

function safeRate(num: number, denom: number): number {
	return denom > 0 ? Math.round((num / denom) * 1000) / 1000 : 0;
}

export class PostgresStorage implements StorageAdapter {
	private sql: Sql;

	constructor(databaseUrl?: string) {
		const url = databaseUrl || getDatabaseUrl();
		this.sql = neon(url, { fullResults: true });
	}

	/** Expose sql for cron handler's direct queries */
	getSql(): Sql {
		return this.sql;
	}

	async createSite(domain: string, ownerSub: string): Promise<SiteRecord> {
		const id = crypto.randomUUID();
		const apiKey = `key_${crypto.randomUUID().replace(/-/g, "")}`;
		const publicKey = `pk_${crypto.randomUUID().replace(/-/g, "")}`;
		const verificationToken = `vf_${crypto.randomUUID().replace(/-/g, "")}`;

		const { rows } = await this.sql`
			INSERT INTO sites (id, domain, api_key, public_key, verification_token, owner_sub)
			VALUES (${id}, ${domain}, ${apiKey}, ${publicKey}, ${verificationToken}, ${ownerSub})
			RETURNING *
		`;
		return this.mapSiteRow(rows[0]);
	}

	async getSite(id: string): Promise<SiteRecord | null> {
		const { rows } = await this.sql`SELECT * FROM sites WHERE id = ${id}`;
		return rows[0] ? this.mapSiteRow(rows[0]) : null;
	}

	async getSiteByApiKey(apiKey: string): Promise<SiteRecord | null> {
		const found = await this.getSiteByKey(apiKey);
		return found?.keyType === "secret" ? found.site : null;
	}

	async getSiteByKey(key: string): Promise<{ site: SiteRecord; keyType: "secret" | "public" } | null> {
		const { rows } = await this.sql`
			SELECT * FROM sites WHERE api_key = ${key} OR public_key = ${key}
		`;
		if (!rows[0]) return null;
		const site = this.mapSiteRow(rows[0]);
		if (site.apiKey === key) return { site, keyType: "secret" };
		if (site.publicKey === key) return { site, keyType: "public" };
		return null;
	}

	async getSiteByDomain(domain: string): Promise<SiteRecord | null> {
		const { rows } = await this.sql`SELECT * FROM sites WHERE domain = ${domain}`;
		return rows[0] ? this.mapSiteRow(rows[0]) : null;
	}

	async listSitesByOwner(ownerSub: string): Promise<SiteRecord[]> {
		const { rows } = await this.sql`
			SELECT * FROM sites WHERE owner_sub = ${ownerSub} ORDER BY created_at DESC
		`;
		return rows.map((row) => this.mapSiteRow(row));
	}

	async claimSite(domain: string, apiKey: string, ownerSub: string): Promise<SiteRecord | null> {
		const site = await this.getSiteByDomain(domain);
		if (!site || site.ownerSub) return null;
		if (!timingSafeEqual(site.apiKey, apiKey)) return null;

		const { rows } = await this.sql`
			UPDATE sites SET owner_sub = ${ownerSub}
			WHERE domain = ${domain} AND owner_sub IS NULL AND api_key = ${apiKey}
			RETURNING *
		`;
		return rows[0] ? this.mapSiteRow(rows[0]) : null;
	}

	async markVerified(id: string): Promise<void> {
		await this.sql`UPDATE sites SET verified_at = NOW(), reclaim_token = NULL, reclaim_requested_at = NULL WHERE id = ${id}`;
	}

	async rotateReclaimToken(id: string): Promise<string> {
		const existing = await this.sql`SELECT reclaim_token FROM sites WHERE id = ${id}`;
		const current = (existing.rows[0]?.reclaim_token as string) || "";
		if (current) return current;
		const token = `rc_${crypto.randomUUID().replace(/-/g, "")}`;
		await this.sql`UPDATE sites SET reclaim_token = ${token}, reclaim_requested_at = NOW() WHERE id = ${id}`;
		return token;
	}

	async reclaimSite(id: string, ownerSub: string): Promise<SiteRecord> {
		const apiKey = `key_${crypto.randomUUID().replace(/-/g, "")}`;
		const publicKey = `pk_${crypto.randomUUID().replace(/-/g, "")}`;
		const verificationToken = `vf_${crypto.randomUUID().replace(/-/g, "")}`;
		// Drop the previous holder's index — titles/headings are attacker-chosen.
		await this.sql`DELETE FROM pages WHERE site_id = ${id}`;
		const { rows } = await this.sql`
			UPDATE sites
			SET api_key = ${apiKey},
				public_key = ${publicKey},
				verification_token = ${verificationToken},
				reclaim_token = NULL,
				reclaim_requested_at = NULL,
				verified_at = NOW(),
				owner_sub = ${ownerSub}
			WHERE id = ${id}
			RETURNING *
		`;
		return this.mapSiteRow(rows[0]);
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
		page: Pick<PageRecord, "url" | "title" | "description" | "headings"> & {
			contentHash?: string | null;
		},
		embedding?: number[] | null,
	): Promise<void> {
		const embeddingStr = embedding ? this.validateEmbedding(embedding) : null;
		const hash = page.contentHash ?? null;

		if (embeddingStr) {
			await this.sql.query(
				`INSERT INTO pages (site_id, url, title, description, headings, embedding, content_hash)
				VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
				ON CONFLICT (site_id, url) DO UPDATE SET
					title = EXCLUDED.title,
					description = EXCLUDED.description,
					headings = EXCLUDED.headings,
					embedding = COALESCE(EXCLUDED.embedding, pages.embedding),
					content_hash = COALESCE(EXCLUDED.content_hash, pages.content_hash),
					last_seen = NOW()`,
				[siteId, page.url, page.title, page.description, page.headings, embeddingStr, hash],
			);
			return;
		}

		await this.sql.query(
			`INSERT INTO pages (site_id, url, title, description, headings, content_hash)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (site_id, url) DO UPDATE SET
				title = EXCLUDED.title,
				description = EXCLUDED.description,
				headings = EXCLUDED.headings,
				content_hash = COALESCE(EXCLUDED.content_hash, pages.content_hash),
				last_seen = NOW()`,
			[siteId, page.url, page.title, page.description, page.headings, hash],
		);
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

	/**
	 * hnsw.ef_search controls the size of the dynamic candidate list HNSW
	 * walks at query time — higher values trade latency for recall (see
	 * pgvector's HNSW docs). pgvector's own default is 40, which is tuned
	 * for a single flat index. Since BAT-53 (migrations/0014) partitions
	 * `pages` by site_id, each query only ever searches one (much smaller)
	 * per-site partition, so we can afford a higher ef_search than the
	 * default for meaningfully better recall at a small, bounded latency
	 * cost. Re-tune this against scripts/benchmark-recall.ts if partition
	 * count or per-tenant row counts change materially.
	 */
	private static readonly EF_SEARCH = 100;

	async searchByEmbedding(
		siteId: string,
		embedding: number[],
		limit: number,
	): Promise<PageRecord[]> {
		const embeddingStr = this.validateEmbedding(embedding);
		if (!embeddingStr) return [];

		// SET LOCAL only applies for the lifetime of a transaction, and SET
		// doesn't accept a bind parameter for its value — so this runs as a
		// two-statement transaction with the (constant, non-user-controlled)
		// ef_search value inlined via sql.unsafe rather than interpolated as
		// a query parameter.
		const results = await this.sql.transaction([
			this.sql`SET LOCAL hnsw.ef_search = ${this.sql.unsafe(String(PostgresStorage.EF_SEARCH))}`,
			this.sql`SELECT * FROM pages
				WHERE site_id = ${siteId} AND embedding IS NOT NULL
				ORDER BY embedding <=> ${embeddingStr}::vector
				LIMIT ${limit}`,
		]);
		const rows = results[1]?.rows ?? [];
		return rows.map(this.mapPageRow);
	}

	async getPages(
		siteId: string,
		opts?: { limit?: number; pathHint?: string },
	): Promise<PageRecord[]> {
		const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 500);
		const hint = opts?.pathHint?.replace(/[%_]/g, "") || null;
		if (hint) {
			const like = `%${hint}%`;
			const { rows } = await this.sql.query(
				`SELECT * FROM pages
				WHERE site_id = $1 AND (url ILIKE $2 OR title ILIKE $2)
				ORDER BY last_seen DESC
				LIMIT $3`,
				[siteId, like, limit],
			);
			return rows.map(this.mapPageRow);
		}
		const { rows } = await this.sql.query(
			`SELECT * FROM pages WHERE site_id = $1 ORDER BY last_seen DESC LIMIT $2`,
			[siteId, limit],
		);
		return rows.map(this.mapPageRow);
	}

	async getPageContentHash(siteId: string, url: string): Promise<string | null> {
		const { rows } = await this.sql`
			SELECT content_hash FROM pages WHERE site_id = ${siteId} AND url = ${url}
		`;
		return (rows[0]?.content_hash as string) || null;
	}

	async touchPage(siteId: string, url: string): Promise<void> {
		await this.sql`
			UPDATE pages SET last_seen = NOW() WHERE site_id = ${siteId} AND url = ${url}
		`;
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

		const lastSeen = await this.sql`
			SELECT MAX(last_seen) as last_seen FROM pages WHERE site_id = ${siteId}
		`;

		return {
			pageCount: Number(pages.rows[0]?.count ?? 0),
			suggestionsServed: Number(suggestions.rows[0]?.count ?? 0),
			lastBeaconAt: lastSeen.rows[0]?.last_seen ? String(lastSeen.rows[0].last_seen) : null,
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

	/**
	 * BAT-62. Mirrors isLiveInstall() in lib/live-installs.ts — a site
	 * counts only if it indexed a page AND served a suggestion in the
	 * last 7 days, excluding CI/test domains. Keep this WHERE clause in
	 * sync with that definition if either changes.
	 */
	async recordFunnelEvent(
		step: FunnelStep,
		domain?: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		await this.sql`
			INSERT INTO funnel_events (step, domain, metadata)
			VALUES (${step}, ${domain ?? null}, ${metadata ? JSON.stringify(metadata) : null})
		`;
	}

	async getFunnelMetrics(): Promise<FunnelConversionMetrics> {
		const { rows } = await this.sql`
			SELECT
				COUNT(*) FILTER (WHERE step = 'audit_started') as started,
				COUNT(*) FILTER (WHERE step = 'audit_completed') as completed,
				COUNT(*) FILTER (WHERE step = 'report_shared') as shared,
				COUNT(*) FILTER (WHERE step = 'install_cta_clicked') as cta,
				COUNT(*) FILTER (WHERE step = 'site_registered') as registered,
				COUNT(*) FILTER (WHERE step = 'install_verified') as verified
			FROM funnel_events
		`;
		const row = rows[0] || {};
		const started = Number(row.started ?? 0);
		const completed = Number(row.completed ?? 0);
		const shared = Number(row.shared ?? 0);
		const cta = Number(row.cta ?? 0);
		const registered = Number(row.registered ?? 0);
		const verified = Number(row.verified ?? 0);

		return {
			totalAuditsStarted: started,
			totalAuditsCompleted: completed,
			totalReportsShared: shared,
			totalInstallCtaClicks: cta,
			totalSitesRegistered: registered,
			totalInstallsVerified: verified,
			rates: {
				auditCompletionRate: safeRate(completed, started),
				reportShareRate: safeRate(shared, completed),
				installCtaRate: safeRate(cta, completed),
				registrationRate: safeRate(registered, cta),
				verificationRate: safeRate(verified, registered),
				overallFunnelConversion: safeRate(verified, started),
			},
		};
	}

	// --- Agent recovery tracking (BAT-61) ---

	async recordRecoveryEvent(
		siteId: string,
		deadUrl: string,
		suggestedUrls: string[],
		agentCategory: AgentCategory,
		userAgent?: string,
		clientHash?: string,
	): Promise<void> {
		await this.sql`
			INSERT INTO recovery_events (site_id, dead_url, suggested_urls, agent_category, user_agent, client_hash)
			VALUES (
				${siteId},
				${deadUrl},
				${JSON.stringify(suggestedUrls)},
				${agentCategory},
				${userAgent ?? null},
				${clientHash ?? null}
			)
		`;
	}

	async markRecoveryEventRecovered(
		siteId: string,
		fetchedUrl: string,
		windowMs: number,
		clientHash?: string,
	): Promise<RecoveryEvent | null> {
		// Use a simple two-step approach: find the most recent matching event,
		// then update it. This avoids nested SQL template complications.
		const { rows: candidates } = await this.sql`
			SELECT id, suggested_urls FROM recovery_events
			WHERE site_id = ${siteId}
				AND recovered = FALSE
				AND created_at > NOW() - make_interval(secs => ${windowMs / 1000})
				AND (${clientHash ? this.sql`client_hash = ${clientHash}` : this.sql`TRUE`})
			ORDER BY created_at DESC
			LIMIT 50
		`;

		if (candidates.length === 0) return null;

		// Find the first candidate whose suggested_urls include the fetched URL
		const fetchedNorm = normalizePathname(fetchedUrl);
		let matchId: number | null = null;
		for (const cand of candidates) {
			const urls: string[] = typeof cand.suggested_urls === "string"
				? JSON.parse(cand.suggested_urls)
				: (cand.suggested_urls as string[]);
			if (urls.some((u) => normalizePathname(u) === fetchedNorm)) {
				matchId = Number(cand.id);
				break;
			}
		}

		if (matchId === null) return null;

		const { rows } = await this.sql`
			UPDATE recovery_events
			SET
				recovered = TRUE,
				recovered_url = ${fetchedUrl},
				recovery_latency_ms = EXTRACT(EPOCH FROM (NOW() - created_at)) * 1000
			WHERE id = ${matchId}
			RETURNING *
		`;
		const row = rows[0];
		if (!row) return null;
		return this.mapRecoveryEventRow(row);
	}

	async getRecoveryRateStats(siteId?: string): Promise<RecoveryRateStats> {
		const filter = siteId ? this.sql`WHERE site_id = ${siteId}` : this.sql``;
		const { rows } = await this.sql`
			SELECT
				COUNT(*) AS total,
				COUNT(*) FILTER (WHERE recovered) AS recovered,
				PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY recovery_latency_ms) FILTER (WHERE recovered) AS median_latency,
				COUNT(*) FILTER (WHERE agent_category = 'crawler') AS crawler_total,
				COUNT(*) FILTER (WHERE agent_category = 'crawler' AND recovered) AS crawler_recovered,
				PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY recovery_latency_ms) FILTER (WHERE agent_category = 'crawler' AND recovered) AS crawler_latency,
				COUNT(*) FILTER (WHERE agent_category = 'browser_agent') AS agent_total,
				COUNT(*) FILTER (WHERE agent_category = 'browser_agent' AND recovered) AS agent_recovered,
				PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY recovery_latency_ms) FILTER (WHERE agent_category = 'browser_agent' AND recovered) AS agent_latency,
				COUNT(*) FILTER (WHERE agent_category = 'human') AS human_total,
				COUNT(*) FILTER (WHERE agent_category = 'human' AND recovered) AS human_recovered,
				PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY recovery_latency_ms) FILTER (WHERE agent_category = 'human' AND recovered) AS human_latency
			FROM recovery_events
			${filter}
		`;
		const row = rows[0] || {};
		const num = (v: unknown) => Number(v ?? 0);
		const lat = (v: unknown) => (v == null ? null : Math.round(Number(v)));

		const mk = (
			total: number,
			recovered: number,
			median: number | null,
		) => ({
			totalSuggestions: total,
			recoveredCount: recovered,
			recoveryRate: total > 0 ? Math.round((recovered / total) * 1000) / 1000 : 0,
			medianLatencyMs: median,
		});

		return {
			overall: mk(num(row.total), num(row.recovered), lat(row.median_latency)),
			byAgentCategory: {
				crawler: mk(num(row.crawler_total), num(row.crawler_recovered), lat(row.crawler_latency)),
				browser_agent: mk(num(row.agent_total), num(row.agent_recovered), lat(row.agent_latency)),
				human: mk(num(row.human_total), num(row.human_recovered), lat(row.human_latency)),
			},
		};
	}

	private mapRecoveryEventRow(row: Record<string, unknown>): RecoveryEvent {
		return {
			id: String(row.id),
			siteId: row.site_id as string,
			deadUrl: row.dead_url as string,
			// Neon's type parsers hand JSONB columns back already parsed (an array,
			// not a JSON string). Coercing with String() then JSON.parse would join
			// the elements with commas and throw on the non-JSON result — coerce
			// defensively through the shared helper instead (handles parsed array
			// or raw-then-parsed text), falling back to [] for nullish data.
			suggestedUrls: row.suggested_urls ? parseJsonColumn<string[]>(row.suggested_urls) : [],
			agentCategory: row.agent_category as AgentCategory,
			userAgent: (row.user_agent as string) || "",
			clientHash: (row.client_hash as string) || undefined,
			createdAt: String(row.created_at),
			recovered: Boolean(row.recovered),
			recoveredUrl: (row.recovered_url as string) || undefined,
			recoveryLatencyMs: row.recovery_latency_ms != null ? Number(row.recovery_latency_ms) : undefined,
		};
	}

	async getRecentRecoveryEvents(siteId: string, limit: number): Promise<RecoveryEvent[]> {
		const { rows } = await this.sql`
			SELECT * FROM recovery_events
			WHERE site_id = ${siteId}
			ORDER BY created_at DESC
			LIMIT ${limit}
		`;
		return rows.map((row) => this.mapRecoveryEventRow(row));
	}

	// --- Install liveness probes (dashboard rework) ---

	async saveInstallProbe(probe: InstallProbe): Promise<void> {
		await this.sql`
			INSERT INTO install_probes (site_id, probe_path, status, verdict, has_link_headers, has_json_ld, link_header, summary, source)
			VALUES (
				${probe.siteId},
				${probe.probePath},
				${probe.status},
				${probe.verdict},
				${probe.hasLinkHeaders},
				${probe.hasJsonLd},
				${probe.linkHeader ?? null},
				${probe.summary ?? null},
				${probe.source}
			)
		`;
	}

	async getLatestInstallProbe(siteId: string): Promise<InstallProbe | null> {
		const { rows } = await this.sql`
			SELECT * FROM install_probes
			WHERE site_id = ${siteId}
			ORDER BY probed_at DESC
			LIMIT 1
		`;
		return rows[0] ? this.mapInstallProbeRow(rows[0]) : null;
	}

	async listSitesNeedingProbe(
		limit: number,
		maxAgeHours: number,
	): Promise<{ id: string; domain: string }[]> {
		// Mirror of the reporting filter in lib/live-installs.ts (isTestDomain):
		// RFC 2666-reserved example.com hosts and legacy smoke-* prefixes are
		// CI artifacts, not real installs — probing them burns budget.
		const { rows } = await this.sql`
			SELECT s.id, s.domain FROM sites s
			WHERE s.domain NOT ILIKE '%.example.com'
				AND s.domain NOT LIKE 'smoke-%'
				AND NOT EXISTS (
					SELECT 1 FROM install_probes p
					WHERE p.site_id = s.id
						AND p.probed_at > NOW() - ${maxAgeHours} * INTERVAL '1 hour'
				)
			ORDER BY (
				SELECT MAX(p.probed_at) FROM install_probes p WHERE p.site_id = s.id
			) NULLS FIRST
			LIMIT ${limit}
		`;
		return rows.map((row) => ({
			id: row.id as string,
			domain: row.domain as string,
		}));
	}

	private mapInstallProbeRow(row: Record<string, unknown>): InstallProbe {
		return {
			id: String(row.id),
			siteId: row.site_id as string,
			probedAt: String(row.probed_at),
			probePath: row.probe_path as string,
			status: Number(row.status ?? 0),
			verdict: row.verdict as InstallProbe["verdict"],
			hasLinkHeaders: Boolean(row.has_link_headers),
			hasJsonLd: Boolean(row.has_json_ld),
			linkHeader: (row.link_header as string) || null,
			summary: (row.summary as string) || null,
			source: (row.source as InstallProbe["source"]) || "manual",
		};
	}

	async getLiveInstallCount(): Promise<number> {
		const { rows } = await this.sql`
			SELECT COUNT(*) AS count FROM sites s
			WHERE s.domain NOT ILIKE '%.example.com'
				AND s.domain NOT ILIKE 'smoke-%'
				AND EXISTS (
					SELECT 1 FROM pages p
					WHERE p.site_id = s.id AND p.last_seen > NOW() - INTERVAL '7 days'
				)
				AND EXISTS (
					SELECT 1 FROM suggestion_logs sl
					WHERE sl.site_id = s.id AND sl.created_at > NOW() - INTERVAL '7 days'
				)
		`;
		return Number(rows[0]?.count ?? 0);
	}

	// BAT-26: precision ground truth from hand labels (migration 0013). Reads
	// only retained raw rows — the weekly labeling loop judges recent matcher
	// behavior, and raw rows are pruned after the retention window.
	async getLabelPrecision(): Promise<{ labeled: number; correct: number }> {
		const { rows } = await this.sql`
			SELECT
				COUNT(*) FILTER (WHERE label IS NOT NULL) AS labeled,
				COUNT(*) FILTER (WHERE label = 'correct') AS correct
			FROM suggestion_logs
		`;
		return {
			labeled: Number(rows[0]?.labeled ?? 0),
			correct: Number(rows[0]?.correct ?? 0),
		};
	}


	async getTotalSiteCount(): Promise<number> {
		const { rows } = await this.sql`SELECT COUNT(*) AS count FROM sites`;
		return Number(rows[0]?.count ?? 0);
	}

	async saveAuditReport(report: StandingAuditReport): Promise<void> {
		await this.sql`
			INSERT INTO audit_reports (id, domain, created_at, score, claudebot_probe, summary, permalink, og_image_url)
			VALUES (
				${report.id},
				${report.domain},
				${report.createdAt}::timestamptz,
				${report.score},
				${JSON.stringify(report.claudeBotProbe)}::jsonb,
				${JSON.stringify(report.summary)}::jsonb,
				${report.permalink},
				${report.ogImageUrl}
			)
			ON CONFLICT (id) DO NOTHING
		`;
	}

	async getAuditReport(id: string): Promise<StandingAuditReport | null> {
		const { rows } = await this.sql`SELECT * FROM audit_reports WHERE id = ${id}`;
		return rows[0] ? this.mapAuditReportRow(rows[0]) : null;
	}

	private mapAuditReportRow(row: Record<string, unknown>): StandingAuditReport {
		return {
			id: row.id as string,
			domain: row.domain as string,
			createdAt: String(row.created_at),
			score: Number(row.score),
			claudeBotProbe: parseJsonColumn(row.claudebot_probe),
			summary: parseJsonColumn(row.summary),
			permalink: row.permalink as string,
			ogImageUrl: row.og_image_url as string,
		};
	}

	private mapSiteRow(row: Record<string, unknown>): SiteRecord {
		return {
			id: row.id as string,
			domain: row.domain as string,
			apiKey: row.api_key as string,
			publicKey: (row.public_key as string) || "",
			verifiedAt: row.verified_at ? String(row.verified_at) : null,
			verificationToken: (row.verification_token as string) || "",
			reclaimToken: (row.reclaim_token as string) || null,
			reclaimRequestedAt: row.reclaim_requested_at ? String(row.reclaim_requested_at) : null,
			createdAt: String(row.created_at),
			ownerSub: (row.owner_sub as string) || null,
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
			contentHash: (row.content_hash as string) || null,
		};
	}
}
