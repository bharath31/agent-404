import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const migrationDirectory = dirname(fileURLToPath(import.meta.url));
const DOLLAR_TAG_RE = /^\$[A-Za-z0-9_]*\$/;

export const MIGRATIONS = [
	"0001_init.sql",
	"0002_pgvector.sql",
	"0003_dashboard.sql",
	"0004_trust.sql",
	"0005_scale.sql",
	"0006_site_owner.sql",
	"0007_audit_reports.sql",
	"0008_funnel_events.sql",
	"0009_recovery_events.sql",
	"0010_cloudflare_embeddings.sql",
	"0011_install_probes.sql",
	"0012_login_otp.sql",
	"0013_suggestion_labels.sql",
	"0014_partition_vector_index.sql",
	"0015_suggestion_log_rollups.sql",
	"0016_audit_analysis.sql",
	"0017_next_dashboard_data.sql",
] as const;

export interface MigrationQueryResult {
	rows: Record<string, unknown>[];
	rowCount?: number | null;
}

export interface MigrationSql {
	query(text: string, params?: unknown[]): Promise<MigrationQueryResult>;
	/** Execute a list on one database transaction/session (required for 0014's swap). */
	transaction?(statements: string[]): Promise<MigrationQueryResult[]>;
}

export function splitStatements(text: string): string[] {
	const results: string[] = [];
	let current = "";
	let depth = 0;
	let dollarTag: string | null = null;

	let i = 0;
	while (i < text.length) {
		const char = text[i];

		if (dollarTag) {
			current += char;
			if (char === "$" && text.startsWith(dollarTag, i)) {
				current += dollarTag.slice(1);
				i += dollarTag.length;
				dollarTag = null;
				continue;
			}
			i++;
			continue;
		}

		if (char === "$") {
			const match = DOLLAR_TAG_RE.exec(text.slice(i));
			if (match) {
				dollarTag = match[0];
				current += dollarTag;
				i += dollarTag.length;
				continue;
			}
		}

		if (char === "(") depth++;
		if (char === ")") depth--;
		if (char === ";" && depth === 0) {
			const trimmed = current.trim();
			if (trimmed.length > 0) results.push(trimmed);
			current = "";
			i++;
			continue;
		}

		current += char;
		i++;
	}

	const trimmed = current.trim();
	if (trimmed.length > 0) results.push(trimmed);
	return results;
}

function readMigration(filename: string): { raw: string; statements: string[]; checksum: string } {
	const raw = readFileSync(resolve(migrationDirectory, filename), "utf8");
	const executable = raw.replace(/--.*$/gm, "");
	return {
		raw,
		statements: splitStatements(executable),
		checksum: createHash("sha256").update(raw).digest("hex"),
	};
}

