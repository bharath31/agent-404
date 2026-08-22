import React from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";

type DecisionMetrics = {
	liveInstalls: number;
	totalSites: number;
	recoveryRate: number | null;
	overallFunnelConversion: number | null;
	precision: { labeled: number; correct: number } | null;
};

const INSTALL_GOAL = 1000;
const KILL_RECOVERY_RATE = 0.2;
const KILL_CONVERSION_RATE = 0.02;

const css = String.raw`
*{box-sizing:border-box}html{color-scheme:light dark}body{margin:0;background:#fafafa;color:#111;font-family:Geist,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.top{height:58px;display:flex;align-items:center;padding:0 28px;border-bottom:1px solid #eaeaea;background:#fff}.brand{font:600 14px/1 Geist Mono,ui-monospace,monospace}.brand b{color:#1fa971}.wrap{width:min(960px,calc(100% - 32px));margin:0 auto;padding:54px 0 80px}.crumb{color:#666;font:500 12px/1 Geist Mono,ui-monospace,monospace}h1{margin:16px 0 6px;font-size:28px;letter-spacing:-.04em}.lede{margin:0;color:#666;font-size:14px}.module{margin-top:30px;border:1px solid #eaeaea;border-radius:10px;background:#fff;overflow:hidden}.moduleHeader{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 18px;border-bottom:1px solid #eaeaea}.moduleHeader h2{margin:0;font-size:14px}.trace{color:#666;font:400 11px/1 Geist Mono,ui-monospace,monospace}.trace b{color:#1fa971}.row{display:grid;grid-template-columns:minmax(170px,1fr) minmax(120px,.55fr) minmax(260px,1.7fr);align-items:center;gap:20px;min-height:76px;padding:13px 18px;border-bottom:1px solid #eaeaea}.row:last-child{border:0}.label{font-size:13px;font-weight:550}.value{font:600 22px/1 Geist Mono,ui-monospace,monospace;font-variant-numeric:tabular-nums}.hint{color:#666;font-size:12px;line-height:1.55}.good{color:#1fa971}.bad{color:#c93535}.empty{color:#8f8f8f}.decision{margin-top:20px;padding:18px;border:1px solid #e2bd62;border-radius:10px;background:#fffdf5}.decision strong{display:block;margin-bottom:6px;font:600 12px/1 Geist Mono,ui-monospace,monospace;text-transform:uppercase;letter-spacing:.05em}.decision p{margin:0;color:#666;font-size:13px;line-height:1.6}.verdict{margin-top:10px!important;color:#111!important;font-weight:600!important}@media(max-width:700px){.top{padding:0 16px}.wrap{padding-top:32px}.moduleHeader{align-items:flex-start;flex-direction:column}.row{grid-template-columns:1fr;gap:7px;padding:18px}.hint{max-width:52ch}}@media(prefers-color-scheme:dark){body{background:#000;color:#ededed}.top,.module{background:#0a0a0a;border-color:#2a2a2a}.brand b,.trace b,.good{color:#45d699}.crumb,.lede,.trace,.hint{color:#8f8f8f}.moduleHeader,.row{border-color:#2a2a2a}.bad{color:#ff7770}.empty{color:#666}.decision{border-color:#6b5425;background:#120f08}.decision p{color:#8f8f8f}.verdict{color:#ededed!important}}
`;

function percentage(value: number | null): string {
	return value === null ? "No data" : `${(value * 100).toFixed(1)}%`;
}

function MetricRow({ label, value, hint, state }: { label: string; value: string; hint: string; state?: "good" | "bad" | "empty" }) {
	return <div className="row"><div className="label">{label}</div><div className={`value ${state || ""}`}>{value}</div><div className="hint">{hint}</div></div>;
}

function AdminDocument(metrics: DecisionMetrics) {
	const recoveryState = metrics.recoveryRate === null ? "empty" : metrics.recoveryRate < KILL_RECOVERY_RATE ? "bad" : "good";
	const conversionState = metrics.overallFunnelConversion === null ? "empty" : metrics.overallFunnelConversion < KILL_CONVERSION_RATE ? "bad" : "good";
	const hasDecisionData = metrics.recoveryRate !== null && metrics.overallFunnelConversion !== null;
	const pivot = hasDecisionData && metrics.recoveryRate! < KILL_RECOVERY_RATE && metrics.overallFunnelConversion! < KILL_CONVERSION_RATE;
	const precision = metrics.precision && metrics.precision.labeled > 0
		? metrics.precision.correct / metrics.precision.labeled
		: null;
	return <html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex"/><meta name="color-scheme" content="light dark"/><title>Operator metrics — agent-404</title><style>{css}</style></head><body>
		<header className="top"><span className="brand">agent-<b>404</b> / operator</span></header>
		<main className="wrap"><div className="crumb">Operations / Decision metrics</div><h1>Product signal</h1><p className="lede">The small set of measures that determines whether the hosted recovery loop is working.</p>
			<section className="module"><div className="moduleHeader"><h2>Current decision metrics</h2><span className="trace">404 request → matcher → <b>followed destination</b></span></div>
				<MetricRow label="Live installs" value={`${metrics.liveInstalls.toLocaleString()} / ${INSTALL_GOAL.toLocaleString()}`} hint={`${metrics.totalSites.toLocaleString()} total registered sites; live requires indexing and recent recovery traffic.`}/>
				<MetricRow label="Agent recovery rate" value={percentage(metrics.recoveryRate)} state={recoveryState} hint="Share of suggestions followed within 60 seconds. Decision threshold: 20%."/>
				<MetricRow label="Audit to install" value={percentage(metrics.overallFunnelConversion)} state={conversionState} hint="Verified installations divided by audits started. Decision threshold: 2%."/>
				<MetricRow label="Suggestion precision" value={percentage(precision)} state={precision === null ? "empty" : undefined} hint={metrics.precision ? `${metrics.precision.correct.toLocaleString()} of ${metrics.precision.labeled.toLocaleString()} hand labels were correct.` : "No hand labels yet; report this as no data, not 0%."}/>
			</section>
			<section className="decision"><strong>Week-12 rule</strong><p>If conversion is below 2% and recovery is below 20%, pivot the hosted runtime toward diagnostics.</p><p className="verdict">{!hasDecisionData ? "Not enough data to evaluate." : pivot ? "Both thresholds are below target — pivot review required." : "At least one threshold has signal — continue and monitor."}</p></section>
		</main></body></html>;
}

export function renderAdminMetrics(metrics: DecisionMetrics): string {
	return `<!doctype html>${renderToStaticMarkup(<AdminDocument {...metrics} />)}`;
}
