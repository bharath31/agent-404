import { Hono } from "hono";
import { normalizeDomain } from "../domain.js";
import { isBlockedInternalHost } from "../../lib/ssrf-guard.js";
import { probeClaudeBotResponse, type ClaudeBotProbeResult } from "../../engine/claudebot-probe.js";
import { rateLimiter } from "../middleware/rate-limit.js";

export interface StandingAuditReport {
	id: string;
	domain: string;
	createdAt: string;
	score: number; // 0 - 100 Agent Readiness Score
	claudeBotProbe: ClaudeBotProbeResult;
	summary: {
		status: "critical" | "warning" | "good";
		recommendation: string;
		crawlerAccessible: boolean;
		linkHeadersConfigured: boolean;
		jsonLdConfigured: boolean;
	};
	permalink: string;
}

// In-memory persistent cache for standing audit reports
const auditReports = new Map<string, StandingAuditReport>();
const MAX_SAVED_AUDITS = 5_000;

function generateAuditId(domain: string): string {
	const hash = Math.random().toString(36).substring(2, 10);
	const clean = domain.replace(/[^a-z0-9]/gi, "-").toLowerCase();
	return `audit_${clean}_${hash}`;
}

const audit = new Hono();

// Rate limit public audit creations
audit.use("/", rateLimiter({ windowMs: 60_000, max: 10 }));
audit.use("/*", rateLimiter({ windowMs: 60_000, max: 30 }));

// Create or run a new standing audit
audit.post("/", async (c) => {
	const body = await c.req.json<{ domain?: string; deadPath?: string }>().catch(() => ({ domain: "" }));
	const rawDomain = body.domain || "";
	const domain = normalizeDomain(rawDomain);

	if (!domain || isBlockedInternalHost(domain)) {
		return c.json({ error: "Invalid domain format" }, 400);
	}

	const deadPath = body.deadPath || "/docs/non-existent-link";
	const probe = await probeClaudeBotResponse(domain, deadPath);

	// Calculate score
	let score = 30; // base score for standard 404
	if (probe.hasLinkHeaders) score += 35;
	if (probe.hasJsonLd) score += 25;
	if (probe.hasSuggestions) score += 10;
	if (probe.verdict === "non_404") score = 15; // penalty for soft-404

	const id = generateAuditId(domain);
	const permalink = `/demo?audit=${id}`;

	const report: StandingAuditReport = {
		id,
		domain,
		createdAt: new Date().toISOString(),
		score,
		claudeBotProbe: probe,
		summary: {
			status: score >= 75 ? "good" : score >= 40 ? "warning" : "critical",
			recommendation:
				score < 50
					? "Install agent-404 middleware to return Link alternate headers and schema.org JSON-LD to AI crawlers."
					: "Your 404 responses provide structured recovery signals.",
			crawlerAccessible: probe.status === 404,
			linkHeadersConfigured: probe.hasLinkHeaders,
			jsonLdConfigured: probe.hasJsonLd,
		},
		permalink,
	};

	if (auditReports.size >= MAX_SAVED_AUDITS) {
		const firstKey = auditReports.keys().next().value;
		if (firstKey) auditReports.delete(firstKey);
	}
	auditReports.set(id, report);

	return c.json(report, 201);
});

// Retrieve a standing audit by permalink ID
audit.get("/:id", async (c) => {
	const id = c.req.param("id");
	const report = auditReports.get(id);
	if (!report) {
		return c.json({ error: "Audit report not found or expired" }, 404);
	}
	return c.json(report);
});

export { audit, auditReports };
