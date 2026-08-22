import { CANONICAL_ORIGIN } from "../config";
import type { AuditAnalysis, StandingAuditReport } from "../types";

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Shared dark-theme tokens, matching src/views/landing.ts and dashboard.ts. */
const BASE_STYLE = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #09090b;
    --surface: #121215;
    --surface-elevated: #18181d;
    --border: #27272a;
    --border-subtle: #1c1c21;
    --text: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #71717a;
    --accent: #3b82f6;
    --green: #22c55e;
    --amber: #f59e0b;
    --red: #ef4444;
    --mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .container { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.5rem 3rem; }
  nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
  .logo { font-family: var(--mono); font-size: 1rem; font-weight: 700; color: var(--text); }
  .logo span { color: var(--text-muted); }
`;

function verdictTokens(score: number): { color: string; label: string } {
	if (score >= 75) return { color: "var(--green)", label: "AGENT-READY" };
	if (score >= 40) return { color: "var(--amber)", label: "DEGRADED RECOVERY" };
	return { color: "var(--red)", label: "CRITICAL 404 RISKS" };
}

function checkRow(label: string, ok: boolean): string {
	return `<div class="check-row">
    <span class="check-icon ${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"}</span>
    <span>${escapeHtml(label)}</span>
  </div>`;
}

/** Deep-crawl section (BAT-22) — only rendered when the audit was created
 *  with deep:true and the crawl succeeded. */
function siteHealthHtml(analysis: AuditAnalysis | null | undefined): string {
	if (!analysis) return "";
	const broken = analysis.brokenLinks.slice(0, 10);
	const orphans = analysis.orphanPages.slice(0, 10);
	const brokenRows =
		broken.length > 0
			? broken
					.map(
						(l) =>
							`<div class="link-row"><span class="link-url">${escapeHtml(l.sourcePage)}</span><span class="link-arrow">&rarr;</span><span class="link-url link-broken">${escapeHtml(l.targetUrl)}</span></div>`,
					)
					.join("")
			: `<div class="health-empty">None found in the crawled pages.</div>`;
	const orphanRows =
		orphans.length > 0
			? orphans.map((u) => `<div class="link-row"><span class="link-url">${escapeHtml(u)}</span></div>`).join("")
			: `<div class="health-empty">Every crawled page has at least one inbound link.</div>`;
	return `
      <div class="site-health">
        <h2>Site health</h2>
        <div class="health-meta">Deep crawl &middot; ${analysis.pagesAnalyzed} page${analysis.pagesAnalyzed === 1 ? "" : "s"} analyzed &middot; discovered via ${escapeHtml(analysis.source)}</div>
        <div class="health-grid">
          <div class="health-col">
            <div class="health-head">${checkRow(`${analysis.brokenLinks.length} broken internal link${analysis.brokenLinks.length === 1 ? "" : "s"}`, analysis.brokenLinks.length === 0)}</div>
            ${brokenRows}
          </div>
          <div class="health-col">
            <div class="health-head">${checkRow(`${analysis.orphanPages.length} orphan page${analysis.orphanPages.length === 1 ? "" : "s"}`, analysis.orphanPages.length === 0)}</div>
            ${orphanRows}
          </div>
        </div>
        <div class="probe-meta">Lists capped at 10 entries each &middot; full counts above</div>
      </div>`;
}

export function auditReportPageHtml(report: StandingAuditReport): string {
	const { domain, score, summary, claudeBotProbe, createdAt } = report;
	const { color, label } = verdictTokens(score);
	const ogImageAbsUrl = `${CANONICAL_ORIGIN}${report.ogImageUrl}`;
	const permalinkAbsUrl = `${CANONICAL_ORIGIN}${report.permalink}`;
	const title = `${domain} — Agent Readiness Audit (${score}/100)`;
	const description = `${domain} scores ${score}/100 on agent-404's readiness audit: ${label.toLowerCase()}. ${summary.recommendation}`;
	const createdDate = new Date(createdAt).toLocaleString("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	});

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">

  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ogImageAbsUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${escapeHtml(permalinkAbsUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImageAbsUrl)}">

  <style>
    ${BASE_STYLE}
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 1.5rem;
    }
    .card h1 {
      font-size: 1.6rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 0.35rem;
      word-break: break-word;
    }
    .card .timestamp { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.5rem; }
    .score-row { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .score-circle {
      width: 110px;
      height: 110px;
      border-radius: 50%;
      border: 6px solid ${color};
      background: color-mix(in srgb, ${color} 15%, transparent);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .score-circle .num { font-family: var(--mono); font-size: 2rem; font-weight: 900; color: ${color}; line-height: 1; }
    .score-circle .of100 { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem; }
    .verdict-badge {
      display: inline-block;
      font-family: var(--mono);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: ${color};
      background: color-mix(in srgb, ${color} 15%, transparent);
      border: 1px solid ${color};
      border-radius: 999px;
      padding: 0.3rem 0.85rem;
      margin-bottom: 0.6rem;
    }
    .recommendation { color: var(--text-secondary); font-size: 0.95rem; max-width: 480px; }
    .checks { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
    .check-row {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      font-size: 0.92rem;
      padding: 0.75rem 1rem;
      background: var(--surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
    }
    .check-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.35rem;
      height: 1.35rem;
      border-radius: 50%;
      font-size: 0.75rem;
      font-weight: 700;
      flex-shrink: 0;
    }
    .check-icon.ok { background: rgba(34, 197, 94, 0.15); color: var(--green); }
    .check-icon.bad { background: rgba(239, 68, 68, 0.15); color: var(--red); }
    .probe-meta { font-family: var(--mono); font-size: 0.78rem; color: var(--text-muted); margin-top: 1.25rem; }
    .site-health { margin-top: 1.5rem; }
    .site-health h2 {
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin-bottom: 0.35rem;
    }
    .health-meta { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.9rem; }
    .health-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    @media (max-width: 640px) { .health-grid { grid-template-columns: 1fr; } }
    .health-col {
      background: var(--surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .health-col .check-row { padding: 0.4rem 0.6rem; }
    .link-row {
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--text-secondary);
      padding: 0.3rem 0.5rem;
      border-top: 1px solid var(--border-subtle);
      word-break: break-all;
    }
    .link-arrow { color: var(--text-muted); flex-shrink: 0; }
    .link-broken { color: var(--red); }
    .health-empty { font-size: 0.78rem; color: var(--text-muted); padding: 0.25rem 0.5rem; }
    .og-preview { width: 100%; border-radius: 10px; border: 1px solid var(--border); margin-top: 1.5rem; }
    .cta-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      background: var(--accent);
      color: white;
    }
    .btn:hover { text-decoration: none; opacity: 0.9; }
    .btn-secondary { background: var(--surface-elevated); color: var(--text); border: 1px solid var(--border); }
    footer { text-align: center; font-size: 0.8rem; color: var(--text-muted); margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <div class="logo">agent<span>-</span>404</div>
      <a href="/demo">Run your own audit &rarr;</a>
    </nav>

    <div class="card">
      <h1>${escapeHtml(domain)}</h1>
      <div class="timestamp">Audited ${escapeHtml(createdDate)}</div>

      <div class="score-row">
        <div class="score-circle">
          <div class="num">${score}</div>
          <div class="of100">/ 100</div>
        </div>
        <div>
          <div class="verdict-badge">${escapeHtml(label)}</div>
          <p class="recommendation">${escapeHtml(summary.recommendation)}</p>
        </div>
      </div>

      <div class="checks">
        ${checkRow("HTTP 404 status returned cleanly (no soft-404)", summary.crawlerAccessible)}
        ${checkRow("Link alternate header recovery configured", summary.linkHeadersConfigured)}
        ${checkRow("schema.org ItemList JSON-LD configured", summary.jsonLdConfigured)}
      </div>

      ${siteHealthHtml(report.analysis)}

      <div class="probe-meta">
        Probed as ClaudeBot &middot; target status ${claudeBotProbe.status} &middot; verdict: ${escapeHtml(claudeBotProbe.verdict)}
      </div>

      <img class="og-preview" src="${escapeHtml(report.ogImageUrl)}" alt="Agent readiness audit summary for ${escapeHtml(domain)}" width="1200" height="630">
    </div>

    <div class="cta-row">
      <a href="/demo" class="btn">Audit your own site &rarr;</a>
      <a href="/" class="btn btn-secondary">What is agent-404?</a>
    </div>

    <footer>agent404.dev &middot; Autonomous 404 Recovery for GPTBot, ClaudeBot &amp; Perplexity</footer>
  </div>
</body>
</html>
`;
}

export function auditReportNotFoundHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Audit report not found — agent-404</title>
  <meta name="description" content="This standing audit report does not exist or has expired.">
  <style>
    ${BASE_STYLE}
    .empty {
      text-align: center;
      padding: 4rem 1rem;
    }
    .empty h1 { font-size: 1.75rem; font-weight: 800; margin-bottom: 0.75rem; }
    .empty p { color: var(--text-secondary); margin-bottom: 1.75rem; }
    .btn {
      display: inline-flex;
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      background: var(--accent);
      color: white;
    }
    .btn:hover { text-decoration: none; opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <div class="logo">agent<span>-</span>404</div>
      <a href="/demo">Run your own audit &rarr;</a>
    </nav>
    <div class="empty">
      <h1>Audit report not found</h1>
      <p>This standing audit report doesn't exist, or the link is broken. Run a fresh audit instead.</p>
      <a href="/demo" class="btn">Run a new audit &rarr;</a>
    </div>
  </div>
</body>
</html>
`;
}