async function ensureLedger(sql: MigrationSql): Promise<void> {
	await sql.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			checksum TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			recognized_legacy BOOLEAN NOT NULL DEFAULT FALSE
		)
	`);
}

async function hasAllColumns(
	sql: MigrationSql,
	table: string,
	columns: string[],
): Promise<boolean> {
	const result = await sql.query(
		`SELECT COUNT(*)::int AS count
		 FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])`,
		[table, columns],
	);
	return Number(result.rows[0]?.count ?? 0) === columns.length;
}

async function hasTables(sql: MigrationSql, tables: string[]): Promise<boolean> {
	const result = await sql.query(
		`SELECT COUNT(*)::int AS count
		 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
			AND c.relkind IN ('r', 'p')`,
		[tables],
	);
	return Number(result.rows[0]?.count ?? 0) === tables.length;
}

/**
 * Existing deployments predate the ledger. Recognize them from durable schema
 * markers, then seed the ledger without re-running destructive legacy DDL.
 */
export async function isLegacyMigrationApplied(
	filename: (typeof MIGRATIONS)[number],
	sql: MigrationSql,
): Promise<boolean> {
	switch (filename.slice(0, 4)) {
		case "0001":
			return hasTables(sql, ["sites", "pages", "suggestion_logs"]);
		case "0002":
			return hasAllColumns(sql, "pages", ["embedding"]);
		case "0003":
			return hasAllColumns(sql, "suggestion_logs", ["scores", "match_types"]);
		case "0004":
			return hasAllColumns(sql, "sites", [
				"public_key",
				"verified_at",
				"verification_token",
				"reclaim_token",
				"reclaim_requested_at",
			]);
		case "0005":
			return (
				(await hasAllColumns(sql, "pages", ["content_hash"])) &&
				(await hasAllColumns(sql, "sites", ["last_cron_at"]))
			);
		case "0006":
			return hasAllColumns(sql, "sites", ["owner_sub"]);
		case "0007":
			return hasTables(sql, ["audit_reports"]);
		case "0008":
			return hasTables(sql, ["funnel_events"]);
		case "0009":
			return hasTables(sql, ["recovery_events"]);
		case "0010": {
			const result = await sql.query(`
				SELECT EXISTS (
					SELECT 1
					FROM pg_attribute a
					JOIN pg_class c ON c.oid = a.attrelid
					JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE n.nspname = 'public' AND c.relname = 'pages'
						AND a.attname = 'embedding' AND NOT a.attisdropped
						AND format_type(a.atttypid, a.atttypmod) = 'vector(768)'
				) AS applied
			`);
			return Boolean(result.rows[0]?.applied);
		}
		case "0011":
			return hasTables(sql, ["install_probes"]);
		case "0012":
			return hasTables(sql, ["login_otp"]);
		case "0013":
			return hasAllColumns(sql, "suggestion_logs", [
				"label",
				"label_notes",
				"labeled_at",
				"labeled_by",
			]);
		case "0014": {
			const result = await sql.query(`
				SELECT EXISTS (
					SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE n.nspname = 'public' AND c.relname = 'pages' AND c.relkind = 'p'
				) AS applied,
				to_regclass('public.pages_new') IS NOT NULL AS pages_new,
				to_regclass('public.pages_old') IS NOT NULL AS pages_old
			`);
			return Boolean(result.rows[0]?.applied) &&
				!result.rows[0]?.pages_new &&
				!result.rows[0]?.pages_old;
		}
		case "0015":
			return hasTables(sql, ["suggestion_rollups"]);
		case "0016":
			return hasAllColumns(sql, "audit_reports", ["analysis"]);
		case "0017": {
			const columnsPresent = await hasAllColumns(sql, "sites", [
				"previous_api_key",
				"previous_api_key_expires_at",
				"previous_public_key",
				"previous_public_key_expires_at",
				"reindex_requested_at",
			]);
			if (!columnsPresent) return false;
			const result = await sql.query(`
				SELECT (
					SELECT COUNT(DISTINCT c.conrelid)::int
					FROM pg_constraint c
					JOIN pg_class t ON t.oid = c.conrelid
					JOIN pg_namespace n ON n.oid = t.relnamespace
					WHERE n.nspname = 'public'
						AND t.relname = ANY($1::text[])
						AND c.contype = 'f'
						AND c.confrelid = 'sites'::regclass
						AND c.confdeltype = 'c'
						AND c.conparentid = 0
				) AS cascade_count,
				to_regclass('public.idx_recovery_events_site_created_id') IS NOT NULL AS activity_index,
				to_regclass('public.idx_pages_site_last_seen_id') IS NOT NULL AS pages_index,
				to_regclass('public.idx_sites_previous_api_key') IS NOT NULL AS previous_api_index,
				to_regclass('public.idx_sites_previous_public_key') IS NOT NULL AS previous_public_index
			`, [["pages", "suggestion_logs", "suggestion_rollups", "recovery_events", "install_probes"]]);
			return Number(result.rows[0]?.cascade_count ?? 0) === 5 &&
				Boolean(result.rows[0]?.activity_index) &&
				Boolean(result.rows[0]?.pages_index) &&
				Boolean(result.rows[0]?.previous_api_index) &&
				Boolean(result.rows[0]?.previous_public_index);
		}
		default:
			return false;
	}
}

async function assertPartitionMigrationCanStart(sql: MigrationSql): Promise<void> {
	const result = await sql.query(`
		SELECT to_regclass('public.pages_new') IS NOT NULL AS pages_new,
			to_regclass('public.pages_old') IS NOT NULL AS pages_old
	`);
	if (result.rows[0]?.pages_new || result.rows[0]?.pages_old) {
		throw new Error(
			"0014 cannot start: pages_new/pages_old exists from a partial partition migration. Reconcile it manually before retrying.",
		);
	}
}

export async function executeMigrationStatements(
	filename: string,
	statements: string[],
	sql: MigrationSql,
	log: (message: string) => void = console.log,
): Promise<void> {
	for (let index = 0; index < statements.length; index++) {
		const statement = statements[index];
		if (/^BEGIN$/i.test(statement.trim())) {
			const commitIndex = statements.findIndex(
				(candidate, candidateIndex) =>
					candidateIndex > index && /^COMMIT$/i.test(candidate.trim()),
			);
			if (commitIndex < 0) throw new Error(`${filename} contains BEGIN without COMMIT`);
			if (!sql.transaction) {
				throw new Error(
					`${filename} requires a session-backed transaction, but the migration client does not provide one.`,
				);
			}
			const transactionalStatements = statements.slice(index + 1, commitIndex);
			for (const transactionalStatement of transactionalStatements) {
				const preview = transactionalStatement.replace(/\s+/g, " ").slice(0, 90);
				log(`  [transaction] ${preview}...`);
			}
			await sql.transaction(transactionalStatements);
			index = commitIndex;
			continue;
		}
		if (/^COMMIT$/i.test(statement.trim())) {
			throw new Error(`${filename} contains COMMIT without BEGIN`);
		}
		const preview = statement.replace(/\s+/g, " ").slice(0, 90);
		log(`  ${preview}...`);
		const result = await sql.query(statement);
		if (/^DELETE\s/i.test(statement) && result.rowCount != null) {
			log(`  cleanup rows: ${result.rowCount}`);
		}
	}
}

export async function runMigrations(
	sql: MigrationSql,
	options: { log?: (message: string) => void } = {},
): Promise<void> {
	const log = options.log ?? console.log;
	await ensureLedger(sql);
	const ledger = await sql.query(`SELECT name, checksum FROM schema_migrations`);
	const applied = new Map(
		ledger.rows.map((row) => [String(row.name), String(row.checksum)]),
	);

	for (const filename of MIGRATIONS) {
		const migration = readMigration(filename);
		const existingChecksum = applied.get(filename);
		if (existingChecksum) {
			if (existingChecksum !== migration.checksum) {
				throw new Error(
					`Migration checksum mismatch for ${filename}; applied migrations must not be edited.`,
				);
			}
			log(`Skipping applied migration: ${filename}`);
			continue;
		}

		if (await isLegacyMigrationApplied(filename, sql)) {
			await sql.query(
				`INSERT INTO schema_migrations (name, checksum, recognized_legacy)
				 VALUES ($1, $2, TRUE) ON CONFLICT (name) DO NOTHING`,
				[filename, migration.checksum],
			);
			log(`Recognized legacy migration: ${filename}`);
			continue;
		}

		if (filename === "0014_partition_vector_index.sql") {
			await assertPartitionMigrationCanStart(sql);
		}

		log(`Running migration: ${filename}`);
		await executeMigrationStatements(filename, migration.statements, sql, log);
		await sql.query(
			`INSERT INTO schema_migrations (name, checksum, recognized_legacy)
			 VALUES ($1, $2, FALSE)`,
			[filename, migration.checksum],
		);
	}
}

async function main(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
	if (!databaseUrl) throw new Error("DATABASE_URL or POSTGRES_URL is required");
	const client = neon(databaseUrl, { fullResults: true });
	const sql: MigrationSql = {
		query: (text, params) => client.query(text, params) as unknown as Promise<MigrationQueryResult>,
		transaction: (statements) =>
			client.transaction(
				(transactionSql) => statements.map((statement) => transactionSql.query(statement)),
				{ fullResults: true },
			) as unknown as Promise<MigrationQueryResult[]>,
	};
	await runMigrations(sql);
	console.log("All migrations complete.");
}

const entrypoint = process.argv[1]
	? pathToFileURL(resolve(process.argv[1])).href
	: "";
if (import.meta.url === entrypoint) {
	main().catch((error) => {
		console.error("Migration failed:", error);
		process.exitCode = 1;
	});
}
