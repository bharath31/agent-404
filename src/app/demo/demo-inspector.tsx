"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import type { StandingAuditReport, Suggestion } from "@/types";
import styles from "./demo.module.css";

type DemoSuggestion = Suggestion & { description: string; signals: [number, number, number] };
type Scenario = {
	label: string;
	reason: string;
	deadUrl: string;
	suggestions: DemoSuggestion[];
};

const scenarios: Scenario[] = [
	{
		label: "Auth0 · renamed feature",
		reason: "ACUL documentation moved into Advanced Customizations",
		deadUrl: "https://auth0.com/docs/customize/login-pages/acul",
		suggestions: [
			{
				url: "https://auth0.com/docs/customize/login-pages/advanced-customizations",
				title: "Advanced Customizations for Universal Login",
				description: "ACUL, page templates, and custom Universal Login experiences.",
				score: 0.964,
				matchType: "moved",
				signals: [91, 97, 100],
			},
			{
				url: "https://auth0.com/docs/customize/login-pages",
				title: "Customize Login Pages",
				description: "Choose and configure the login experience for your application.",
				score: 0.782,
				matchType: "similar",
				signals: [78, 81, 72],
			},
		],
	},
	{
		label: "Stripe · path typo",
		reason: "The route uses singular payment instead of payments",
		deadUrl: "https://docs.stripe.com/payment/checkout",
		suggestions: [
			{
				url: "https://docs.stripe.com/payments/checkout",
				title: "Stripe Checkout",
				description: "Accept payments with a prebuilt Checkout page.",
				score: 0.981,
				matchType: "moved",
				signals: [96, 98, 100],
			},
			{
				url: "https://docs.stripe.com/payments",
				title: "Payments",
				description: "Build payment flows across web and mobile.",
				score: 0.71,
				matchType: "related",
				signals: [74, 69, 68],
			},
		],
	},
	{
		label: "Next.js · restructure",
		reason: "Static export guidance moved into App Router guides",
		deadUrl: "https://nextjs.org/docs/app/building-your-application/deploying/static-html-export",
		suggestions: [
			{
				url: "https://nextjs.org/docs/app/guides/static-exports",
				title: "Static Exports",
				description: "Configure and deploy a fully static Next.js application.",
				score: 0.924,
				matchType: "moved",
				signals: [84, 92, 100],
			},
		],
	},
	{
		label: "Vercel · endpoint rename",
		reason: "Edge and Serverless Functions were consolidated",
		deadUrl: "https://vercel.com/docs/edge-functions/overview",
		suggestions: [
			{
				url: "https://vercel.com/docs/functions",
				title: "Vercel Functions",
				description: "Run server-side code without managing infrastructure.",
				score: 0.889,
				matchType: "moved",
				signals: [76, 91, 100],
			},
		],
	},
];

type InspectorTab = "suggestions" | "headers" | "jsonld" | "trace";

function normalizeUrl(value: string): URL | null {
	try {
		const withProtocol = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
		const url = new URL(withProtocol);
		return url.hostname.includes(".") ? url : null;
	} catch {
		return null;
	}
}

function auditSuggestions(report: StandingAuditReport): DemoSuggestion[] {
	return [
		{
			url: `https://${report.domain}/docs/latest`,
			title: `${report.domain} documentation`,
			description: report.summary.recommendation,
			score: Math.max(0.2, report.score / 100),
			matchType: report.score >= 75 ? "moved" : report.score >= 40 ? "similar" : "related",
			signals: [report.score, report.summary.linkHeadersConfigured ? 100 : 0, report.summary.jsonLdConfigured ? 100 : 0],
		},
	];
}

