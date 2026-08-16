import { Hono } from "hono";
import { normalizeDomain } from "../domain.js";
import { isBlockedInternalHost } from "../../lib/ssrf-guard.js";
import { probeClaudeBotResponse, type ClaudeBotProbeResult } from "../../engine/claudebot-probe.js";
import { rateLimiter } from "../middleware/rate-limit.js";
import { trackFunnelEvent } from "../../lib/funnel-telemetry.js";

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
	ogImageUrl: string;
}

// In-memory persistent cache for standing audit reports
const auditReports = new Map<string, StandingAuditReport>();
const MAX_SAVED_AUDITS = 5_000;

function generateAuditId(domain: string): string {
	const hash = Math.random().toString(36).substring(2, 10);
	const clean = domain.replace(/[^a-z0-9]/gi, "-").toLowerCase();
	return `audit_${clean}_${hash}`;
}

export function generateAuditOgSvg(report: StandingAuditReport): string {
	const { domain, score, summary, claudeBotProbe } = report;

	let scoreColor = "#EF4444"; // red
	let scoreBg = "rgba(239, 68, 68, 0.15)";
	let statusText = "CRITICAL 404 RISKS";

	if (score >= 75) {
		scoreColor = "#10B981"; // green
		scoreBg = "rgba(16, 185, 129, 0.15)";
		statusText = "AGENT-READY";
	} else if (score >= 40) {
		scoreColor = "#F59E0B"; // amber
		scoreBg = "rgba(245, 158, 11, 0.15)";
		statusText = "DEGRADED RECOVERY";
	}

	const escapeXml = (str: string) =>
		str
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;");

	const safeDomain = escapeXml(domain);

	return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="50%" stop-color="#111827" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="cardGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.05" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.4" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)" />

  <!-- Grid decoration -->
  <g opacity="0.06" stroke="#fff" stroke-width="1">
    <line x1="0" y1="100" x2="1200" y2="100" />
    <line x1="0" y1="200" x2="1200" y2="200" />
    <line x1="0" y1="300" x2="1200" y2="300" />
    <line x1="0" y1="400" x2="1200" y2="400" />
    <line x1="0" y1="500" x2="1200" y2="500" />
    <line x1="200" y1="0" x2="200" y2="630" />
    <line x1="400" y1="0" x2="400" y2="630" />
    <line x1="600" y1="0" x2="600" y2="630" />
    <line x1="800" y1="0" x2="800" y2="630" />
    <line x1="1000" y1="0" x2="1000" y2="630" />
  </g>

  <!-- Header Branding -->
  <g transform="translate(80, 80)">
    <rect width="120" height="34" rx="6" fill="#3B82F6" fill-opacity="0.2" stroke="#3B82F6" stroke-width="1" />
    <text x="60" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#60A5FA" text-anchor="middle" letter-spacing="1">AGENT-404</text>
    <text x="135" y="23" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="500" fill="#9CA3AF">AI Crawler &amp; 404 Recovery Audit</text>
  </g>

  <!-- Main Title -->
  <text x="80" y="180" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="800" fill="#FFFFFF" letter-spacing="-0.5">${safeDomain}</text>

  <!-- Main Card -->
  <rect x="80" y="220" width="1040" height="280" rx="16" fill="#1E293B" fill-opacity="0.7" stroke="#334155" stroke-width="1" filter="url(#shadow)" />

  <!-- Score Circle / Badge -->
  <g transform="translate(140, 260)">
    <circle cx="90" cy="90" r="75" fill="${scoreBg}" stroke="${scoreColor}" stroke-width="6" />
    <text x="90" y="86" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="48" font-weight="900" fill="${scoreColor}" text-anchor="middle">${score}</text>
    <text x="90" y="112" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#9CA3AF" text-anchor="middle">/ 100</text>
    <rect x="25" y="175" width="130" height="26" rx="13" fill="${scoreBg}" stroke="${scoreColor}" stroke-width="1" />
    <text x="90" y="192" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" fill="${scoreColor}" text-anchor="middle" letter-spacing="0.5">${statusText}</text>
  </g>

  <!-- Signals Breakdown List -->
  <g transform="translate(360, 260)" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
    <!-- Item 1: HTTP Status -->
    <g transform="translate(0, 30)">
      <circle cx="12" cy="12" r="10" fill="${claudeBotProbe.status === 404 ? "#10B981" : "#EF4444"}" />
      <text x="12" y="16" font-size="12" font-weight="700" fill="#FFF" text-anchor="middle">${claudeBotProbe.status === 404 ? "✓" : "✗"}</text>
      <text x="35" y="17" font-size="18" font-weight="600" fill="#F3F4F6">HTTP 404 Status: ${claudeBotProbe.status === 404 ? "Clean 404 Response" : "Soft-404 / HTTP " + claudeBotProbe.status}</text>
    </g>

    <!-- Item 2: Link Alternate Header -->
    <g transform="translate(0, 85)">
      <circle cx="12" cy="12" r="10" fill="${summary.linkHeadersConfigured ? "#10B981" : "#EF4444"}" />
      <text x="12" y="16" font-size="12" font-weight="700" fill="#FFF" text-anchor="middle">${summary.linkHeadersConfigured ? "✓" : "✗"}</text>
      <text x="35" y="17" font-size="18" font-weight="600" fill="#F3F4F6">Link Header Recovery: ${summary.linkHeadersConfigured ? "Configured" : "Missing"}</text>
    </g>

    <!-- Item 3: JSON-LD -->
    <g transform="translate(0, 140)">
      <circle cx="12" cy="12" r="10" fill="${summary.jsonLdConfigured ? "#10B981" : "#EF4444"}" />
      <text x="12" y="16" font-size="12" font-weight="700" fill="#FFF" text-anchor="middle">${summary.jsonLdConfigured ? "✓" : "✗"}</text>
      <text x="35" y="17" font-size="18" font-weight="600" fill="#F3F4F6">schema.org ItemList JSON-LD: ${summary.jsonLdConfigured ? "Configured" : "Missing"}</text>
    </g>
  </g>

  <!-- Footer -->
  <g transform="translate(80, 560)">
    <text x="0" y="0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="500" fill="#64748B">agent404.dev · Autonomous 404 Recovery for GPTBot, ClaudeBot &amp; Perplexity</text>
  </g>
</svg>`;
}

const audit = new Hono();

// Rate limit public audit creations
audit.use("/", rateLimiter({ windowMs: 60_000, max: 10 }));
audit.use("/*", rateLimiter({ windowMs: 60_000, max: 30 }));

// Create or run a new standing audit
audit.post("/", async (c) => {
	const body = await c.req.json<{ domain?: string; deadPath?: string }>().catch(() => ({ domain: "", deadPath: "" }));
	const rawDomain = body.domain || "";
	const domain = normalizeDomain(rawDomain);

	if (!domain || isBlockedInternalHost(domain)) {
		return c.json({ error: "Invalid domain format" }, 400);
	}

	const deadPath = body.deadPath || "/docs/non-existent-link";
	trackFunnelEvent("audit_started", domain, { deadPath });
	const probe = await probeClaudeBotResponse(domain, deadPath);

	// Calculate score
	let score = 30; // base score for standard 404
	if (probe.hasLinkHeaders) score += 35;
	if (probe.hasJsonLd) score += 25;
	if (probe.hasSuggestions) score += 10;
	if (probe.verdict === "non_404") score = 15; // penalty for soft-404

	const id = generateAuditId(domain);
	const permalink = `/report/${id}`;
	const ogImageUrl = `/api/audit/${id}/og.svg`;

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
		ogImageUrl,
	};

	if (auditReports.size >= MAX_SAVED_AUDITS) {
		const firstKey = auditReports.keys().next().value;
		if (firstKey) auditReports.delete(firstKey);
	}
	auditReports.set(id, report);
	trackFunnelEvent("audit_completed", domain, { auditId: id, score });

	return c.json(report, 201);
});

// Dynamic OG SVG Image generator for standing audit permalinks (BAT-41)
audit.get("/:id/og.svg", async (c) => {
	const id = c.req.param("id");
	const report = auditReports.get(id);
	if (!report) {
		return c.text("Audit not found", 404);
	}

	const svg = generateAuditOgSvg(report);
	c.header("Content-Type", "image/svg+xml");
	c.header("Cache-Control", "public, max-age=86400");
	return c.body(svg);
});

// Retrieve a standing audit by permalink ID
audit.get("/:id", async (c) => {
	const id = c.req.param("id");
	const report = auditReports.get(id);
	if (!report) {
		return c.json({ error: "Audit report not found or expired" }, 404);
	}
	trackFunnelEvent("report_shared", report.domain, { auditId: id });
	return c.json(report);
});

export { audit, auditReports };
