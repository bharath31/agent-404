/**
 * Standalone recall@20 benchmark for pgvector embedding search (BAT-53).
 *
 * Context: migrations/0014_partition_vector_index.sql partitions `pages` by
 * HASH(site_id) with one HNSW index per partition, replacing the single
 * global HNSW index. The premise is that a tenant with a small share of a
 * large global index gets worse ANN recall as OTHER tenants' rows grow the
 * index — partitioning should make recall depend only on that tenant's own
 * row count, not on total table size. This script measures that directly:
 * for each synthetic site, it computes the true top-K nearest neighbors by
 * EXACT brute-force cosine distance (index scans disabled, forcing a seq
 * scan) and compares them against `searchByEmbedding`'s approximate HNSW
 * results, reporting recall@K = |exact ∩ approx| / K.
 *
 * This does NOT run as part of `npm test` — it needs a real, reachable
 * Postgres (Neon) instance and writes/deletes rows in it. Run it manually,
 * ideally against a disposable staging DB or a prod snapshot, BEFORE and
 * AFTER applying migrations/0014_partition_vector_index.sql, and compare
 * the two reports.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/benchmark-recall.ts [options]
 *
 * Options:
 *   --sites=<n>             number of synthetic sites to create (default 5)
 *   --min-rows=<n>          min pages per synthetic site (default 200)
 *   --max-rows=<n>          max pages per synthetic site (default 8000)
 *   --queries-per-site=<n>  queries to run per site (default 20)
 *   --k=<n>                 recall@K, must match the LIMIT under test (default 20)
 *   --dims=<n>               embedding dimensionality — must match the live
 *                             `pages.embedding` column (default 768; see
 *                             migrations/0010_cloudflare_embeddings.sql)
 *   --batch-size=<n>        rows per bulk INSERT while seeding (default 500)
 *   --keep                  skip cleanup — leaves synthetic sites/pages in
 *                           place for manual inspection (delete by hand:
 *                           domains matching 'bench-recall-%.example.com')
 *
 * Site row counts are spread across [--min-rows, --max-rows] (log-spaced)
 * so the report shows recall as a function of per-tenant row count —
 * that's the trend BAT-53 is meant to flatten out.
 */

import { randomUUID } from "node:crypto";
import { PostgresStorage } from "../src/storage/postgres.js";
import { getDatabaseUrl } from "../src/config.js";

interface Args {
	sites: number;
	minRows: number;
	maxRows: number;
	queriesPerSite: number;
	k: number;
	dims: number;
	batchSize: number;
	keep: boolean;
}

function parseArgs(argv: string[]): Args {
	const get = (name: string): string | undefined => {
		const prefix = `--${name}=`;
		const hit = argv.find((a) => a.startsWith(prefix));
		return hit ? hit.slice(prefix.length) : undefined;
	};
	const num = (name: string, fallback: number): number => {
		const raw = get(name);
		if (raw === undefined) return fallback;
		const parsed = Number(raw);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			throw new Error(`--${name} must be a positive number, got: ${raw}`);
		}
		return parsed;
	};
	return {
		sites: num("sites", 5),
		minRows: num("min-rows", 200),
		maxRows: num("max-rows", 8000),
		queriesPerSite: num("queries-per-site", 20),
		k: num("k", 20),
		dims: num("dims", 768),
		batchSize: num("batch-size", 500),
		keep: argv.includes("--keep"),
	};
}

/** Random (unnormalized — cosine distance is scale-invariant) vector. */
function randomEmbedding(dims: number): number[] {
	const v = new Array<number>(dims);
	for (let i = 0; i < dims; i++) v[i] = Math.random() * 2 - 1;
	return v;
}

/** Perturb an existing embedding to synthesize a "query near this page" vector. */
function perturb(embedding: number[], magnitude = 0.05): number[] {
	return embedding.map((x) => x + (Math.random() * 2 - 1) * magnitude);
}

function toVectorLiteral(embedding: number[]): string {
	return `[${embedding.join(",")}]`;
}

/** Log-spaced row counts between min and max, one per site. */
function rowCountsFor(args: Args): number[] {
	if (args.sites === 1) return [args.maxRows];
	const logMin = Math.log(args.minRows);
	const logMax = Math.log(args.maxRows);
	const counts: number[] = [];
	for (let i = 0; i < args.sites; i++) {
		const t = i / (args.sites - 1);
		counts.push(Math.round(Math.exp(logMin + t * (logMax - logMin))));
	}
	return counts;
}

interface SiteBenchResult {
	siteId: string;
	rowCount: number;
	meanRecall: number;
	minRecall: number;
	maxRecall: number;
	queries: number;
}

async function seedSitePages(
	storage: PostgresStorage,
	siteId: string,
	rowCount: number,
	dims: number,
	batchSize: number,
): Promise<number[][]> {
	const sql = storage.getSql();
	const embeddings: number[][] = [];
	for (let offset = 0; offset < rowCount; offset += batchSize) {
		const chunkSize = Math.min(batchSize, rowCount - offset);
		const values: string[] = [];
		const params: unknown[] = [];
		for (let i = 0; i < chunkSize; i++) {
			const embedding = randomEmbedding(dims);
			embeddings.push(embedding);
			const url = `/bench/${offset + i}-${randomUUID()}`;
			const base = params.length;
			values.push(
				`($${base + 1}, $${base + 2}, '', '', '[]', $${base + 3}::vector)`,
			);
			params.push(siteId, url, toVectorLiteral(embedding));
		}
		await sql.query(
			`INSERT INTO pages (site_id, url, title, description, headings, embedding)
			VALUES ${values.join(", ")}`,
			params,
		);
	}
	return embeddings;
}

