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
	InstallProbeVerdict,
} from "../types";
import type { StorageAdapter } from "./interface";
import { getDatabaseUrl } from "../config";
import { normalizePathname } from "../engine/url-normalize";
import {
	dashboardSiteStatus,
	decodeDashboardCursor,
	encodeDashboardCursor,
	type ActivityItem,
	type ActivityPage,
	type ActivityPageOptions,
	type IndexedPagePage,
	type IndexedPagePageOptions,
	type KeyRotationResult,
	type RecoverySeriesPoint,
	type RotateSiteKeyOutcome,
	type SiteInstallation,
	type SiteKeyKind,
	type SiteOverview,
	type SiteSettings,
	type SiteSummary,
} from "../data/dashboard";
import { verificationTxtName, wellKnownUrl } from "../engine/domain-verify";

/** JSONB columns come back already parsed via the neon driver's default type
 *  parsers, but fall back to JSON.parse defensively in case a column is ever
 *  read as raw text (e.g. a future driver/config change). */
function parseJsonColumn<T>(value: unknown): T {
	return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

type Sql = NeonQueryFunction<false, true>;

function safeRate(num: number, denom: number): number {
	return denom > 0 ? Math.round((num / denom) * 1000) / 1000 : 0;
}

function isoString(value: unknown): string {
	if (value instanceof Date) return value.toISOString();
	const parsed = new Date(String(value));
	return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : String(value);
}

function isoStringOrNull(value: unknown): string | null {
	return value == null ? null : isoString(value);
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
			SELECT *, CASE
				WHEN api_key = ${key}
					OR (previous_api_key = ${key} AND previous_api_key_expires_at > NOW())
					THEN 'secret'
				WHEN public_key = ${key}
					OR (previous_public_key = ${key} AND previous_public_key_expires_at > NOW())
					THEN 'public'
			END AS matched_key_type
			FROM sites
			WHERE api_key = ${key}
				OR public_key = ${key}
				OR (previous_api_key = ${key} AND previous_api_key_expires_at > NOW())
				OR (previous_public_key = ${key} AND previous_public_key_expires_at > NOW())
			LIMIT 1
		`;
		if (!rows[0]) return null;
		const keyType = rows[0].matched_key_type;
		if (keyType !== "secret" && keyType !== "public") return null;
		return { site: this.mapSiteRow(rows[0]), keyType };
	}

	async getSiteByDomain(domain: string): Promise<SiteRecord | null> {
		const { rows } = await this.sql`SELECT * FROM sites WHERE domain = ${domain}`;
		return rows[0] ? this.mapSiteRow(rows[0]) : null;
	}

	async getOwnedSiteByDomain(domain: string, ownerSub: string): Promise<SiteRecord | null> {
		const { rows } = await this.sql`
			SELECT * FROM sites WHERE domain = ${domain} AND owner_sub = ${ownerSub}
		`;
		return rows[0] ? this.mapSiteRow(rows[0]) : null;
	}

	async listSitesByOwner(ownerSub: string): Promise<SiteRecord[]> {
		const { rows } = await this.sql`
			SELECT * FROM sites WHERE owner_sub = ${ownerSub} ORDER BY created_at DESC
		`;
		return rows.map((row) => this.mapSiteRow(row));
	}

	async listSiteSummaries(ownerSub: string): Promise<SiteSummary[]> {
		const { rows } = await this.sql`
			WITH owned AS (
				SELECT id, domain, verified_at, created_at
				FROM sites
				WHERE owner_sub = ${ownerSub}
			), page_totals AS (
				SELECT p.site_id, COUNT(*)::int AS page_count, MAX(p.last_seen) AS last_page_at
				FROM pages p JOIN owned o ON o.id = p.site_id
				GROUP BY p.site_id
			), suggestions AS (
				SELECT sl.site_id,
					COUNT(*) FILTER (WHERE sl.created_at >= NOW() - INTERVAL '30 days')::int AS suggestions_30d,
					MAX(sl.created_at) AS last_suggestion_at
				FROM suggestion_logs sl JOIN owned o ON o.id = sl.site_id
				GROUP BY sl.site_id
			), recoveries AS (
				SELECT re.site_id,
					COUNT(*) FILTER (WHERE re.created_at >= NOW() - INTERVAL '30 days')::int AS recovery_total_30d,
					COUNT(*) FILTER (WHERE re.created_at >= NOW() - INTERVAL '30 days' AND re.recovered)::int AS recovered_30d,
					MAX(re.created_at) AS last_recovery_at
				FROM recovery_events re JOIN owned o ON o.id = re.site_id
				GROUP BY re.site_id
			), latest_probes AS (
				SELECT DISTINCT ON (ip.site_id) ip.site_id, ip.verdict, ip.probed_at
				FROM install_probes ip JOIN owned o ON o.id = ip.site_id
				ORDER BY ip.site_id, ip.probed_at DESC, ip.id DESC
			)
			SELECT
				o.id,
				o.domain,
				o.verified_at,
				o.created_at,
				COALESCE(pt.page_count, 0) AS page_count,
				COALESCE(sg.suggestions_30d, 0) AS suggestions_30d,
				CASE WHEN COALESCE(rc.recovery_total_30d, 0) = 0 THEN NULL
					ELSE ROUND(rc.recovered_30d::numeric / rc.recovery_total_30d, 3)
				END AS recovery_rate_30d,
				lp.verdict AS probe_verdict,
				GREATEST(pt.last_page_at, sg.last_suggestion_at, rc.last_recovery_at, lp.probed_at) AS last_activity_at
			FROM owned o
			LEFT JOIN page_totals pt ON pt.site_id = o.id
			LEFT JOIN suggestions sg ON sg.site_id = o.id
			LEFT JOIN recoveries rc ON rc.site_id = o.id
			LEFT JOIN latest_probes lp ON lp.site_id = o.id
			ORDER BY last_activity_at DESC NULLS LAST, o.created_at DESC, o.id DESC
		`;

		return rows.map((row) => {
			const verified = Boolean(row.verified_at);
			const pageCount = Number(row.page_count ?? 0);
			return {
				id: row.id as string,
				domain: row.domain as string,
				status: dashboardSiteStatus({
					verified,
					pageCount,
					probeVerdict: (row.probe_verdict as InstallProbeVerdict) || null,
				}),
				verified,
				pageCount,
				suggestions30d: Number(row.suggestions_30d ?? 0),
				recoveryRate30d:
					row.recovery_rate_30d == null ? null : Number(row.recovery_rate_30d),
				lastActivityAt: isoStringOrNull(row.last_activity_at),
				createdAt: isoString(row.created_at),
			};
		});
	}

	async claimSite(domain: string, apiKey: string, ownerSub: string): Promise<SiteRecord | null> {
		const found = await this.getSiteByKey(apiKey);
		const site = found?.site;
		if (!site || found.keyType !== "secret" || site.domain !== domain || site.ownerSub) return null;
		const { rows } = await this.sql`
			UPDATE sites SET owner_sub = ${ownerSub}
			WHERE id = ${site.id} AND domain = ${domain} AND owner_sub IS NULL
				AND (
					api_key = ${apiKey}
					OR (previous_api_key = ${apiKey} AND previous_api_key_expires_at > NOW())
				)
			RETURNING *
		`;
		return rows[0] ? this.mapSiteRow(rows[0]) : null;
	}

	async getSiteOverview(domain: string, ownerSub: string): Promise<SiteOverview | null> {
		const site = await this.getOwnedSiteByDomain(domain, ownerSub);
		if (!site) return null;

		const [metricResult, seriesResult, activity, latestProbe] = await Promise.all([
			this.sql`
				SELECT
					(SELECT COUNT(*)::int FROM pages WHERE site_id = ${site.id}) AS page_count,
					(SELECT COUNT(*)::int FROM suggestion_logs
						WHERE site_id = ${site.id} AND created_at >= NOW() - INTERVAL '30 days') AS suggestions_30d,
					(SELECT COUNT(*)::int FROM recovery_events
						WHERE site_id = ${site.id} AND created_at >= NOW() - INTERVAL '30 days') AS recovery_total_30d,
					(SELECT COUNT(*)::int FROM recovery_events
						WHERE site_id = ${site.id} AND created_at >= NOW() - INTERVAL '30 days' AND recovered) AS recovered_30d,
					(SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY recovery_latency_ms)
						FROM recovery_events
						WHERE site_id = ${site.id}
							AND created_at >= NOW() - INTERVAL '30 days'
							AND recovered AND recovery_latency_ms IS NOT NULL) AS median_latency,
					GREATEST(
						(SELECT MAX(last_seen) FROM pages WHERE site_id = ${site.id}),
						(SELECT MAX(created_at) FROM suggestion_logs WHERE site_id = ${site.id}),
						(SELECT MAX(created_at) FROM recovery_events WHERE site_id = ${site.id}),
						(SELECT MAX(probed_at) FROM install_probes WHERE site_id = ${site.id})
					) AS last_activity_at
			`,
			this.sql`
				WITH days AS (
					SELECT generate_series(
						CURRENT_DATE - INTERVAL '29 days',
						CURRENT_DATE,
						INTERVAL '1 day'
					)::date AS day
				), totals AS (
					SELECT created_at::date AS day,
						COUNT(*)::int AS suggestions,
						COUNT(*) FILTER (WHERE recovered)::int AS recovered
					FROM recovery_events
					WHERE site_id = ${site.id}
						AND created_at >= CURRENT_DATE - INTERVAL '29 days'
					GROUP BY created_at::date
				)
				SELECT d.day::text AS day,
					COALESCE(t.suggestions, 0) AS suggestions,
					COALESCE(t.recovered, 0) AS recovered
				FROM days d LEFT JOIN totals t USING (day)
				ORDER BY d.day ASC
			`,
			this.getActivityPage(site.id, { range: "30d", limit: 8 }),
			this.getLatestInstallProbe(site.id),
		]);

		const metric = metricResult.rows[0] || {};
		const pageCount = Number(metric.page_count ?? 0);
		const recoveryTotal = Number(metric.recovery_total_30d ?? 0);
		const recovered = Number(metric.recovered_30d ?? 0);
		const recoverySeries: RecoverySeriesPoint[] = seriesResult.rows.map((row) => {
			const suggestions = Number(row.suggestions ?? 0);
			const recoveredForDay = Number(row.recovered ?? 0);
			return {
				date: String(row.day),
				suggestions,
				recovered: recoveredForDay,
				recoveryRate:
					suggestions === 0
						? null
						: Math.round((recoveredForDay / suggestions) * 1000) / 1000,
			};
		});
		const status = dashboardSiteStatus({
			verified: Boolean(site.verifiedAt),
			pageCount,
			probeVerdict: latestProbe?.verdict ?? null,
		});

		let recommendedAction: SiteOverview["recommendedAction"];
		const installationHref = `/dashboard/${encodeURIComponent(site.domain)}/installation`;
		if (!site.verifiedAt) {
			recommendedAction = {
				id: "verify",
				title: "Verify this domain",
				description: "Publish one ownership token before agent-404 indexes or probes the site.",
				href: installationHref,
			};
		} else if (pageCount === 0) {
			recommendedAction = {
				id: "index",
				title: "Sync the sitemap",
				description: "Index at least one destination before the matcher can recover a dead URL.",
				href: `/dashboard/${encodeURIComponent(site.domain)}/pages`,
			};
		} else if (!latestProbe) {
			recommendedAction = {
				id: "probe",
				title: "Run the first live probe",
				description: "Check the deployed 404 response for Link headers and recovery metadata.",
				href: installationHref,
			};
		} else if (latestProbe.verdict !== "recovered_404") {
			recommendedAction = {
				id: "repair",
				title: "Repair the live integration",
				description: "The latest probe did not observe a recoverable 404 response.",
				href: installationHref,
			};
		} else if (recoveryTotal === 0) {
			recommendedAction = {
				id: "generate-traffic",
				title: "Test one dead URL",
				description: "The integration is live; make a test request to create its first recovery trace.",
				href: installationHref,
			};
		} else {
			recommendedAction = {
				id: "review",
				title: "Review recent recovery activity",
				description: "Inspect outcomes and URLs to catch matcher regressions early.",
				href: `/dashboard/${encodeURIComponent(site.domain)}/activity`,
			};
		}

		return {
			site: {
				id: site.id,
				domain: site.domain,
				verified: Boolean(site.verifiedAt),
				createdAt: site.createdAt,
			},
			status,
			metrics: {
				indexedPages: pageCount,
				suggestions30d: Number(metric.suggestions_30d ?? 0),
				recovered30d: recovered,
				recoveryRate30d:
					recoveryTotal === 0 ? null : Math.round((recovered / recoveryTotal) * 1000) / 1000,
				medianRecoveryLatencyMs30d:
					metric.median_latency == null ? null : Math.round(Number(metric.median_latency)),
				lastActivityAt: isoStringOrNull(metric.last_activity_at),
			},
			recoverySeries,
			recentActivity: activity.items,
			latestProbe,
			recommendedAction,
		};
	}

	async getActivityPage(siteId: string, opts: ActivityPageOptions = {}): Promise<ActivityPage> {
		const range = opts.range === "24h" || opts.range === "7d" || opts.range === "30d"
			? opts.range
			: "30d";
		const rangeHours = range === "24h" ? 24 : range === "7d" ? 7 * 24 : 30 * 24;
		const agent = opts.agent === "crawler" || opts.agent === "browser_agent" || opts.agent === "human"
			? opts.agent
			: "all";
		const outcome = opts.outcome === "recovered" || opts.outcome === "unrecovered"
			? opts.outcome
			: "all";
		const query = opts.query?.trim().slice(0, 300) || "";
		const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 100);

		const where = ["site_id = $1", `created_at >= NOW() - ${rangeHours} * INTERVAL '1 hour'`];
		const params: unknown[] = [siteId];
		if (agent !== "all") {
			params.push(agent);
			where.push(`agent_category = $${params.length}`);
		}
		if (outcome !== "all") {
			params.push(outcome === "recovered");
			where.push(`recovered = $${params.length}`);
		}
		if (query) {
			params.push(`%${query}%`);
			where.push(`(dead_url ILIKE $${params.length} OR COALESCE(recovered_url, '') ILIKE $${params.length})`);
		}
		if (opts.cursor) {
			const cursor = decodeDashboardCursor(opts.cursor);
			params.push(cursor.timestamp, cursor.id);
			where.push(
				`(created_at < ($${params.length - 1}::timestamptz AT TIME ZONE 'UTC') OR (created_at = ($${params.length - 1}::timestamptz AT TIME ZONE 'UTC') AND id < $${params.length}))`,
			);
		}
		params.push(limit + 1);
		const result = await this.sql.query(
			`SELECT id, dead_url, suggested_urls, agent_category, user_agent, created_at,
				to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_timestamp,
				recovered, recovered_url, recovery_latency_ms
			FROM recovery_events
			WHERE ${where.join(" AND ")}
			ORDER BY created_at DESC, id DESC
			LIMIT $${params.length}`,
			params,
		);

		const hasMore = result.rows.length > limit;
		const visible = result.rows.slice(0, limit);
		const items = visible.map((row) => this.mapActivityItemRow(row));
		const last = visible[visible.length - 1];
		return {
			items,
			hasMore,
			nextCursor:
				hasMore && last
					? encodeDashboardCursor({
						timestamp: String(last.cursor_timestamp || isoString(last.created_at)),
						id: Number(last.id),
					})
					: null,
		};
	}

	async getIndexedPagePage(
		siteId: string,
		opts: IndexedPagePageOptions = {},
	): Promise<IndexedPagePage> {
		const query = opts.query?.trim().slice(0, 300) || "";
		const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 100);
		const where = ["site_id = $1"];
		const params: unknown[] = [siteId];
		if (query) {
			params.push(`%${query}%`);
			where.push(
				`(url ILIKE $${params.length} OR title ILIKE $${params.length} OR description ILIKE $${params.length})`,
			);
		}
		if (opts.cursor) {
			const cursor = decodeDashboardCursor(opts.cursor);
			params.push(cursor.timestamp, cursor.id);
			where.push(
				`(last_seen < ($${params.length - 1}::timestamptz AT TIME ZONE 'UTC') OR (last_seen = ($${params.length - 1}::timestamptz AT TIME ZONE 'UTC') AND id < $${params.length}))`,
			);
		}
		params.push(limit + 1);
		const result = await this.sql.query(
			`SELECT id, url, title, description, last_seen,
				to_char(last_seen, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_timestamp
			FROM pages
			WHERE ${where.join(" AND ")}
			ORDER BY last_seen DESC, id DESC
			LIMIT $${params.length}`,
			params,
		);
		const hasMore = result.rows.length > limit;
		const visible = result.rows.slice(0, limit);
		const last = visible[visible.length - 1];
		return {
			items: visible.map((row) => ({
				id: Number(row.id),
				url: row.url as string,
				title: (row.title as string) || "",
				description: (row.description as string) || "",
				lastSeenAt: isoString(row.last_seen),
			})),
			hasMore,
			nextCursor:
				hasMore && last
					? encodeDashboardCursor({
						timestamp: String(last.cursor_timestamp || isoString(last.last_seen)),
						id: Number(last.id),
					})
					: null,
		};
	}

	async getSiteInstallation(domain: string, ownerSub: string): Promise<SiteInstallation | null> {
		const { rows } = await this.sql`
			SELECT s.id, s.domain, s.public_key, s.verified_at, s.verification_token,
				s.created_at, s.reindex_requested_at,
				COUNT(p.id)::int AS page_count, MAX(p.last_seen) AS last_indexed_at
			FROM sites s
			LEFT JOIN pages p ON p.site_id = s.id
			WHERE s.domain = ${domain} AND s.owner_sub = ${ownerSub}
			GROUP BY s.id
		`;
		const row = rows[0];
		if (!row) return null;
		const latestProbe = await this.getLatestInstallProbe(row.id as string);
		const verificationToken = (row.verification_token as string) || "";
		return {
			site: {
				id: row.id as string,
				domain: row.domain as string,
				verified: Boolean(row.verified_at),
				publicKey: (row.public_key as string) || "",
				createdAt: isoString(row.created_at),
			},
			pageCount: Number(row.page_count ?? 0),
			lastIndexedAt: isoStringOrNull(row.last_indexed_at),
			reindexRequestedAt: isoStringOrNull(row.reindex_requested_at),
			latestProbe,
			verification: {
				dnsTxt: { name: verificationTxtName(row.domain as string), value: verificationToken },
				wellKnown: { url: wellKnownUrl(row.domain as string), body: verificationToken },
			},
		};
	}

	async getSiteSettings(domain: string, ownerSub: string): Promise<SiteSettings | null> {
		const { rows } = await this.sql`
			SELECT id, domain, public_key, verified_at, created_at,
				previous_api_key_expires_at, previous_public_key_expires_at
			FROM sites
			WHERE domain = ${domain} AND owner_sub = ${ownerSub}
		`;
		const row = rows[0];
		if (!row) return null;
		return {
			site: {
				id: row.id as string,
				domain: row.domain as string,
				verified: Boolean(row.verified_at),
				publicKey: (row.public_key as string) || "",
				createdAt: isoString(row.created_at),
			},
			rotation: {
				secretOverlapExpiresAt: isoStringOrNull(row.previous_api_key_expires_at),
				publicOverlapExpiresAt: isoStringOrNull(row.previous_public_key_expires_at),
			},
		};
	}

	async rotateSiteKey(
		siteId: string,
		ownerSub: string,
		kind: SiteKeyKind,
		overlapHours = 24,
	): Promise<RotateSiteKeyOutcome> {
		const hours = Number.isFinite(overlapHours)
			? Math.min(Math.max(Math.trunc(overlapHours), 1), 168)
			: 24;
		const key = `${kind === "secret" ? "key" : "pk"}_${crypto.randomUUID().replace(/-/g, "")}`;
		const update = kind === "secret"
			? await this.sql`
				UPDATE sites
				SET previous_api_key = api_key,
					previous_api_key_expires_at = NOW() + ${hours} * INTERVAL '1 hour',
					api_key = ${key}
				WHERE id = ${siteId} AND owner_sub = ${ownerSub}
					AND (previous_api_key_expires_at IS NULL OR previous_api_key_expires_at <= NOW())
				RETURNING id, previous_api_key_expires_at AS expires_at, NOW() AS rotated_at
			`
			: await this.sql`
				UPDATE sites
				SET previous_public_key = public_key,
					previous_public_key_expires_at = NOW() + ${hours} * INTERVAL '1 hour',
					public_key = ${key}
				WHERE id = ${siteId} AND owner_sub = ${ownerSub}
					AND (previous_public_key_expires_at IS NULL OR previous_public_key_expires_at <= NOW())
				RETURNING id, previous_public_key_expires_at AS expires_at, NOW() AS rotated_at
			`;

		if (update.rows[0]) {
			const row = update.rows[0];
			const result: KeyRotationResult = {
				siteId: row.id as string,
				kind,
				key,
				previousKeyExpiresAt: isoString(row.expires_at),
				rotatedAt: isoString(row.rotated_at),
			};
			return { ok: true, result };
		}

		const existing = kind === "secret"
			? await this.sql`
				SELECT previous_api_key_expires_at AS expires_at
				FROM sites WHERE id = ${siteId} AND owner_sub = ${ownerSub}
			`
			: await this.sql`
				SELECT previous_public_key_expires_at AS expires_at
				FROM sites WHERE id = ${siteId} AND owner_sub = ${ownerSub}
			`;
		if (!existing.rows[0]) return { ok: false, reason: "not_found" };
		const expiresAt = isoStringOrNull(existing.rows[0].expires_at);
		if (expiresAt && Date.parse(expiresAt) > Date.now()) {
			return { ok: false, reason: "overlap_active", retryAt: expiresAt };
		}

		// A concurrent request may have changed the row between UPDATE and SELECT.
		// Treat that race as a conflict rather than issuing another credential.
		return {
			ok: false,
			reason: "overlap_active",
			retryAt: expiresAt ?? new Date(Date.now() + hours * 3_600_000).toISOString(),
		};
	}

	async requestSiteReindex(
		siteId: string,
		ownerSub: string,
	): Promise<{ id: string; domain: string } | null> {
		const { rows } = await this.sql`
			UPDATE sites SET reindex_requested_at = NOW(), last_cron_at = NULL
			WHERE id = ${siteId} AND owner_sub = ${ownerSub}
			RETURNING id, domain
		`;
		return rows[0]
			? { id: rows[0].id as string, domain: rows[0].domain as string }
			: null;
	}

	async completeSiteReindex(siteId: string): Promise<void> {
		await this.sql`
			UPDATE sites SET reindex_requested_at = NULL, last_cron_at = NOW() WHERE id = ${siteId}
		`;
	}

	async deleteOwnedSite(
		siteId: string,
		ownerSub: string,
		normalizedDomain: string,
	): Promise<boolean> {
		const { rowCount } = await this.sql`
			DELETE FROM sites
			WHERE id = ${siteId} AND owner_sub = ${ownerSub} AND domain = ${normalizedDomain}
		`;
		return (rowCount ?? 0) === 1;
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
				previous_api_key = NULL,
				previous_api_key_expires_at = NULL,
				previous_public_key = NULL,
				previous_public_key_expires_at = NULL,
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

	/**
	 * BAT-55: historical suggestion counts come from the daily rollup table;
	 * only raw rows newer than the last rolled-up day are counted live, so
	 * this no longer runs COUNT(*) over the full suggestion_logs table. The
	 * uncovered-raw boundary (last rollup day + 1) also keeps the total
	 * correct if a cron run is ever missed — those days get rolled up late.
	 */
	async getStats(siteId: string): Promise<SiteStats> {
		const pages =
			await this.sql`SELECT COUNT(*) as count FROM pages WHERE site_id = ${siteId}`;
		const rollup = await this.sql`
			SELECT COALESCE(SUM(total), 0) as total FROM suggestion_rollups WHERE site_id = ${siteId}
		`;
		const uncovered = await this.sql`
			SELECT COUNT(*) as count FROM suggestion_logs
			WHERE site_id = ${siteId}
				AND created_at >= (
					SELECT COALESCE(MAX(day) + 1, DATE 'epoch') FROM suggestion_rollups WHERE site_id = ${siteId}
				)
		`;

		const lastSeen = await this.sql`
			SELECT MAX(last_seen) as last_seen FROM pages WHERE site_id = ${siteId}
		`;

		return {
			pageCount: Number(pages.rows[0]?.count ?? 0),
			suggestionsServed:
				Number(rollup.rows[0]?.total ?? 0) + Number(uncovered.rows[0]?.count ?? 0),
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

	/**
	 * BAT-55: the all-time match-type distribution reads from the daily
	 * rollup (queryable columns, no more LIKE '%moved%' over a JSON blob)
	 * plus raw rows newer than the last rolled-up day. The recent activity
	 * windows stay on raw rows — retention (60d) always covers the 30d
	 * window, and rows inside those windows may already be rolled up, so
	 * they must not be restricted to uncovered rows.
	 */
	async getMatchQualityStats(siteId: string): Promise<MatchQualityStats> {
		const { rows } = await this.sql`
			WITH boundary AS (
				SELECT COALESCE(MAX(day) + 1, DATE 'epoch') AS d
				FROM suggestion_rollups WHERE site_id = ${siteId}
			)
			SELECT
				COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
				COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d,
				COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30d,
				COUNT(*) FILTER (WHERE created_at >= (SELECT d FROM boundary) AND match_types::jsonb @> '"moved"'::jsonb) as moved_uncovered,
				COUNT(*) FILTER (WHERE created_at >= (SELECT d FROM boundary) AND match_types::jsonb @> '"similar"'::jsonb) as similar_uncovered,
				COUNT(*) FILTER (WHERE created_at >= (SELECT d FROM boundary) AND match_types::jsonb @> '"related"'::jsonb) as related_uncovered
			FROM suggestion_logs
			WHERE site_id = ${siteId}
		`;
		const rollup = await this.sql`
			SELECT
				COALESCE(SUM(moved_count), 0) as moved,
				COALESCE(SUM(similar_count), 0) as similar,
				COALESCE(SUM(related_count), 0) as related
			FROM suggestion_rollups
			WHERE site_id = ${siteId}
		`;
		const row = rows[0] || {};
		const ru = rollup.rows[0] || {};
		return {
			last24h: Number(row.last_24h ?? 0),
			last7d: Number(row.last_7d ?? 0),
			last30d: Number(row.last_30d ?? 0),
			matchTypeDistribution: {
				moved: Number(ru.moved ?? 0) + Number(row.moved_uncovered ?? 0),
				similar: Number(ru.similar ?? 0) + Number(row.similar_uncovered ?? 0),
				related: Number(ru.related ?? 0) + Number(row.related_uncovered ?? 0),
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

	private mapActivityItemRow(row: Record<string, unknown>): ActivityItem {
		return {
			id: String(row.id),
			deadUrl: row.dead_url as string,
			suggestedUrls: row.suggested_urls
				? parseJsonColumn<string[]>(row.suggested_urls)
				: [],
			agentCategory: row.agent_category as AgentCategory,
			userAgent: (row.user_agent as string) || "",
			createdAt: isoString(row.created_at),
			recovered: Boolean(row.recovered),
			recoveredUrl: (row.recovered_url as string) || null,
			recoveryLatencyMs:
				row.recovery_latency_ms == null ? null : Number(row.recovery_latency_ms),
		};
	}

	async getRecentRecoveryEvents(siteId: string, limit: number): Promise<RecoveryEvent[]> {
		const { rows } = await this.sql`
			SELECT * FROM recovery_events
			WHERE site_id = ${siteId}
			ORDER BY created_at DESC, id DESC
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
			ORDER BY probed_at DESC, id DESC
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
			INSERT INTO audit_reports (id, domain, created_at, score, claudebot_probe, summary, permalink, og_image_url, analysis)
			VALUES (
				${report.id},
				${report.domain},
				${report.createdAt}::timestamptz,
				${report.score},
				${JSON.stringify(report.claudeBotProbe)}::jsonb,
				${JSON.stringify(report.summary)}::jsonb,
				${report.permalink},
				${report.ogImageUrl},
				${report.analysis ? JSON.stringify(report.analysis) : null}::jsonb
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
			analysis: row.analysis ? parseJsonColumn(row.analysis) : null,
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