export function DemoInspector() {
	const [scenarioIndex, setScenarioIndex] = useState(0);
	const [deadUrl, setDeadUrl] = useState(scenarios[0].deadUrl);
	const [reason, setReason] = useState(scenarios[0].reason);
	const [suggestions, setSuggestions] = useState<DemoSuggestion[]>(scenarios[0].suggestions);
	const [tab, setTab] = useState<InspectorTab>("suggestions");
	const [audit, setAudit] = useState<StandingAuditReport | null>(null);
	const [loading, setLoading] = useState(false);
	const [deepLoading, setDeepLoading] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	const best = suggestions[0];
	const linkHeader = best ? `<${best.url}>; rel="alternate"` : "—";
	const jsonLd = useMemo(
		() =>
			JSON.stringify(
				{
					"@context": "https://schema.org",
					"@type": "ItemList",
					name: "Suggested alternatives",
					itemListElement: suggestions.map((suggestion, index) => ({
						"@type": "ListItem",
						position: index + 1,
						url: suggestion.url,
						name: suggestion.title,
					})),
				},
				null,
				2,
			),
		[suggestions],
	);

	useEffect(() => {
		const auditId = new URLSearchParams(window.location.search).get("audit");
		if (!auditId) return;
		setLoading(true);
		fetch(`/api/audit/${encodeURIComponent(auditId)}`)
			.then(async (response) => {
				if (!response.ok) throw new Error("This audit report could not be loaded.");
				return (await response.json()) as StandingAuditReport;
			})
			.then((report) => loadAudit(report, `https://${report.domain}/docs/non-existent-link`))
			.catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Audit unavailable."))
			.finally(() => setLoading(false));
	}, []);

	function chooseScenario(index: number) {
		const scenario = scenarios[index];
		setScenarioIndex(index);
		setDeadUrl(scenario.deadUrl);
		setReason(scenario.reason);
		setSuggestions(scenario.suggestions);
		setAudit(null);
		setError("");
		setTab("suggestions");
	}

	function loadAudit(report: StandingAuditReport, requestedUrl: string) {
		setAudit(report);
		setDeadUrl(requestedUrl);
		setReason(`Live ClaudeBot probe · ${report.claudeBotProbe.verdict}`);
		setSuggestions(auditSuggestions(report));
		setScenarioIndex(-1);
		setTab("suggestions");
	}

	async function inspect(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");
		const data = new FormData(event.currentTarget);
		const url = normalizeUrl(String(data.get("url") || ""));
		if (!url) {
			setError("Enter a valid public URL, including the domain and broken path.");
			return;
		}
		const presetIndex = scenarios.findIndex((scenario) => scenario.deadUrl === url.href.replace(/\/$/, ""));
		if (presetIndex >= 0) {
			chooseScenario(presetIndex);
			return;
		}
		setLoading(true);
		try {
			const response = await fetch("/api/audit", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ domain: url.hostname, deadPath: `${url.pathname}${url.search}` }),
			});
			const body = (await response.json()) as StandingAuditReport | { error?: string };
			if (!response.ok || !("id" in body)) {
				throw new Error("error" in body && body.error ? body.error : "The live probe could not complete.");
			}
			loadAudit(body, url.href);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "The live probe could not complete.");
		} finally {
			setLoading(false);
		}
	}

	async function runDeepAudit() {
		if (!audit) return;
		const target = normalizeUrl(deadUrl);
		if (!target) return;
		setDeepLoading(true);
		setNotice("");
		try {
			const response = await fetch("/api/audit", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ domain: audit.domain, deadPath: target.pathname, deep: true }),
			});
			const report = (await response.json()) as StandingAuditReport;
			if (!response.ok || !report.id) throw new Error("Deep crawl unavailable.");
			loadAudit(report, deadUrl);
			setNotice(report.analysis ? "Full site audit complete." : "Probe complete; the sitemap could not be crawled.");
		} catch (cause) {
			setNotice(cause instanceof Error ? cause.message : "Deep crawl unavailable.");
		} finally {
			setDeepLoading(false);
		}
	}

	async function copy(text: string, message: string) {
		await navigator.clipboard.writeText(text);
		setNotice(message);
		window.setTimeout(() => setNotice(""), 1800);
	}

	const headerEvidence = `HTTP/1.1 404 Not Found\nLink: ${linkHeader}\nX-Agent-404-Match: ${best?.matchType ?? "none"}\nX-Agent-404-Score: ${best?.score.toFixed(3) ?? "0.000"}`;
	const tabs: { id: InspectorTab; label: string }[] = [
		{ id: "suggestions", label: "Ranked destinations" },
		{ id: "headers", label: "Response headers" },
		{ id: "jsonld", label: "JSON-LD" },
		{ id: "trace", label: "Crawler trace" },
	];

	return (
		<div className={styles.inspector} aria-busy={loading}>
			<aside className={styles.scenarioRail}>
				<div className={styles.railHeading}>
					<span>Known moves</span>
					<small>{scenarios.length} fixtures</small>
				</div>
				{scenarios.map((scenario, index) => (
					<button
						key={scenario.deadUrl}
						type="button"
						className={scenarioIndex === index ? styles.activeScenario : undefined}
						onClick={() => chooseScenario(index)}
					>
						<span>{scenario.label}</span>
						<code>{new URL(scenario.deadUrl).pathname}</code>
					</button>
				))}
				<div className={styles.railFoot}>
					<span className={styles.signalDot} /> Preset results run locally
				</div>
			</aside>

			<section className={styles.workspace}>
				<form className={styles.urlBar} onSubmit={inspect}>
					<label htmlFor="inspect-url">Broken URL</label>
					<input id="inspect-url" name="url" defaultValue={deadUrl} key={deadUrl} spellCheck={false} />
					<button type="submit" disabled={loading}>
						{loading ? "Probing…" : "Run inspection"}
					</button>
				</form>
				{error ? (
					<div className={styles.error} role="alert">
						<strong>Inspection stopped</strong>
						<span>{error}</span>
					</div>
				) : null}

				<div className={styles.requestSummary}>
					<div>
						<span className={styles.status}>404</span>
						<code>{deadUrl}</code>
					</div>
					<p>{reason}</p>
				</div>

				{audit ? (
					<section className={styles.auditCard} aria-label="Agent readiness audit">
						<div className={styles.auditScore} data-tone={audit.summary.status}>
							<strong>{audit.score}</strong>
							<span>/ 100</span>
						</div>
						<div className={styles.auditCopy}>
							<span>Live readiness probe</span>
							<strong>{audit.summary.recommendation}</strong>
							<ul>
								<li data-ok={audit.summary.crawlerAccessible}>Clean 404</li>
								<li data-ok={audit.summary.linkHeadersConfigured}>Link header</li>
								<li data-ok={audit.summary.jsonLdConfigured}>JSON-LD</li>
							</ul>
						</div>
						<div className={styles.auditActions}>
							<button type="button" onClick={() => copy(`${window.location.origin}${audit.permalink}`, "Standing audit link copied.")}>
								Copy report link
							</button>
							<button type="button" onClick={runDeepAudit} disabled={deepLoading}>
								{deepLoading ? "Crawling…" : "Run sitemap crawl"}
							</button>
						</div>
					</section>
				) : null}

				<div className={styles.tabs} role="tablist" aria-label="Recovery evidence">
					{tabs.map((item) => (
						<button
							key={item.id}
							type="button"
							role="tab"
							aria-selected={tab === item.id}
							onClick={() => setTab(item.id)}
						>
							{item.label}
						</button>
					))}
				</div>

				<div className={styles.panel} role="tabpanel">
					{tab === "suggestions" ? (
						<div className={styles.suggestionList}>
							{suggestions.length ? (
								suggestions.map((suggestion, index) => (
									<article key={suggestion.url}>
										<div className={styles.rank}>{String(index + 1).padStart(2, "0")}</div>
										<div className={styles.suggestionMain}>
											<div>
												<a href={suggestion.url} target="_blank" rel="noreferrer">
													{suggestion.title} <span aria-hidden="true">↗</span>
												</a>
												<span data-match={suggestion.matchType}>{suggestion.matchType}</span>
											</div>
											<code>{suggestion.url}</code>
											<p>{suggestion.description}</p>
										</div>
										<div className={styles.confidence}>
											<strong>{Math.round(suggestion.score * 100)}%</strong>
											<span>confidence</span>
										</div>
										<div className={styles.signalBars} aria-label="Match signal strengths">
											{suggestion.signals.map((value, signalIndex) => (
												<span key={signalIndex} style={{ "--signal-value": `${value}%` } as CSSProperties} />
											))}
										</div>
									</article>
								))
							) : (
								<div className={styles.empty}>No suitable destination was found.</div>
							)}
						</div>
					) : null}
					{tab === "headers" ? (
						<EvidenceBlock value={headerEvidence} onCopy={() => copy(headerEvidence, "Headers copied.")} />
					) : null}
					{tab === "jsonld" ? <EvidenceBlock value={jsonLd} onCopy={() => copy(jsonLd, "JSON-LD copied.")} /> : null}
					{tab === "trace" ? <Trace deadUrl={deadUrl} best={best} /> : null}
				</div>
				<p className={styles.notice} role="status" aria-live="polite">
					{notice}
				</p>
			</section>
		</div>
	);
}

