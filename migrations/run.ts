import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "", {
	fullResults: true,
});
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DOLLAR_TAG_RE = /^\$[A-Za-z0-9_]*\$/;

function splitStatements(text: string): string[] {
	const results: string[] = [];
	let current = "";
	let depth = 0;
	// Tracks an open dollar-quoted string (e.g. the body of a `DO $$ ... $$`
	// block). Semicolons and parens inside it must NOT affect statement
	// splitting — PL/pgSQL bodies routinely contain their own `;`-terminated
	// statements.
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
			if (trimmed.length > 0 && !trimmed.startsWith("--")) {
				results.push(trimmed);
			}
			current = "";
			i++;
			continue;
		}

		current += char;
		i++;
	}

	const trimmed = current.trim();
	if (trimmed.length > 0 && !trimmed.startsWith("--")) {
		results.push(trimmed);
	}

	return results;
}

async function runFile(filename: string) {
	const raw = readFileSync(resolve(__dirname, filename), "utf-8");
	// Strip line comments
	const migration = raw.replace(/--.*$/gm, "");
	const statements = splitStatements(migration);

	for (const stmt of statements) {
		const preview = stmt.replace(/\s+/g, " ").slice(0, 70);
		console.log(`Running: ${preview}...`);
		await sql.query(stmt);
	}
}

async function run() {
	const migrations = [
		"0001_init.sql",
		"0002_pgvector.sql",
		"0003_dashboard.sql",
		"0004_trust.sql",
		"0005_scale.sql",
		"0006_site_owner.sql",
		"0007_audit_reports.sql",
		"0008_funnel_events.sql",
		"0009_recovery_events.sql",
		"0011_install_probes.sql",
		"0012_login_otp.sql",
		"0013_suggestion_labels.sql",
		"0014_partition_vector_index.sql",
		"0015_suggestion_log_rollups.sql",
		"0016_audit_analysis.sql",
	];
	for (const file of migrations) {
		console.log(`\nRunning migration: ${file}`);
		await runFile(file);
	}

	console.log("\nAll migrations complete.");
	process.exit(0);
}

run().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
