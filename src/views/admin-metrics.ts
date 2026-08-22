/**
 * BAT-26 / Theme 7 gate: one operator page with the four decision numbers —
 * live installs vs the 1,000 goal, agent recovery rate, audit→install
 * conversion, and hand-labeled suggestion precision — with the week-12 kill
 * criteria written out next to the data they judge.
 *
 * Kill criteria (from BAT-26, set before the data arrived): if audit→install
 * conversion is under 2% AND recovery rate is under 20% at week 12, the
 * hosted runtime is the wrong shape and the product pivots to diagnostics.
 */

export const KILL_CONVERSION_RATE = 0.02;
export const KILL_RECOVERY_RATE = 0.2;
export const INSTALL_GOAL = 1000;

export interface DecisionMetrics {
	liveInstalls: number;
	totalSites: number;
	recoveryRate: number | null;
	overallFunnelConversion: number | null;
	precision: { labeled: number; correct: number } | null;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** The week-12 pivot rule, as a pure function so it is testable. */
export function pivotVerdict(
	conversionRate: number | null,
	recoveryRate: number | null,
): "pivot" | "continue" | "insufficient-data" {
	if (conversionRate === null || recoveryRate === null) return "insufficient-data";
	return conversionRate < KILL_CONVERSION_RATE && recoveryRate < KILL_RECOVERY_RATE
		? "pivot"
		: "continue";
}

type Tone = "pass" | "watch" | "fail" | "neutral";

function pct(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function metricCard(opts: {
	label: string;
	value: string;
	hint: string;
	tone?: Tone;
}): string {
	const toneClass = opts.tone && opts.tone !== "neutral" ? ` tone-${opts.tone}` : "";
	return `
    <div class="metric${toneClass}">
      <div class="metric-label">${escapeHtml(opts.label)}</div>
      <div class="metric-value">${escapeHtml(opts.value)}</div>
      <div class="metric-hint">${opts.hint}</div>
    </div>`;
}

export function adminMetricsPageHtml(m: DecisionMetrics): string {
	const progress =
		m.liveInstalls > 0 ? Math.min(100, Math.round((m.liveInstalls / INSTALL_GOAL) * 100)) : 0;

	const verdict = pivotVerdict(m.overallFunnelConversion, m.recoveryRate);
	const verdictCopy =
		verdict === "pivot"
			? "Both kill thresholds breached — week-12 review should trigger the diagnostic-product pivot."
			: verdict === "continue"
				? "At least one kill threshold is being met — the middleware shape still has signal."
				: "Not enough data yet to evaluate the kill criteria.";

	const recoveryTone: Tone =
		m.recoveryRate === null ? "neutral" : m.recoveryRate < KILL_RECOVERY_RATE ? "fail" : "pass";
	const conversionTone: Tone =
		m.overallFunnelConversion === null
			? "neutral"
			: m.overallFunnelConversion < KILL_CONVERSION_RATE
				? "fail"
				: "pass";

	const precisionValue =
		m.precision && m.precision.labeled > 0
			? pct(m.precision.correct / m.precision.labeled)
			: "\u2014";
	const precisionHint =
		m.precision && m.precision.labeled > 0
			? `${m.precision.correct.toLocaleString()} of ${m.precision.labeled.toLocaleString()} hand-labeled suggestions were correct`
			: "No hand labels yet — run scripts/label-suggestions.ts weekly (BAT-63)";

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Decision metrics — agent-404</title>
  <meta name="robots" content="noindex">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #09090b; --surface: #121215; --border: #26262b;
      --text: #f4f4f5; --text-secondary: #a1a1aa; --text-muted: #6b6b74;
      --emerald: #10b981; --rose: #f43f5e; --amber: #f59e0b;
      --font-sans: 'Inter', -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }
    body {
      font-family: var(--font-sans); background: var(--bg); color: var(--text);
      min-height: 100vh; line-height: 1.5; padding: 2.5rem 1.25rem;
    }
    .wrap { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; }
    .lede { font-size: 0.85rem; color: var(--text-secondary); margin: 0.35rem 0 1.75rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0.9rem; }
    .metric {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 1.15rem 1.3rem;
    }
    .metric-label { font-family: var(--font-mono); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
    .metric-value { font-size: 2rem; font-weight: 800; letter-spacing: -0.03em; margin: 0.35rem 0 0.2rem; }
    .metric-hint { font-size: 0.76rem; color: var(--text-muted); }
    .metric.tone-pass .metric-value { color: var(--emerald); }
    .metric.tone-fail .metric-value { color: var(--rose); }
    .bar { height: 6px; border-radius: 3px; background: #1e1e23; margin-top: 0.7rem; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--emerald); border-radius: 3px; }
    .kill-box {
      margin-top: 1.4rem; background: var(--surface); border: 1px solid var(--border);
      border-left: 3px solid var(--amber); border-radius: 12px; padding: 1.1rem 1.3rem;
    }
    .kill-box h2 { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.45rem; }
    .kill-box p { font-size: 0.82rem; color: var(--text-secondary); }
    .verdict { margin-top: 0.7rem; font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600; }
    .verdict.pivot { color: var(--rose); }
    .verdict.continue { color: var(--emerald); }
    .verdict.insufficient-data { color: var(--amber); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Decision metrics</h1>
    <p class="lede">Theme 7 gate — the four numbers that decide whether agent-404 stays a middleware product, on one page.</p>

    <div class="grid">
      ${metricCard({
				label: "Live installs",
				value: `${m.liveInstalls.toLocaleString()} / ${INSTALL_GOAL.toLocaleString()}`,
				hint: `${m.totalSites.toLocaleString()} registered sites · indexed + served a suggestion in the last 7 days`,
			})}
      ${metricCard({
				label: "Progress to goal",
				value: `${progress}%`,
				hint: "BAT-62 counts verified installs, not registrations",
			})}
      ${metricCard({
				label: "Agent recovery rate",
				value: m.recoveryRate === null ? "\u2014" : pct(m.recoveryRate),
				hint: `Served suggestions an agent followed within 60s · kill line ${pct(KILL_RECOVERY_RATE)} (BAT-61)`,
				tone: recoveryTone,
			})}
      ${metricCard({
				label: "Audit \u2192 install conversion",
				value: m.overallFunnelConversion === null ? "\u2014" : pct(m.overallFunnelConversion),
				hint: `Verified installs / audits started · kill line ${pct(KILL_CONVERSION_RATE)} (BAT-42)`,
				tone: conversionTone,
			})}
      ${metricCard({
				label: "Suggestion precision",
				value: precisionValue,
				hint: precisionHint,
			})}
    </div>

    <div class="kill-box">
      <h2>Week-12 kill criteria &mdash; written before the data arrived</h2>
      <p>If audit&rarr;install conversion is under ${pct(KILL_CONVERSION_RATE)} AND recovery rate is under ${pct(KILL_RECOVERY_RATE)}, the hosted runtime is the wrong shape: the value is in the audit and analyzer &mdash; a diagnostic product, not middleware. That is a pivot worth taking, not a failure.</p>
      <div class="verdict ${verdict}">${escapeHtml(verdictCopy)}</div>
    </div>
  </div>
</body>
</html>`;
}
