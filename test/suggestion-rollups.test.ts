import { describe, expect, it } from "vitest";
import { PostgresStorage } from "../src/storage/postgres.js";
import {
	pruneSuggestionLogs,
	ROLLUP_DELETE_BATCH_SIZE,
	rollupSuggestionDay,
	SUGGESTION_LOG_RETENTION_DAYS,
	utcDayStart,
	type RollupSql,
} from "../src/lib/suggestion-rollups.js";

// BAT-55 coverage: daily suggestion-log rollups, retention pruning, and the
// rewritten stats methods that read historical aggregates from the rollup
// while staying accurate for data not yet rolled up. Storage is faked with a
// stub sql (no real DB), following the pattern in recovery-storage.test.ts.

type Query = { text: string; params: unknown[] };

function makeRollupSql(selectRows: Record<string, unknown>[], deleteRowCounts: number[] = []) {
	const queries: Query[] = [];
	let deleteCall = 0;
	const sql: RollupSql = {
		async query(text, params) {
			queries.push({ text, params });
			if (text.startsWith("DELETE")) {
				const rowCount = deleteRowCounts[deleteCall++] ?? 0;
				return { rows: [], rowCount };
			}
			return { rows: selectRows, rowCount: null };
		},
	};
	return { sql, queries };
}

describe("utcDayStart", () => {
	it("truncates to UTC midnight regardless of local timezone", () => {
		const truncated = utcDayStart(new Date("2026-08-20T15:42:07.123Z"));
		expect(truncated.toISOString()).toBe("2026-08-20T00:00:00.000Z");
	});
});

describe("rollupSuggestionDay", () => {
	it("aggregates raw rows into one upsert per site with per-match-type counts", async () => {
		const { sql, queries } = makeRollupSql([
			{ site_id: "site_a", total: 10, moved_count: 4, similar_count: 5, related_count: 3 },
			{ site_id: "site_b", total: 2, moved_count: 0, similar_count: 0, related_count: 2 },
		]);
		const sites = await rollupSuggestionDay(sql, new Date("2026-08-20T15:00:00.000Z"));

		expect(sites).toBe(2);
		const inserts = queries.filter((q) => q.text.startsWith("INSERT"));
		expect(inserts).toHaveLength(2);
		// Day boundaries are UTC-midnight-bounded; day column is the UTC date.
		const select = queries[0];
		expect(select.params[0]).toBe("2026-08-20T00:00:00.000Z");
		expect(select.params[1]).toBe("2026-08-21T00:00:00.000Z");
		expect(inserts[0].params).toEqual(["site_a", "2026-08-20", 10, 4, 5, 3]);
		expect(inserts[1].params).toEqual(["site_b", "2026-08-20", 2, 0, 0, 2]);
	});

	it("upserts with ON CONFLICT DO UPDATE so a re-run is idempotent", async () => {
		const groupedRows = [
			{ site_id: "site_a", total: 7, moved_count: 7, similar_count: 0, related_count: 0 },
		];
		const first = makeRollupSql(groupedRows);
		await rollupSuggestionDay(first.sql, new Date("2026-08-20T15:00:00.000Z"));
		const second = makeRollupSql(groupedRows);
		await rollupSuggestionDay(second.sql, new Date("2026-08-20T15:00:00.000Z"));

		const insertText = first.queries.find((q) => q.text.startsWith("INSERT"))?.text ?? "";
		expect(insertText).toContain("ON CONFLICT (site_id, day) DO UPDATE SET");
		// Re-running for the same day recomputes from raw rows and emits the
		// exact same statement + params — converging instead of double-counting.
		const firstInsert = first.queries.filter((q) => q.text.startsWith("INSERT"))[0];
		const secondInsert = second.queries.filter((q) => q.text.startsWith("INSERT"))[0];
		expect(secondInsert.text).toBe(firstInsert.text);
		expect(secondInsert.params).toEqual(firstInsert.params);
	});

	it("matches match types via jsonb containment, not LIKE", async () => {
		const { sql, queries } = makeRollupSql([]);
		await rollupSuggestionDay(sql, new Date("2026-08-20T15:00:00.000Z"));
		const selectText = queries[0].text;
		expect(selectText).toContain(`match_types::jsonb @> '"moved"'::jsonb`);
		expect(selectText).not.toContain("LIKE");
	});

	it("emits no upserts when a day had no raw rows", async () => {
		const { sql, queries } = makeRollupSql([]);
		const sites = await rollupSuggestionDay(sql, new Date("2026-08-20T15:00:00.000Z"));
		expect(sites).toBe(0);
		expect(queries.filter((q) => q.text.startsWith("INSERT"))).toHaveLength(0);
	});
});

