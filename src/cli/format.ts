export interface AuditFormatOptions {
	noColor?: boolean;
}

export const c = {
	reset: (text: string, noColor = false) => (noColor ? text : `\x1b[0m${text}\x1b[0m`),
	bold: (text: string, noColor = false) => (noColor ? text : `\x1b[1m${text}\x1b[22m`),
	dim: (text: string, noColor = false) => (noColor ? text : `\x1b[2m${text}\x1b[22m`),
	green: (text: string, noColor = false) => (noColor ? text : `\x1b[32m${text}\x1b[39m`),
	yellow: (text: string, noColor = false) => (noColor ? text : `\x1b[33m${text}\x1b[39m`),
	red: (text: string, noColor = false) => (noColor ? text : `\x1b[31m${text}\x1b[39m`),
	cyan: (text: string, noColor = false) => (noColor ? text : `\x1b[36m${text}\x1b[39m`),
	magenta: (text: string, noColor = false) => (noColor ? text : `\x1b[35m${text}\x1b[39m`),
	gray: (text: string, noColor = false) => (noColor ? text : `\x1b[90m${text}\x1b[39m`),
	bgGreen: (text: string, noColor = false) => (noColor ? text : `\x1b[42m\x1b[30m${text}\x1b[0m`),
	bgYellow: (text: string, noColor = false) => (noColor ? text : `\x1b[43m\x1b[30m${text}\x1b[0m`),
	bgRed: (text: string, noColor = false) => (noColor ? text : `\x1b[41m\x1b[37m${text}\x1b[0m`),
};

export function renderBanner(noColor = false): string {
	const title = c.bold(c.cyan("agent-404 audit", noColor), noColor);
	const subtitle = c.gray("— Make 404 pages agent-friendly for AI crawlers & LLMs", noColor);
	return `\n${title} ${subtitle}\n`;
}

export function renderScoreBadge(score: number, noColor = false): string {
	let badge: string;
	let label: string;
	if (score >= 80) {
		badge = c.bgGreen(`  ${score}/100  `, noColor);
		label = c.green("Agent-Ready (Structured recovery signals present)", noColor);
	} else if (score >= 50) {
		badge = c.bgYellow(`  ${score}/100  `, noColor);
		label = c.yellow("Degraded (Missing Link headers or JSON-LD)", noColor);
	} else {
		badge = c.bgRed(`  ${score}/100  `, noColor);
		label = c.red("Critical (Bare 404 / crawlers get no recovery data)", noColor);
	}
	return `\n  ${c.bold("Agent Readiness Score:", noColor)} ${badge} ${label}\n`;
}

export function renderSectionHeader(title: string, noColor = false): string {
	return `\n${c.bold(c.cyan(`── ${title} ──`, noColor), noColor)}\n`;
}

export function renderCheckItem(pass: boolean, text: string, details?: string, noColor = false): string {
	const icon = pass ? c.green("✓", noColor) : c.red("✗", noColor);
	const primary = pass ? text : c.bold(text, noColor);
	const sub = details ? `\n    ${c.gray(details, noColor)}` : "";
	return `  ${icon} ${primary}${sub}`;
}

export function renderDiffBox(
	current: { status: number; recoverySupported: boolean; headersSnippet?: Record<string, string> },
	withAgent404: { status: number; linkHeader: string; jsonLdType: string },
	noColor = false,
): string {
	const lines: string[] = [];
	lines.push(`  ${c.bold("Today's Crawler View (ClaudeBot / GPTBot):", noColor)}`);
	lines.push(`    HTTP Status: ${current.status === 404 ? c.yellow("404 Not Found", noColor) : c.red(`HTTP ${current.status}`, noColor)}`);
	lines.push(`    Recovery Link Header: ${current.headersSnippet?.link ? c.green(current.headersSnippet.link, noColor) : c.red("(none — crawler abandons path)", noColor)}`);
	lines.push(`    Schema.org JSON-LD: ${current.recoverySupported ? c.green("Found", noColor) : c.red("Missing", noColor)}`);

	lines.push(`\n  ${c.bold("With agent-404:", noColor)}`);
	lines.push(`    HTTP Status: ${c.green("404 Not Found", noColor)}`);
	lines.push(`    Recovery Link Header: ${c.green(withAgent404.linkHeader, noColor)}`);
	lines.push(`    JSON-LD: ${c.green(`<script type="application/ld+json"> {"@type": "${withAgent404.jsonLdType}"} </script>`, noColor)}`);
	return lines.join("\n");
}
