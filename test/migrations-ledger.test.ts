import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	executeMigrationStatements,
	isLegacyMigrationApplied,
	MIGRATIONS,
	splitStatements,
	type MigrationSql,
} from "../migrations/run.js";

describe("migration ledger", () => {
	it("includes the formerly omitted embedding migration before the partition swap", () => {
		expect(MIGRATIONS).toContain("0010_cloudflare_embeddings.sql");
		expect(MIGRATIONS.indexOf("0010_cloudflare_embeddings.sql")).toBeLessThan(
			MIGRATIONS.indexOf("0014_partition_vector_index.sql"),
		);
		expect(MIGRATIONS.at(-1)).toBe("0017_next_dashboard_data.sql");
	});

	it("keeps a dollar-quoted cleanup block intact as one statement", () => {
		const statements = splitStatements(`
			DO $body$
			BEGIN
				PERFORM 1;
				PERFORM 2;
			END
			$body$;
			CREATE TABLE after_block (id integer);
		`);
		expect(statements).toHaveLength(2);
		expect(statements[0]).toContain("PERFORM 2;");
		expect(statements[1]).toContain("CREATE TABLE after_block");
	});

	it("recognizes a partitioned pages table so non-idempotent 0014 is never replayed", async () => {
		const sql: MigrationSql = {
			async query() {
				return { rows: [{ applied: true }] };
			},
		};
		expect(await isLegacyMigrationApplied("0014_partition_vector_index.sql", sql)).toBe(true);
	});

	it("executes an explicit BEGIN/COMMIT block through one real transaction", async () => {
		const direct: string[] = [];
		const transactions: string[][] = [];
		const sql: MigrationSql = {
			async query(text) {
				direct.push(text);
				return { rows: [] };
			},
			async transaction(statements) {
				transactions.push(statements);
				return statements.map(() => ({ rows: [] }));
			},
		};
		await executeMigrationStatements(
			"swap.sql",
			["CREATE TABLE before_swap (id int)", "BEGIN", "LOCK TABLE pages", "ALTER TABLE pages RENAME TO pages_old", "COMMIT", "DROP TABLE pages_old"],
			sql,
			() => {},
		);
		expect(direct).toEqual(["CREATE TABLE before_swap (id int)", "DROP TABLE pages_old"]);
		expect(transactions).toEqual([["LOCK TABLE pages", "ALTER TABLE pages RENAME TO pages_old"]]);
	});
});

describe("0017 next dashboard data migration", () => {
	const sql = readFileSync(
		resolve(process.cwd(), "migrations/0017_next_dashboard_data.sql"),
		"utf8",
	);

	it("cleans all site-owned orphan tables and installs cascading ownership", () => {
		for (const table of [
			"pages",
			"suggestion_logs",
			"suggestion_rollups",
			"recovery_events",
			"install_probes",
		]) {
			expect(sql).toContain(`DELETE FROM ${table}`);
			expect(sql).toContain(`ALTER TABLE ${table}`);
		}
		expect(sql.match(/ON DELETE CASCADE/g)).toHaveLength(5);
	});

	it("adds separate previous-key deadlines and stable cursor indexes", () => {
		expect(sql).toContain("previous_api_key_expires_at");
		expect(sql).toContain("previous_public_key_expires_at");
		expect(sql).toContain("(site_id, created_at DESC, id DESC)");
		expect(sql).toContain("(site_id, last_seen DESC, id DESC)");
	});
});