function EvidenceBlock({ value, onCopy }: { value: string; onCopy: () => void }) {
	return (
		<div className={styles.evidenceBlock}>
			<button type="button" onClick={onCopy}>
				Copy
			</button>
			<pre tabIndex={0}>
				<code>{value}</code>
			</pre>
		</div>
	);
}

function Trace({ deadUrl, best }: { deadUrl: string; best?: DemoSuggestion }) {
	const steps = [
		{ label: "404 request", detail: new URL(deadUrl).pathname, state: "complete" },
		{ label: "Matcher", detail: best ? `${Math.round(best.score * 100)}% ${best.matchType}` : "no match", state: best ? "complete" : "failed" },
		{ label: "Link / JSON-LD", detail: best ? "evidence attached" : "not attached", state: best ? "complete" : "failed" },
		{ label: "Followed destination", detail: best ? new URL(best.url).pathname : "no destination", state: best ? "complete" : "failed" },
	];
	return (
		<ol className={styles.trace}>
			{steps.map((step, index) => (
				<li key={step.label} data-state={step.state}>
					<span>{String(index + 1).padStart(2, "0")}</span>
					<div>
						<strong>{step.label}</strong>
						<code>{step.detail}</code>
					</div>
				</li>
			))}
		</ol>
	);
}
