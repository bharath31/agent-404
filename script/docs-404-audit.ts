/**
 * docs-404-audit.ts — crawl-infrastructure tooling for BAT-44
 * ("Publish the top-1,000 docs sites 404 study").
 *
 * Scope note: this script is ONLY the audit tooling. It does not run the
 * actual 1,000-site study, and it does not produce the writeup — those are
 * separate, manual follow-up work. `script/docs-sites.txt` ships with a
 * small illustrative seed list (~25 well-known docs sites); swap in the
 * real top-1000 domain list before running the study for real.
 *
 * For each domain in the input list, this requests a deliberately
 * nonexistent path to trigger a 404 and inspects the response for signals
 * of "agent-friendly" recovery data — a `Link` header, JSON-LD structured
 * data, or a script tag that looks like 404-recovery tooling. Most target
 * sites won't use agent-404 itself, so the checks are generic heuristics,
 * not agent-404-specific fingerprints. The interesting number this produces
 * is the fraction of sites serving a completely bare 404.
 *
 * Usage:
 *   npx tsx script/docs-404-audit.ts [input-file] [output-file]
 *
 * Defaults: input `script/docs-sites.txt`, output `docs-404-audit.json`
 * (JSON) and `docs-404-audit.csv` (CSV) written alongside it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FETCH_TIMEOUT_MS = 10_000;
const REQUEST_DELAY_MS = 500; // delay between requests within a worker
const CONCURRENCY = 4; // max in-flight requests across the whole run
const USER_AGENT =
	"agent-404-docs-audit/1.0 (+https://github.com/bharath31/agent-404; research crawl for BAT-44, checks whether documentation sites serve agent-friendly 404 pages; contact via repo issues)";

interface AuditResult {
	domain: string;
	url: string;
	status: number | null;
	ok: boolean;
	error: string | null;
	has_link_header: boolean;
	has_json_ld: boolean;
	has_agent_404_script: boolean;
	has_structured_data: boolean;
	bare_404: boolean;
}

function randomSuffix(): string {
	return Math.random().toString(36).slice(2, 10);
}

/**
 * Detect a `Link` header carrying alternate/recovery-style suggestions
 * (e.g. `Link: <...>; rel="alternate"`), rather than any unrelated Link
 * header a site might send (preload, canonical, etc).
 */
function hasRecoveryLinkHeader(linkHeader: string | null): boolean {
	if (!linkHeader) return false;
	return /rel="?alternate"?/i.test(linkHeader);
}

/** Detect JSON-LD structured data anywhere in the body. */
function hasJsonLd(body: string): boolean {
	return /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(body);
}

/**
 * Detect a script tag that looks like generic 404-recovery tooling — not
 * just agent-404 itself. Looks for script src/inline content referencing
 * common naming patterns for this kind of tool.
 */
function hasAgent404LikeScript(body: string): boolean {
	return /<script[^>]*\bsrc=["'][^"']*(agent-404|404-recovery|smart-404|404-suggest)[^"']*["']/i.test(
		body,
	);
}

async function fetchWithTimeout(url: string): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		return await fetch(url, {
			headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
			signal: controller.signal,
			redirect: "follow",
		});
	} finally {
		clearTimeout(timeout);
	}
}

async function auditDomain(domain: string): Promise<AuditResult> {
	const trimmed = domain.trim();
	const path = `/agent-404-nonexistent-check-${randomSuffix()}`;
	const url = `https://${trimmed}${path}`;

	const base: AuditResult = {
		domain: trimmed,
		url,
		status: null,
		ok: false,
		error: null,
		has_link_header: false,
		has_json_ld: false,
		has_agent_404_script: false,
		has_structured_data: false,
		bare_404: true,
	};

	try {
		const resp = await fetchWithTimeout(url);
		base.status = resp.status;
		base.ok = true;

		const linkHeader = resp.headers.get("link");
		base.has_link_header = hasRecoveryLinkHeader(linkHeader);

		// Only inspect the body for text-ish responses; skip binaries.
		const contentType = resp.headers.get("content-type") || "";
		if (contentType.includes("html") || contentType.includes("json") || contentType === "") {
			const body = await resp.text();
			base.has_json_ld = hasJsonLd(body);
			base.has_agent_404_script = hasAgent404LikeScript(body);
		}

		base.has_structured_data = base.has_link_header || base.has_json_ld || base.has_agent_404_script;
		base.bare_404 = !base.has_structured_data;
	} catch (err: any) {
		base.error = err?.name === "AbortError" ? "timeout" : err?.message || "unknown error";
		// A failed request (DNS error, timeout, connection refused) is neither
		// confirmed bare nor confirmed structured — flag it as unknown by
		// leaving bare_404 false and ok false, distinguishable via `error`.
		base.bare_404 = false;
	}

	return base;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run `audit` over `domains` with a concurrency cap and a delay between
 * requests issued by each worker, so the run never hammers any single
 * target site or fans out unboundedly.
 */
async function runWithConcurrency(domains: string[], concurrency: number): Promise<AuditResult[]> {
	const results: AuditResult[] = new Array(domains.length);
	let next = 0;

	async function worker() {
		while (true) {
			const i = next++;
			if (i >= domains.length) return;
			results[i] = await auditDomain(domains[i]);
			console.error(
				`[${i + 1}/${domains.length}] ${domains[i]} -> ${results[i].status ?? "ERR"} ${
					results[i].error ? `(${results[i].error})` : results[i].bare_404 ? "(bare)" : "(structured)"
				}`,
			);
			await sleep(REQUEST_DELAY_MS);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, worker));
	return results;
}

function toCsv(results: AuditResult[]): string {
	const header = [
		"domain",
		"url",
		"status",
		"ok",
		"error",
		"has_link_header",
		"has_json_ld",
		"has_agent_404_script",
		"has_structured_data",
		"bare_404",
	];
	const escape = (v: unknown) => {
		const s = v === null || v === undefined ? "" : String(v);
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const rows = results.map((r) => header.map((h) => escape((r as any)[h])).join(","));
	return [header.join(","), ...rows].join("\n");
}

function loadDomains(inputPath: string): string[] {
	const raw = readFileSync(inputPath, "utf-8");
	return raw
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));
}

async function main() {
	const inputArg = process.argv[2] || resolve(__dirname, "docs-sites.txt");
	const outputArg = process.argv[3] || resolve(process.cwd(), "docs-404-audit.json");

	const domains = loadDomains(inputArg);
	if (domains.length === 0) {
		console.error(`No domains found in ${inputArg}`);
		process.exit(1);
	}

	console.error(`Auditing ${domains.length} domain(s) from ${inputArg}...`);
	const results = await runWithConcurrency(domains, CONCURRENCY);

	const jsonOut = outputArg.endsWith(".csv")
		? outputArg.replace(/\.csv$/, ".json")
		: outputArg;
	const csvOut = extname(jsonOut) === ".json" ? jsonOut.replace(/\.json$/, ".csv") : `${jsonOut}.csv`;

	writeFileSync(jsonOut, JSON.stringify(results, null, 2));
	writeFileSync(csvOut, toCsv(results));

	const bareCount = results.filter((r) => r.bare_404).length;
	const errorCount = results.filter((r) => r.error).length;
	console.error(
		`\nDone. ${results.length} sites audited, ${bareCount} bare 404s, ${errorCount} failed requests.`,
	);
	console.error(`Wrote ${jsonOut} and ${csvOut}`);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
