import { probeClaudeBotResponse, type ClaudeBotProbeResult } from "../engine/claudebot-probe.js";
import { discoverDemoPages, type DemoPage } from "../engine/discovery.js";
import { analyzeSite } from "../engine/analyzer.js";
import {
	predictAndEvaluateHallucinations,
	type HallucinationAuditSummary,
} from "../engine/hallucination-predictor.js";
import { normalizeDomain } from "../api/domain.js";
import { isBlockedInternalHost } from "../lib/ssrf-guard.js";
import type { AnalysisReport } from "../types.js";
import {
	renderBanner,
	renderScoreBadge,
	renderSectionHeader,
	renderCheckItem,
	renderDiffBox,
	c,
} from "./format.js";

export interface AuditCliOptions {
	domain: string;
	deadPath?: string;
	crawlLimit?: number;
	json?: boolean;
	ci?: boolean;
	minScore?: number;
	noColor?: boolean;
	quiet?: boolean;
}

export interface CliAuditResult {
	domain: string;
	targetDeadUrl: string;
	score: number;
	status: "pass" | "fail";
	probe: ClaudeBotProbeResult;
	pagesDiscovered: number;
	discoverySource: string;
	brokenLinksCount: number;
	orphanPagesCount: number;
	hallucinationSummary: HallucinationAuditSummary;
	analysis?: AnalysisReport;
	recommendations: string[];
}

/**
 * Run a full agent-readiness audit from the CLI (BAT-46).
 */
export async function runCliAudit(options: AuditCliOptions): Promise<CliAuditResult> {
	const rawDomain = options.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
	const domain = normalizeDomain(rawDomain);

	if (!domain || isBlockedInternalHost(domain)) {
		throw new Error(`Invalid or disallowed domain: ${options.domain}`);
	}

	const deadPath = options.deadPath || "/docs/non-existent-probe";
	const crawlLimit = options.crawlLimit ?? 30;
	const minScore = options.minScore ?? 70;

	// 1. Probe ClaudeBot / AI Crawler response on dead path
	const probe = await probeClaudeBotResponse(domain, deadPath);

	// 2. Discover indexed pages
	let discoveredPages: DemoPage[] = [];
	let discoverySource = "none";
	try {
		const discovery = await discoverDemoPages(domain, deadPath);
		discoveredPages = discovery.pages.slice(0, crawlLimit);
		discoverySource = discovery.source;
	} catch {
		// fallback to domain home
		discoveredPages = [{ url: `https://${domain}`, title: domain }];
	}

	if (discoveredPages.length === 0) {
		discoveredPages = [{ url: `https://${domain}`, title: domain }];
	}

	// 3. Analyze internal broken links and orphans
	let analysis: AnalysisReport | undefined;
	try {
		analysis = await analyzeSite(
			discoveredPages.map((p) => ({ url: p.url, title: p.title })),
			domain,
		);
	} catch {
		// best-effort analysis
	}

	// 4. Run AI Hallucination stress test
	const hallucinationSummary = predictAndEvaluateHallucinations(
		discoveredPages,
		domain,
		30,
	);

	// 5. Compute Comprehensive Agent Readiness Score (0-100)
	let score = 0;

	// (A) 404 Status Code Cleanliness (25 pts)
	if (probe.status === 404) {
		score += 25;
	} else if (probe.status >= 200 && probe.status < 400) {
		score += 5; // Soft-404 penalty
	}

	// (B) HTTP Recovery Signals (35 pts)
	if (probe.hasLinkHeaders) score += 20;
	if (probe.hasJsonLd) score += 15;

	// (C) Hallucination Recovery Coverage (25 pts)
	score += Math.round(hallucinationSummary.recoveryRate * 25);

	// (D) Broken Link Health (15 pts)
	const brokenCount = analysis?.brokenLinks.length ?? 0;
	if (brokenCount === 0) {
		score += 15;
	} else if (brokenCount < 3) {
		score += 10;
	} else if (brokenCount < 8) {
		score += 5;
	}

	const pass = score >= minScore && probe.status === 404;

	const recommendations: string[] = [];
	if (!probe.hasLinkHeaders) {
		recommendations.push("Add Link alternate response headers to 404 responses for header-only agents.");
	}
	if (!probe.hasJsonLd) {
		recommendations.push("Include schema.org/ItemList JSON-LD in the 404 HTML body with ranked suggestions.");
	}
	if (probe.status !== 404) {
		recommendations.push("Ensure dead URLs return a true HTTP 404 status instead of 200/soft-404.");
	}
	if (brokenCount > 0) {
		recommendations.push(`Fix ${brokenCount} internal broken link(s) discovered during sitemap crawl.`);
	}
	if (hallucinationSummary.recoveryRate < 0.8) {
		recommendations.push("Enhance route indexing and sitemap coverage to recover hallucinated version/plural paths.");
	}

	return {
		domain,
		targetDeadUrl: probe.targetUrl,
		score,
		status: pass ? "pass" : "fail",
		probe,
		pagesDiscovered: discoveredPages.length,
		discoverySource,
		brokenLinksCount: brokenCount,
		orphanPagesCount: analysis?.orphanPages.length ?? 0,
		hallucinationSummary,
		analysis,
		recommendations,
	};
}

