import { runCliAudit, printCliAuditReport, type AuditCliOptions } from "./audit";
import { c, renderBanner } from "./format";

const VERSION = "0.1.0";

function printHelp(): void {
	console.log(renderBanner());
	console.log(`Usage:
  npx agent-404 audit <domain-or-url> [options]
  npx agent-404 --help
  npx agent-404 --version

Commands:
  audit <domain>        Run an agent-readiness and 404 recovery audit on a live domain

Options:
  --dead-path <path>    Dead URL path to probe (default: /docs/non-existent-probe)
  --crawl-limit <n>     Max pages to crawl for sitemap discovery (default: 30)
  --ci                  Exit with non-zero code if score < min-score (useful for CI)
  --min-score <n>       Minimum acceptable score in CI mode (default: 70)
  --json                Output raw JSON report instead of formatted terminal UI
  --no-color            Disable ANSI terminal colors
  -h, --help            Show this help message
  -v, --version         Show version

Examples:
  npx agent-404 audit example.com
  npx agent-404 audit stripe.com --ci --min-score 75
  npx agent-404 audit https://docs.github.com --json
`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
	if (argv.length === 0 || argv.includes("-h") || argv.includes("--help") || argv[0] === "help") {
		printHelp();
		return 0;
	}

	if (argv.includes("-v") || argv.includes("--version") || argv[0] === "version") {
		console.log(`agent-404 v${VERSION}`);
		return 0;
	}

	const command = argv[0];
	let domainArg = "";

	if (command === "audit") {
		domainArg = argv[1] || "";
	} else if (!command.startsWith("-")) {
		domainArg = command;
	}

	if (!domainArg || domainArg.startsWith("-")) {
		console.error(c.red("Error: Please specify a domain to audit. (e.g. npx agent-404 audit example.com)\n"));
		printHelp();
		return 1;
	}

	const noColor = argv.includes("--no-color");
	const json = argv.includes("--json");
	const ci = argv.includes("--ci");

	let deadPath: string | undefined;
	const deadPathIdx = argv.indexOf("--dead-path");
	if (deadPathIdx !== -1 && argv[deadPathIdx + 1]) {
		deadPath = argv[deadPathIdx + 1];
	}

	let minScore = 70;
	const minScoreIdx = argv.indexOf("--min-score");
	if (minScoreIdx !== -1 && argv[minScoreIdx + 1]) {
		const parsed = parseInt(argv[minScoreIdx + 1], 10);
		if (!Number.isNaN(parsed)) minScore = parsed;
	}

	let crawlLimit = 30;
	const crawlLimitIdx = argv.indexOf("--crawl-limit");
	if (crawlLimitIdx !== -1 && argv[crawlLimitIdx + 1]) {
		const parsed = parseInt(argv[crawlLimitIdx + 1], 10);
		if (!Number.isNaN(parsed)) crawlLimit = parsed;
	}

	const options: AuditCliOptions = {
		domain: domainArg,
		deadPath,
		crawlLimit,
		json,
		ci,
		minScore,
		noColor,
	};

	try {
		if (!json) {
			console.log(c.gray(`\nAuditing ${domainArg} for AI agent readiness...`, noColor));
		}

		const result = await runCliAudit(options);

		if (json) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			printCliAuditReport(result, noColor);
		}

		if (ci && result.score < minScore) {
			if (!json) {
				console.error(
					c.red(`\nCI Gate Failed: Agent Readiness Score (${result.score}) is below minimum threshold (${minScore}).\n`, noColor),
				);
			}
			return 1;
		}

		return 0;
	} catch (err: any) {
		if (json) {
			console.log(JSON.stringify({ error: err?.message || "Audit failed" }, null, 2));
		} else {
			console.error(c.red(`\nAudit failed: ${err?.message || err}\n`, noColor));
		}
		return 1;
	}
}
