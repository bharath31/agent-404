import { CANONICAL_SCRIPT_URL } from "./config.js";
import type { DashboardData, DashboardSiteData } from "./types.js";

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function truncate(str: string, max: number): string {
	return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
}

function snippetHtml(site: Pick<DashboardSiteData, "id" | "apiKey">): string {
	const src = escapeHtml(CANONICAL_SCRIPT_URL);
	const id = escapeHtml(site.id);
	const key = escapeHtml(site.apiKey);
	return `&lt;script
  src="${src}"
  data-site-id="${id}"
  data-api-key="${key}"
  defer
&gt;&lt;/script&gt;`;
}

function siteSection(site: DashboardSiteData): string {
	const mq = site.matchQuality;
	const total =
		mq.matchTypeDistribution.moved +
		mq.matchTypeDistribution.similar +
		mq.matchTypeDistribution.related;
	const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

	const recentRows = site.recentLogs
		.map((log) => {
			const topSuggestion = log.suggestedUrls[0] || "\u2014";
			const scores = log.scores ? JSON.parse(log.scores) : [];
			const topScore = scores[0] != null ? (scores[0] as number).toFixed(3) : "\u2014";
			const time = new Date(log.createdAt).toLocaleString("en-US", {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
			return `<tr>
				<td title="${escapeHtml(log.deadUrl)}">${escapeHtml(truncate(log.deadUrl, 60))}</td>
				<td title="${escapeHtml(topSuggestion)}">${escapeHtml(truncate(topSuggestion, 60))}</td>
				<td>${topScore}</td>
				<td>${time}</td>
			</tr>`;
		})
		.join("\n");

	const warning =
		site.pageCount === 0
			? `<div class="warning" role="alert">
  <strong>No beacons received</strong>
  This site has not indexed any pages yet. The install is not working — an empty page count is not a quiet success.
  Confirm the snippet uses <code>https://www.agent404.dev</code> (not the apex; redirects break CORS preflight),
  then open a live page and check the browser console for <code>[agent-404]</code> warnings.
  You can also call <code>GET /api/install/status</code> with your API key.
</div>`
			: "";

	return `
<section class="site-block">
<h2>${escapeHtml(site.domain)}</h2>
${warning}
<div class="code-block">
  <div class="label">Script tag</div>
  <pre class="snippet">${snippetHtml(site)}</pre>
  <button type="button" class="copy-btn" data-copy="${escapeHtml(`<script
  src="${CANONICAL_SCRIPT_URL}"
  data-site-id="${site.id}"
  data-api-key="${site.apiKey}"
  defer
></script>`)}">Copy</button>
</div>
<div class="stats">
  <div class="stat-card"><div class="label">Indexed Pages</div><div class="value">${site.pageCount}</div></div>
  <div class="stat-card"><div class="label">Suggestions Served</div><div class="value">${site.suggestionsServed}</div></div>
  <div class="stat-card"><div class="label">Last 24h</div><div class="value">${mq.last24h}</div></div>
  <div class="stat-card"><div class="label">Last 7d</div><div class="value">${mq.last7d}</div></div>
  <div class="stat-card"><div class="label">Last 30d</div><div class="value">${mq.last30d}</div></div>
</div>
<h3>Match Type Distribution</h3>
<div class="dist">
  <div class="dist-item"><span class="dist-dot dot-moved"></span> Moved ${pct(mq.matchTypeDistribution.moved)}%</div>
  <div class="dist-item"><span class="dist-dot dot-similar"></span> Similar ${pct(mq.matchTypeDistribution.similar)}%</div>
  <div class="dist-item"><span class="dist-dot dot-related"></span> Related ${pct(mq.matchTypeDistribution.related)}%</div>
</div>
<h3>Recent Activity</h3>
${
	site.recentLogs.length > 0
		? `<table>
<thead><tr><th>Dead URL</th><th>Top Suggestion</th><th>Score</th><th>Time</th></tr></thead>
<tbody>${recentRows}</tbody>
</table>`
		: `<div class="empty">No suggestion logs yet.</div>`
}
</section>`;
}

export function dashboardHtml(data: DashboardData): string {
	const notice = data.notice
		? `<div class="notice" role="alert">${escapeHtml(data.notice)}</div>`
		: "";

	const claim = data.claimDomain
		? `<div class="claim" role="form">
  <strong>Link ${escapeHtml(data.claimDomain)}</strong>
  <p>This domain is already indexed. Paste the API key from your existing script tag to add it to this account.</p>
  <form method="post" action="/api/sites/claim" id="claim-form">
    <input type="hidden" name="domain" value="${escapeHtml(data.claimDomain)}" />
    <input type="text" id="claim-key" placeholder="key_…" autocomplete="off" />
    <button type="submit">Link site</button>
  </form>
  <p id="claim-error" class="form-error" hidden></p>
</div>`
		: "";

	const sitesHtml =
		data.sites.length > 0
			? data.sites.map(siteSection).join("\n")
			: `<div class="empty">No sites yet. Enter a domain on the <a href="/">home page</a> to generate a script tag.</div>`;

	const emailLine = data.email
		? `<p class="subtitle">${escapeHtml(data.email)}</p>`
		: `<p class="subtitle">agent-404 dashboard</p>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard — agent-404</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0a0a0b; --surface: #141416; --border: #27272a;
  --text: #fafafa; --text-secondary: #a1a1aa;
  --accent: #3b82f6; --green: #22c55e; --orange: #f97316; --red: #ef4444;
}
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; max-width: 1000px; margin: 0 auto; }
nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; font-size: 0.875rem; }
nav a { color: var(--text-secondary); text-decoration: none; margin-left: 1rem; }
nav a:hover { color: var(--text); }
h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
h2 { font-size: 1.2rem; margin-bottom: 1rem; }
h3 { font-size: 1rem; margin: 1.5rem 0 0.75rem; }
.subtitle { color: var(--text-secondary); margin-bottom: 1.5rem; }
.stats { display: flex; gap: 1rem; margin: 1.25rem 0; flex-wrap: wrap; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.5rem; flex: 1; min-width: 150px; }
.stat-card .label { color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
th, td { text-align: left; padding: 0.6rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
th { color: var(--text-secondary); font-weight: 500; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
tr:last-child td { border-bottom: none; }
.dist { display: flex; gap: 1.5rem; margin-top: 0.5rem; }
.dist-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
.dist-dot { width: 10px; height: 10px; border-radius: 50%; }
.dot-moved { background: var(--accent); }
.dot-similar { background: var(--green); }
.dot-related { background: var(--orange); }
.empty { color: var(--text-secondary); padding: 2rem; text-align: center; }
.warning, .notice, .claim {
  background: color-mix(in srgb, var(--orange) 18%, #0a0a0a);
  border: 1px solid var(--orange);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
  line-height: 1.5;
}
.notice { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, #0a0a0a); }
.warning strong, .claim strong { display: block; margin-bottom: 0.25rem; color: var(--orange); }
.warning code { font-size: 0.85em; }
.site-block { margin-bottom: 3rem; }
.code-block { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
.code-block .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin-bottom: 0.75rem; }
.snippet { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85rem; line-height: 1.6; white-space: pre-wrap; }
.copy-btn { position: absolute; top: 0.75rem; right: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text-secondary); padding: 0.3rem 0.5rem; font-size: 0.7rem; cursor: pointer; }
.copy-btn:hover { color: var(--text); }
.form-error { color: var(--red); font-size: 0.85rem; margin-top: 0.5rem; }
#claim-form { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
#claim-form input { flex: 1; padding: 0.5rem 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; color: var(--text); }
#claim-form button { padding: 0.5rem 1rem; background: var(--accent); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<nav>
  <a href="/" style="margin-left:0">agent-404</a>
  <div>
    <a href="/">Home</a>
    <a href="/auth/logout">Log out</a>
  </div>
</nav>
<h1>Dashboard</h1>
${emailLine}
${notice}
${claim}
${sitesHtml}
<script>
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy') || '';
      navigator.clipboard.writeText(text).then(() => {
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = prev; }, 1600);
      });
    });
  });
  const claimForm = document.getElementById('claim-form');
  if (claimForm) {
    claimForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const domain = claimForm.querySelector('input[name="domain"]').value;
      const apiKey = document.getElementById('claim-key').value.trim();
      const errEl = document.getElementById('claim-error');
      errEl.hidden = true;
      const res = await fetch('/api/sites/claim', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, apiKey })
      });
      if (res.ok) {
        window.location = '/dashboard';
        return;
      }
      const body = await res.json().catch(() => ({}));
      errEl.textContent = body.error || 'Could not link this site.';
      errEl.hidden = false;
    });
  }
</script>
</body>
</html>`;
}