/**
 * Print the formatted audit report to stdout.
 */
export function printCliAuditReport(result: CliAuditResult, noColor = false): void {
	console.log(renderBanner(noColor));
	console.log(`  ${c.bold("Domain:", noColor)} ${c.cyan(result.domain, noColor)}`);
	console.log(`  ${c.bold("Dead Path Probed:", noColor)} ${c.gray(result.targetDeadUrl, noColor)}`);
	console.log(`  ${c.bold("Pages Discovered:", noColor)} ${result.pagesDiscovered} (${result.discoverySource})`);

	console.log(renderScoreBadge(result.score, noColor));

	// 1. Crawler Response Comparison
	console.log(renderSectionHeader("AI Crawler Response Probe (ClaudeBot)", noColor));
	console.log(renderDiffBox(result.probe.comparison.current, result.probe.comparison.withAgent404, noColor));

	// 2. Checks Breakdown
	console.log(renderSectionHeader("Readiness Checklist", noColor));
	console.log(renderCheckItem(result.probe.status === 404, "HTTP 404 Status Code", `Returned HTTP ${result.probe.status}`, noColor));
	console.log(renderCheckItem(result.probe.hasLinkHeaders, "Link Alternate Headers", result.probe.hasLinkHeaders ? "Present" : "Missing", noColor));
	console.log(renderCheckItem(result.probe.hasJsonLd, "Schema.org ItemList JSON-LD", result.probe.hasJsonLd ? "Present" : "Missing", noColor));
	console.log(
		renderCheckItem(
			result.hallucinationSummary.recoveryRate >= 0.7,
			`AI Hallucination Resilience (${(result.hallucinationSummary.recoveryRate * 100).toFixed(0)}% recovery rate)`,
			`${result.hallucinationSummary.recoveredCount}/${result.hallucinationSummary.totalTested} simulated LLM queries recovered`,
			noColor,
		),
	);
	console.log(
		renderCheckItem(
			result.brokenLinksCount === 0,
			`Internal Link Health (${result.brokenLinksCount} broken internal links)`,
			result.brokenLinksCount === 0 ? "No broken internal links found" : `${result.brokenLinksCount} broken links detected`,
			noColor,
		),
	);

	// 3. Hallucination Simulation Details
	if (result.hallucinationSummary.predictions.length > 0) {
		console.log(renderSectionHeader("Simulated AI Agent Queries (Sample)", noColor));
		for (const pred of result.hallucinationSummary.predictions.slice(0, 5)) {
			const icon = pred.recovered ? c.green("✓", noColor) : c.red("✗", noColor);
			const target = pred.topSuggestion?.url ? c.cyan(pred.topSuggestion.url, noColor) : c.gray("(none)", noColor);
			const scorePct = pred.topSuggestion ? ` [${(pred.topSuggestion.score * 100).toFixed(0)}% match]` : "";
			console.log(`  ${icon} ${c.bold(pred.hallucinatedPath, noColor)} → ${target}${scorePct} ${c.gray(`(${pred.mutationType})`, noColor)}`);
		}
	}

	// 4. Recommendations / Action Items
	if (result.recommendations.length > 0) {
		console.log(renderSectionHeader("Recommended Actions", noColor));
		for (const rec of result.recommendations) {
			console.log(`  ${c.yellow("→", noColor)} ${rec}`);
		}
	}

	// 5. Quick install command
	console.log(renderSectionHeader("Quick Install", noColor));
	console.log(`  ${c.bold("Next.js:", noColor)}   ${c.cyan("npm i @agent-404/next", noColor)}`);
	console.log(`  ${c.bold("Express:", noColor)}   ${c.cyan("npm i @agent-404/express", noColor)}`);
	console.log(`  ${c.bold("Workers:", noColor)}   ${c.cyan("npm i @agent-404/cloudflare", noColor)}`);
	console.log(`  ${c.bold("Snippet:", noColor)}   ${c.cyan(`<script src="https://agent404.dev/agent-404.min.js" data-site-id="${result.domain}" defer></script>`, noColor)}\n`);
}
