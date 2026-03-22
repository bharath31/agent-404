import type { DashboardData } from "./types.js";

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

export function dashboardHtml(data: DashboardData): string {
	const recentRows = data.recentLogs
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

	const mq = data.matchQuality;
	const total =
		mq.matchTypeDistribution.moved +
		mq.matchTypeDistribution.similar +
		mq.matchTypeDistribution.related;
	const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard \u2014 ${escapeHtml(data.domain)} \u2014 agent-404</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0a0a0b; --surface: #141416; --border: #27272a;
  --text: #fafafa; --text-secondary: #a1a1aa;
  --accent: #3b82f6; --green: #22c55e; --orange: #f97316;
}
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; max-width: 1000px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
.subtitle { color: var(--text-secondary); margin-bottom: 2rem; }
.stats { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.5rem; flex: 1; min-width: 150px; }
.stat-card .label { color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
h2 { font-size: 1.1rem; margin-bottom: 1rem; margin-top: 2rem; }
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
</style>
</head>
<body>
<h1>${escapeHtml(data.domain)}</h1>
<p class="subtitle">agent-404 dashboard</p>

<div class="stats">
  <div class="stat-card"><div class="label">Indexed Pages</div><div class="value">${data.pageCount}</div></div>
  <div class="stat-card"><div class="label">Suggestions Served</div><div class="value">${data.suggestionsServed}</div></div>
  <div class="stat-card"><div class="label">Last 24h</div><div class="value">${mq.last24h}</div></div>
  <div class="stat-card"><div class="label">Last 7d</div><div class="value">${mq.last7d}</div></div>
  <div class="stat-card"><div class="label">Last 30d</div><div class="value">${mq.last30d}</div></div>
</div>

<h2>Match Type Distribution</h2>
<div class="dist">
  <div class="dist-item"><span class="dist-dot dot-moved"></span> Moved ${pct(mq.matchTypeDistribution.moved)}%</div>
  <div class="dist-item"><span class="dist-dot dot-similar"></span> Similar ${pct(mq.matchTypeDistribution.similar)}%</div>
  <div class="dist-item"><span class="dist-dot dot-related"></span> Related ${pct(mq.matchTypeDistribution.related)}%</div>
</div>

<h2>Recent Activity</h2>
${
	data.recentLogs.length > 0
		? `<table>
<thead><tr><th>Dead URL</th><th>Top Suggestion</th><th>Score</th><th>Time</th></tr></thead>
<tbody>${recentRows}</tbody>
</table>`
		: `<div class="empty">No suggestion logs yet.</div>`
}
</body>
</html>`;
}
