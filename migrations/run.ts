import { sql } from "@vercel/postgres";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function splitStatements(text: string): string[] {
	const results: string[] = [];
	let current = "";
	let depth = 0;

	for (const char of text) {
		if (char === "(") depth++;
		if (char === ")") depth--;
		if (char === ";" && depth === 0) {
			const trimmed = current.trim();
			if (trimmed.length > 0 && !trimmed.startsWith("--")) {
				results.push(trimmed);
			}
			current = "";
		} else {
			current += char;
		}
	}

	const trimmed = current.trim();
	if (trimmed.length > 0 && !trimmed.startsWith("--")) {
		results.push(trimmed);
	}

	return results;
}

async function run() {
	const raw = readFileSync(resolve(__dirname, "0001_init.sql"), "utf-8");
	// Strip line comments
	const migration = raw.replace(/--.*$/gm, "");
	const statements = splitStatements(migration);

	for (const stmt of statements) {
		const preview = stmt.replace(/\s+/g, " ").slice(0, 70);
		console.log(`Running: ${preview}...`);
		await sql.query(stmt);
	}

	console.log("Migration complete.");
	process.exit(0);
}

run().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