describe("pruneSuggestionLogs", () => {
	it("deletes in bounded batches until a batch comes back short", async () => {
		// Two full batches, then a partial one — the loop must stop there.
		const { sql, queries } = makeRollupSql([], [
			ROLLUP_DELETE_BATCH_SIZE,
			ROLLUP_DELETE_BATCH_SIZE,
			123,
		]);
		const deleted = await pruneSuggestionLogs(sql);

		expect(deleted).toBe(ROLLUP_DELETE_BATCH_SIZE * 2 + 123);
		const deletes = queries.filter((q) => q.text.startsWith("DELETE"));
		expect(deletes).toHaveLength(3);
		expect(deletes[0].params).toEqual([SUGGESTION_LOG_RETENTION_DAYS, ROLLUP_DELETE_BATCH_SIZE]);
		expect(deletes[0].text).toContain("LIMIT $2");
	});

	it("stops immediately when nothing is past retention", async () => {
		const { sql, queries } = makeRollupSql([], [0]);
		const deleted = await pruneSuggestionLogs(sql);
		expect(deleted).toBe(0);
		expect(queries.filter((q) => q.text.startsWith("DELETE"))).toHaveLength(1);
	});

	it("caps total work at ROLLUP_MAX_DELETE_BATCHES even with a huge backlog", async () => {
		const { sql, queries } = makeRollupSql(
			[],
			Array(100).fill(ROLLUP_DELETE_BATCH_SIZE),
		);
		const deleted = await pruneSuggestionLogs(sql);
		expect(deleted).toBe(50 * ROLLUP_DELETE_BATCH_SIZE);
		expect(queries.filter((q) => q.text.startsWith("DELETE"))).toHaveLength(50);
	});

	it("uses the 60-day retention constant by default", () => {
		expect(SUGGESTION_LOG_RETENTION_DAYS).toBe(60);
	});
});

// Order-based response queue: getStats/getMatchQualityStats issue their
// queries sequentially, so each stubbed call consumes the next response.
function makeStorage(responses: Record<string, unknown>[]): PostgresStorage {
	const storage: { sql: unknown } = Object.create(PostgresStorage.prototype) as any;
	const queue = [...responses];
	storage.sql = async (_strings: TemplateStringsArray, ..._values: unknown[]) => ({
		rows: queue.shift() ?? [],
	});
	return storage as unknown as PostgresStorage;
}

describe("PostgresStorage.getStats (BAT-55 rollup-backed)", () => {
	it("adds rollup history to same-day raw rows", async () => {
		const storage = makeStorage([
			[{ count: 12 }], // pages COUNT
			[{ total: 100 }], // rollup SUM(total)
			[{ count: 7 }], // uncovered raw rows (today)
			[{ last_seen: "2026-08-20T10:00:00.000Z" }], // MAX(last_seen)
		]);
		const stats = await storage.getStats("site_a");
		expect(stats.suggestionsServed).toBe(107);
		expect(stats.pageCount).toBe(12);
	});

	it("counts all raw rows when nothing has been rolled up yet", async () => {
		const storage = makeStorage([
			[{ count: 1 }],
			[{ total: 0 }],
			[{ count: 42 }],
			[{ last_seen: null }],
		]);
		const stats = await storage.getStats("site_a");
		expect(stats.suggestionsServed).toBe(42);
		expect(stats.lastBeaconAt).toBeNull();
	});
});

describe("PostgresStorage.getMatchQualityStats (BAT-55 rollup-backed)", () => {
	it("combines rollup distribution with uncovered raw rows and keeps raw windows", async () => {
		const storage = makeStorage([
			// Raw scan: activity windows over all retained rows + uncovered
			// match-type counts (rows newer than the last rolled-up day).
			[{
				last_24h: 5,
				last_7d: 30,
				last_30d: 90,
				moved_uncovered: 2,
				similar_uncovered: 3,
				related_uncovered: 1,
			}],
			// Rollup sums: all-time distribution from pruned-and-live history.
			[{ moved: 40, similar: 35, related: 25 }],
		]);
		const stats = await storage.getMatchQualityStats("site_a");
		expect(stats.last24h).toBe(5);
		expect(stats.last7d).toBe(30);
		expect(stats.last30d).toBe(90);
		expect(stats.matchTypeDistribution).toEqual({ moved: 42, similar: 38, related: 26 });
	});

	it("returns zeros for a site with no traffic", async () => {
		const storage = makeStorage([[{}], [{}]]);
		const stats = await storage.getMatchQualityStats("site_empty");
		expect(stats).toEqual({
			last24h: 0,
			last7d: 0,
			last30d: 0,
			matchTypeDistribution: { moved: 0, similar: 0, related: 0 },
		});
	});
});
