/**
 * BAT-55: daily suggestion-log rollups + retention pruning.
 *
 * suggestion_logs grows without bound (~300k rows/day at 1,000 sites) and the
 * dashboard used to scan it raw on every load. The daily cron rolls yesterday's
 * raw rows into `suggestion_rollups` (migrations/0015) keyed by (site_id, day)
 * and prunes raw rows past the retention window, so historical aggregates come
 * from a few hundred rollup rows instead of millions of log rows.
 *
 * Both operations are idempotent: the rollup recomputes from raw rows and
 * upserts (ON CONFLICT DO UPDATE), so re-running for the same day is safe, and
 * deletes are batched so no single statement is unbounded.
 */

/** Raw suggestion_logs rows older than this are pruned by the daily cron. */
export const SUGGESTION_LOG_RETENTION_DAYS = 60;

/** Rows deleted per DELETE statement — keeps each statement bounded. */
export const ROLLUP_DELETE_BATCH_SIZE = 5_000;

/** Hard cap on delete batches per cron run — bounds total cron time spent pruning. */
export const ROLLUP_MAX_DELETE_BATCHES = 50;

/**
 * Minimal query surface actually used here (the Neon driver's shape), so tests
 * can stub it without touching credentials.
 */
export interface RollupSql {
	query(text: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

/** Truncate to UTC midnight — rollup days are UTC days. */
export function utcDayStart(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Roll up every raw suggestion_logs row in [dayStart, dayStart + 24h) into
 * suggestion_rollups, one upsert per site that had traffic that day.
 *
 * Match-type counts use jsonb containment (`@> '"moved"'`) on the match_types
 * array — exact element matching, not LIKE '%moved%'. A row counts once per
 * type it contains (a row can carry several suggestions with different types),
 * mirroring the previous per-row semantics. match_types is always a JSON array
 * or NULL when written (recordSuggestionServed JSON.stringify's it), so the
 * cast cannot hit malformed text.
 *
 * Idempotent: safe to run repeatedly for the same day within retention.
 */
export async function rollupSuggestionDay(sql: RollupSql, dayStart: Date): Promise<number> {
	const start = utcDayStart(dayStart);
	const end = new Date(start.getTime() + 24 * 3600 * 1000);
	const { rows } = await sql.query(
		`SELECT site_id,
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE match_types::jsonb @> '"moved"'::jsonb) AS moved_count,
			COUNT(*) FILTER (WHERE match_types::jsonb @> '"similar"'::jsonb) AS similar_count,
			COUNT(*) FILTER (WHERE match_types::jsonb @> '"related"'::jsonb) AS related_count
		FROM suggestion_logs
		WHERE created_at >= $1::timestamp AND created_at < $2::timestamp
		GROUP BY site_id`,
		[start.toISOString(), end.toISOString()],
	);

	for (const row of rows) {
		await sql.query(
			`INSERT INTO suggestion_rollups (site_id, day, total, moved_count, similar_count, related_count)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (site_id, day) DO UPDATE SET
				total = EXCLUDED.total,
				moved_count = EXCLUDED.moved_count,
				similar_count = EXCLUDED.similar_count,
				related_count = EXCLUDED.related_count,
				updated_at = NOW()`,
			[
				row.site_id,
				start.toISOString().slice(0, 10),
				Number(row.total ?? 0),
				Number(row.moved_count ?? 0),
				Number(row.similar_count ?? 0),
				Number(row.related_count ?? 0),
			],
		);
	}
	return rows.length;
}

/**
 * Delete raw suggestion_logs rows older than `retentionDays`, in bounded
 * batches. Returns the number of rows deleted; stops early at the batch cap so
 * a large backlog can't blow the cron budget — the next run continues where
 * this one stopped.
 */
export async function pruneSuggestionLogs(
	sql: RollupSql,
	retentionDays = SUGGESTION_LOG_RETENTION_DAYS,
): Promise<number> {
	let deleted = 0;
	for (let batch = 0; batch < ROLLUP_MAX_DELETE_BATCHES; batch++) {
		const { rowCount } = await sql.query(
			`DELETE FROM suggestion_logs
			WHERE id IN (
				SELECT id FROM suggestion_logs
				WHERE created_at < NOW() - make_interval(days => $1::int)
				LIMIT $2
			)`,
			[retentionDays, ROLLUP_DELETE_BATCH_SIZE],
		);
		deleted += rowCount ?? 0;
		if ((rowCount ?? 0) < ROLLUP_DELETE_BATCH_SIZE) break;
	}
	return deleted;
}
