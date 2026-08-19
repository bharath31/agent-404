#!/usr/bin/env tsx
/**
 * BAT-63: weekly hand-labeling of served suggestions.
 *
 * `suggestion_logs` (see migrations/0001_init.sql, 0003_dashboard.sql) has no
 * ground-truth signal for whether the top-ranked suggestion was actually
 * what the visitor/agent wanted. This script samples a batch of unlabeled
 * rows, prompts an operator to hand-label the top suggestion as correct or
 * incorrect, and records the result (migrations/0013_suggestion_labels.sql)
 * so matcher/threshold changes can be measured against real precision.
 *
 * Usage:
 *   npm run labels:sample                 # sample 100 unlabeled rows
 *   npm run labels:sample -- --limit 25    # sample a smaller batch
 *   npm run labels:sample -- --by alice    # attribute labels to "alice"
 *
 * For each row: shows the dead URL and the top suggested URL, then prompts
 *   y = top suggestion correct
 *   n = top suggestion incorrect
 *   s = skip (leave unlabeled)
 *   q = quit (stop labeling; already-recorded labels are kept)
 * An optional one-line note can be attached to each label.
 */
import { neon } from "@neondatabase/serverless";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { userInfo } from "node:os";

export interface SampleRow {
	id: number;
	site_id: string;
	dead_url: string;
	suggested_urls: string;
	scores: string | null;
	match_types: string | null;
	created_at: string;
}

export type LabelAnswer = "correct" | "incorrect" | "skip" | "quit";

/** Pull the top (first) suggested URL out of the stored JSON array, if any. */
export function topSuggestedUrl(suggestedUrlsJson: string): string | null {
	try {
		const urls = JSON.parse(suggestedUrlsJson || "[]");
		return Array.isArray(urls) && urls.length > 0 ? String(urls[0]) : null;
	} catch {
		return null;
	}
}

/** Map a raw keystroke to a label decision. Returns null for unrecognized input. */
export function parseLabelAnswer(input: string): LabelAnswer | null {
	const normalized = input.trim().toLowerCase();
	if (normalized === "y" || normalized === "yes" || normalized === "correct") return "correct";
	if (normalized === "n" || normalized === "no" || normalized === "incorrect") return "incorrect";
	if (normalized === "s" || normalized === "skip" || normalized === "") return "skip";
	if (normalized === "q" || normalized === "quit") return "quit";
	return null;
}

function parseArgs(argv: string[]): { limit: number; labeledBy: string } {
	let limit = 100;
	let labeledBy = process.env.LABELED_BY || userInfo().username || "unknown";
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--limit" && argv[i + 1]) {
			limit = Number.parseInt(argv[i + 1], 10) || limit;
			i++;
		} else if (argv[i] === "--by" && argv[i + 1]) {
			labeledBy = argv[i + 1];
			i++;
		}
	}
	return { limit, labeledBy };
}

async function main() {
	const { limit, labeledBy } = parseArgs(process.argv.slice(2));
	const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
	if (!connectionString) {
		console.error("DATABASE_URL (or POSTGRES_URL) is required.");
		process.exit(1);
	}
	const sql = neon(connectionString, { fullResults: true });

	const { rows } = (await sql.query(
		`SELECT id, site_id, dead_url, suggested_urls, scores, match_types, created_at
		 FROM suggestion_logs
		 WHERE label IS NULL
		 ORDER BY random()
		 LIMIT $1`,
		[limit],
	)) as unknown as { rows: SampleRow[] };

	if (rows.length === 0) {
		console.log("No unlabeled suggestion_logs rows found.");
		return;
	}

	console.log(`Sampled ${rows.length} unlabeled rows. Labeling as "${labeledBy}".\n`);

	const rl = createInterface({ input: stdin, output: stdout });
	let labeledCount = 0;

	try {
		for (const row of rows) {
			const top = topSuggestedUrl(row.suggested_urls);
			console.log(`\n[${row.id}] site=${row.site_id} (${row.created_at})`);
			console.log(`  dead_url: ${row.dead_url}`);
			console.log(`  top suggestion: ${top ?? "(none)"}`);
			if (row.match_types) console.log(`  match_types: ${row.match_types}`);

			const raw = await rl.question("  Correct? [y/n/s=skip/q=quit]: ");
			const answer = parseLabelAnswer(raw);
			if (answer === null) {
				console.log('  Unrecognized input, treating as "skip".');
				continue;
			}
			if (answer === "quit") break;
			if (answer === "skip") continue;

			const notes = (await rl.question("  Notes (optional): ")).trim();

			await sql.query(
				`UPDATE suggestion_logs
				 SET label = $1, label_notes = $2, labeled_at = NOW(), labeled_by = $3
				 WHERE id = $4`,
				[answer, notes || null, labeledBy, row.id],
			);
			labeledCount++;
		}
	} finally {
		rl.close();
	}

	console.log(`\nDone. Labeled ${labeledCount} row(s).`);
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
	main().catch((err) => {
		console.error("Labeling failed:", err);
		process.exit(1);
	});
}