/**
 * Exact top-K by cosine distance, computed with index scans disabled so
 * Postgres has to seq-scan and compute every distance — the ground truth
 * that approximate HNSW search is judged against.
 */
async function exactTopK(
	storage: PostgresStorage,
	siteId: string,
	embedding: number[],
	k: number,
): Promise<number[]> {
	const sql = storage.getSql();
	const embeddingStr = toVectorLiteral(embedding);
	const results = await sql.transaction([
		sql`SET LOCAL enable_indexscan = off`,
		sql`SET LOCAL enable_bitmapscan = off`,
		sql`SET LOCAL enable_seqscan = on`,
		sql`SELECT id FROM pages
			WHERE site_id = ${siteId} AND embedding IS NOT NULL
			ORDER BY embedding <=> ${embeddingStr}::vector
			LIMIT ${k}`,
	]);
	const rows = results[3]?.rows ?? [];
	return rows.map((r) => Number((r as { id: unknown }).id));
}

async function benchmarkSite(
	storage: PostgresStorage,
	siteId: string,
	rowCount: number,
	args: Args,
): Promise<SiteBenchResult> {
	const embeddings = await seedSitePages(storage, siteId, rowCount, args.dims, args.batchSize);

	const recalls: number[] = [];
	for (let i = 0; i < args.queriesPerSite; i++) {
		// Query near a random real page's embedding, rather than pure noise,
		// so there's a meaningful "true" neighborhood to recover — a random
		// vector in high dimensions is roughly equidistant from everything.
		const anchor = embeddings[Math.floor(Math.random() * embeddings.length)];
		const query = perturb(anchor);

		const [exact, approx] = await Promise.all([
			exactTopK(storage, siteId, query, args.k),
			storage.searchByEmbedding(siteId, query, args.k),
		]);

		const exactSet = new Set(exact);
		const hits = approx.filter((p) => exactSet.has(p.id)).length;
		recalls.push(exact.length > 0 ? hits / exact.length : 1);
	}

	return {
		siteId,
		rowCount,
		meanRecall: recalls.reduce((a, b) => a + b, 0) / recalls.length,
		minRecall: Math.min(...recalls),
		maxRecall: Math.max(...recalls),
		queries: recalls.length,
	};
}

async function cleanup(storage: PostgresStorage, siteIds: string[]): Promise<void> {
	const sql = storage.getSql();
	// pages.site_id -> sites.id has no ON DELETE CASCADE, so pages must go first.
	await sql.query(`DELETE FROM pages WHERE site_id = ANY($1)`, [siteIds]);
	await sql.query(`DELETE FROM sites WHERE id = ANY($1)`, [siteIds]);
}

function printReport(results: SiteBenchResult[]): void {
	console.log("\nrecall@K by synthetic site (sorted by row count)\n");
	console.log(
		["rows", "queries", "mean recall", "min recall", "max recall"]
			.map((h) => h.padEnd(14))
			.join(""),
	);
	const sorted = [...results].sort((a, b) => a.rowCount - b.rowCount);
	for (const r of sorted) {
		console.log(
			[
				String(r.rowCount),
				String(r.queries),
				r.meanRecall.toFixed(3),
				r.minRecall.toFixed(3),
				r.maxRecall.toFixed(3),
			]
				.map((c) => c.padEnd(14))
				.join(""),
		);
	}
	const overall =
		results.reduce((sum, r) => sum + r.meanRecall, 0) / results.length;
	console.log(`\noverall mean recall: ${overall.toFixed(3)}`);
	console.log(
		"\nIf mean recall trends DOWN as row count grows, the index (partitioned or not)",
	);
	console.log(
		"is under-provisioned for that tenant size — consider raising hnsw.ef_search",
	);
	console.log(
		"(see PostgresStorage.EF_SEARCH in src/storage/postgres.ts) or the partition count.",
	);
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const databaseUrl = getDatabaseUrl();
	if (!databaseUrl) {
		console.error("DATABASE_URL (or POSTGRES_URL) must be set to run this benchmark.");
		process.exit(1);
	}

	const storage = new PostgresStorage(databaseUrl);
	const rowCounts = rowCountsFor(args);
	const siteIds: string[] = [];

	console.log(
		`Seeding ${args.sites} synthetic site(s) with row counts: ${rowCounts.join(", ")}`,
	);

	try {
		const results: SiteBenchResult[] = [];
		for (let i = 0; i < args.sites; i++) {
			const domain = `bench-recall-${randomUUID()}.example.com`;
			const site = await storage.createSite(domain, `bench-owner-${randomUUID()}`);
			siteIds.push(site.id);

			console.log(`  site ${i + 1}/${args.sites} (${site.id}): seeding ${rowCounts[i]} pages...`);
			const result = await benchmarkSite(storage, site.id, rowCounts[i], args);
			results.push(result);
			console.log(
				`    mean recall@${args.k} = ${result.meanRecall.toFixed(3)} (${result.queries} queries)`,
			);
		}

		printReport(results);
	} finally {
		if (args.keep) {
			console.log(
				`\n--keep set: leaving ${siteIds.length} synthetic site(s) in place. ` +
					"Clean up later with:\n" +
					`  DELETE FROM pages WHERE site_id = ANY(ARRAY[${siteIds.map((id) => `'${id}'`).join(",")}]);\n` +
					`  DELETE FROM sites WHERE id = ANY(ARRAY[${siteIds.map((id) => `'${id}'`).join(",")}]);`,
			);
		} else {
			console.log("\nCleaning up synthetic sites/pages...");
			await cleanup(storage, siteIds);
		}
	}
}

main().catch((err) => {
	console.error("Benchmark failed:", err);
	process.exit(1);
});
