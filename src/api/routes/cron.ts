import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { crawlSitemap } from "../../engine/sitemap.js";
import { pruneStalePages } from "../../engine/indexer.js";
import { buildEmbeddingText, generateBatchEmbeddings } from "../../engine/embeddings.js";
import { invalidateSuggestCache } from "../../engine/suggest-cache.js";
import { probeClaudeBotResponse, deriveProbePath } from "../../engine/claudebot-probe.js";
import { isCronAuthorized } from "./admin.js";
import {
	pruneSuggestionLogs,
	rollupSuggestionDay,
	utcDayStart,
} from "../../lib/suggestion-rollups.js";

type Env = {
	Bindings: { CRON_SECRET?: string };
	Variables: { storage: PostgresStorage };
};

const cron = new Hono<Env>();

async function applyEmbeddingBatch(
	sql: { query: (text: string, params: unknown[]) => Promise<unknown> },
	ids: number[],
	vectors: string[],
): Promise<void> {
	const placeholders = ids.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2})`).join(", ");
	const params: unknown[] = [];
	for (let i = 0; i < ids.length; i++) {
		params.push(ids[i], vectors[i]);
	}
	await sql.query(
		`UPDATE pages AS p SET embedding = v.embedding::vector
		 FROM (VALUES ${placeholders}) AS v(id, embedding)
		 WHERE p.id = v.id`,
		params,
	);
}

// Cron: re-crawl sitemaps + prune stale pages + backfill embeddings
cron.get("/", async (c) => {
	if (!isCronAuthorized(c)) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const storage = c.get("storage");
	const sql = storage.getSql();
	// Vercel Hobby only allows a daily cron (`0 3 * * *`). Cloudflare can run
	// hourly. Both hit this handler. Do not exclusive-shard by weekday — that
	// left ~6 weeks between visits at 1,000 sites. Steal the stalest sites
	// (`last_cron_at`) and stop before the Edge ~25s cap.
	const CRON_BUDGET_MS = 18_000;
	const started = Date.now();
	const { rows: backlogRows } = await sql.query(
		`SELECT COUNT(*)::int AS n FROM sites
		 WHERE last_cron_at IS NULL OR last_cron_at < NOW() - INTERVAL '20 hours'`,
	);
	const remainingAtStart = Number(backlogRows[0]?.n ?? 0);
	const { rows } = await sql.query(
		`SELECT id, domain FROM sites
		 WHERE last_cron_at IS NULL OR last_cron_at < NOW() - INTERVAL '20 hours'
		 ORDER BY last_cron_at NULLS FIRST
		 LIMIT 15`,
	);

	const results = [];
	let stoppedForBudget = false;
	for (const row of rows) {
		if (Date.now() - started > CRON_BUDGET_MS) {
			stoppedForBudget = true;
			break;
		}
		const siteId = row.id as string;
		const domain = row.domain as string;
		const crawled = await crawlSitemap(domain, siteId, storage);
		const pruned = await pruneStalePages(storage, siteId, 30);

		// Backfill embeddings for pages missing them (bounded + batched writes)
		let backfilled = 0;
		const BACKFILL_LIMIT = 200;
		const { rows: nullPages } = await sql.query(
			`SELECT id, url, title, description FROM pages
			 WHERE site_id = $1 AND embedding IS NULL
			 ORDER BY id
			 LIMIT $2`,
			[siteId, BACKFILL_LIMIT],
		);
		if (nullPages.length > 0) {
			const BATCH_SIZE = 100;
			for (let i = 0; i < nullPages.length; i += BATCH_SIZE) {
				if (Date.now() - started > CRON_BUDGET_MS) {
					stoppedForBudget = true;
					break;
				}
				const batch = nullPages.slice(i, i + BATCH_SIZE);
				const texts = batch.map((p) =>
					buildEmbeddingText({
						url: p.url as string,
						title: p.title as string,
						description: p.description as string,
					}),
				);
				const embeddings = await generateBatchEmbeddings(texts);
				const ids: number[] = [];
				const vectors: string[] = [];
				for (let j = 0; j < batch.length; j++) {
					const emb = embeddings[j];
					if (emb && emb.every((v) => typeof v === "number" && Number.isFinite(v))) {
						ids.push(batch[j].id as number);
						vectors.push(`[${emb.join(",")}]`);
						backfilled++;
					}
				}
				if (ids.length > 0) {
					await applyEmbeddingBatch(sql, ids, vectors);
				}
			}
		}

		await sql`UPDATE sites SET last_cron_at = NOW() WHERE id = ${siteId}`;
		invalidateSuggestCache(siteId);
		results.push({ domain, crawled, pruned, backfilled });
		if (stoppedForBudget) break;
	}

	// Install-liveness probes (dashboard rework): independently budgeted from
	// the crawl pass — each probe is a live cross-origin fetch with a 6s
	// timeout, so it must never starve the sitemap/embedding work. Stalest
	// sites first; 48h cadence is plenty for an onboarding diagnostic.
	const PROBE_BUDGET_MS = 12_000;
	const probeStarted = Date.now();
	let probesRan = 0;
	let probesBroken = 0;
	try {
		const staleSites = await storage.listSitesNeedingProbe(3, 48);
		for (const s of staleSites) {
			if (Date.now() - probeStarted > PROBE_BUDGET_MS) break;
			const probePath = deriveProbePath();
			const probe = await probeClaudeBotResponse(s.domain, probePath);
			await sql.query(
				`INSERT INTO install_probes (site_id, probe_path, status, verdict, has_link_headers, has_json_ld, link_header, summary, source)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'cron')`,
				[
					s.id,
					probePath,
					probe.status,
					probe.verdict,
					probe.hasLinkHeaders,
					probe.hasJsonLd,
					probe.comparison.current.headers[0] ?? null,
					probe.summary,
				],
			);
			probesRan++;
			if (probe.verdict === "unrecovered_404") probesBroken++;
			console.log(
				JSON.stringify({ msg: "install_probe", domain: s.domain, verdict: probe.verdict, status: probe.status }),
			);
		}
	} catch (err) {
		// Probes are a diagnostic; they must never fail the cron.
		console.error("install_probe_pass failed:", err instanceof Error ? err.message : err);
	}

	// BAT-55: roll yesterday's raw suggestion_logs into suggestion_rollups and
	// prune rows past retention. Both are idempotent and bounded (see
	// src/lib/suggestion-rollups.ts); a missed run self-heals because the
	// rollup recomputes from raw rows and stats count uncovered raw rows.
	let sitesRolledUp = 0;
	let logsPruned = 0;
	try {
		const yesterday = utcDayStart(new Date(Date.now() - 24 * 3600 * 1000));
		sitesRolledUp = await rollupSuggestionDay(sql, yesterday);
		logsPruned = await pruneSuggestionLogs(sql);
	} catch (err) {
		// Rollups are an optimization; they must never fail the cron.
		console.error("suggestion_rollup_pass failed:", err instanceof Error ? err.message : err);
	}

	// BAT-62: computed once per cron run (not per shard site) so the north-star
	// number — live installs against the 1,000-instance goal — is durable in
	// logs even without hitting /api/admin/metrics.
	const [liveInstalls, totalSites] = await Promise.all([
		storage.getLiveInstallCount(),
		storage.getTotalSiteCount(),
	]);

	console.log(
		JSON.stringify({
			msg: "cron_shard",
			processed: results.length,
			remainingBacklog: Math.max(0, remainingAtStart - results.length),
			stoppedForBudget,
			elapsedMs: Date.now() - started,
			platform: process.env.VERCEL ? "vercel-daily" : "hourly-capable",
			probesRan,
			probesBroken,
			sitesRolledUp,
			logsPruned,
			liveInstalls,
			totalSites,
			goalTarget: 1000,
		}),
	);

	return c.json({
		ok: true,
		processed: results.length,
		remainingBacklog: Math.max(0, remainingAtStart - results.length),
		stoppedForBudget,
		results,
		sitesRolledUp,
		logsPruned,
		liveInstalls,
		totalSites,
		goalTarget: 1000,
	});
});

export { cron };
