import type { Metadata } from "next";
import Link from "next/link";
import { cache, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { CANONICAL_ORIGIN, getDatabaseUrl } from "@/config";
import { PostgresStorage } from "@/storage/postgres";
import type { StandingAuditReport } from "@/types";
import styles from "./report.module.css";

export const dynamic = "force-dynamic";

type ReportResult = { state: "ready"; report: StandingAuditReport } | { state: "missing" } | { state: "unavailable" };

const loadReport = cache(async (id: string): Promise<ReportResult> => {
	const databaseUrl = getDatabaseUrl();
	if (!databaseUrl) return { state: "unavailable" };
	try {
		const report = await new PostgresStorage(databaseUrl).getAuditReport(id);
		return report ? { state: "ready", report } : { state: "missing" };
	} catch (error) {
		console.error("Unable to load audit report", error);
		return { state: "unavailable" };
	}
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
	const { id } = await params;
	const result = await loadReport(id);
	if (result.state !== "ready") {
		return { title: "Audit report unavailable — agent-404", robots: { index: false, follow: false } };
	}
	const { report } = result;
	const title = `${report.domain} agent readiness: ${report.score}/100`;
	const description = report.summary.recommendation;
	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			url: `${CANONICAL_ORIGIN}${report.permalink}`,
			images: [{ url: `${CANONICAL_ORIGIN}${report.ogImageUrl}`, width: 1200, height: 630 }],
		},
	};
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
	return (
		<li data-ok={ok}>
			<span aria-hidden="true">{ok ? "✓" : "×"}</span>
			<div>
				<strong>{children}</strong>
				<small>{ok ? "Observed in the response" : "Not present in the response"}</small>
			</div>
		</li>
	);
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const result = await loadReport(id);
	if (result.state === "missing") notFound();
	if (result.state === "unavailable") {
		return (
			<main className={styles.page}>
				<ReportNav />
				<section className={styles.unavailable}>
					<span>503</span>
					<h1>Reports are temporarily unavailable.</h1>
					<p>The report store is not configured or could not be reached. The audit itself has not been changed.</p>
					<Link href="/demo">Return to the live inspector</Link>
				</section>
			</main>
		);
	}

	const { report } = result;
	const createdAt = new Intl.DateTimeFormat("en", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "UTC",
	}).format(new Date(report.createdAt));
	const tone = report.summary.status;
	const label = tone === "good" ? "Agent-ready" : tone === "warning" ? "Recovery degraded" : "Recovery missing";
	const target = report.claudeBotProbe.headersSnippet.link?.match(/<([^>]+)>/)?.[1] ?? null;

	return (
		<main className={styles.page}>
			<ReportNav />
			<div className={styles.breadcrumbs}>
				<Link href="/demo">Audits</Link>
				<span>/</span>
				<span>{report.domain}</span>
			</div>

			<header className={styles.reportHeader}>
				<div>
					<p>Standing audit · {createdAt} UTC</p>
					<h1>{report.domain}</h1>
					<span className={styles.verdict} data-tone={tone}>
						<span aria-hidden="true" /> {label}
					</span>
				</div>
				<div className={styles.score} data-tone={tone}>
					<strong>{report.score}</strong>
					<span>readiness<br />out of 100</span>
				</div>
			</header>

			<section className={styles.recommendation}>
				<div>
					<span>Recommended action</span>
					<strong>{report.summary.recommendation}</strong>
				</div>
				<Link href={`/auth/login?return_to=${encodeURIComponent(`/dashboard?register=${report.domain}`)}`}>
					Configure this site
				</Link>
			</section>

			<div className={styles.reportGrid}>
				<section className={styles.module}>
					<header>
						<div>
							<span>Protocol checks</span>
							<h2>What ClaudeBot received</h2>
						</div>
						<code>HTTP {report.claudeBotProbe.status}</code>
					</header>
					<ul className={styles.checks}>
						<Check ok={report.summary.crawlerAccessible}>Clean 404 status</Check>
						<Check ok={report.summary.linkHeadersConfigured}>Alternate Link header</Check>
						<Check ok={report.summary.jsonLdConfigured}>schema.org JSON-LD</Check>
					</ul>
				</section>

				<section className={`${styles.module} ${styles.traceModule}`}>
					<header>
						<div>
							<span>Recovery trace</span>
							<h2>One request, one route forward</h2>
						</div>
					</header>
					<ol className={styles.trace}>
						<li data-complete="true">
							<span>01</span>
							<div><strong>404 request</strong><code>{report.claudeBotProbe.targetUrl}</code></div>
						</li>
						<li data-complete={report.claudeBotProbe.hasSuggestions}>
							<span>02</span>
							<div><strong>Matcher</strong><code>{report.claudeBotProbe.hasSuggestions ? "destination ranked" : "no destination"}</code></div>
						</li>
						<li data-complete={report.summary.linkHeadersConfigured || report.summary.jsonLdConfigured}>
							<span>03</span>
							<div><strong>Link / JSON-LD</strong><code>{report.summary.linkHeadersConfigured || report.summary.jsonLdConfigured ? "evidence returned" : "evidence missing"}</code></div>
						</li>
						<li data-complete={Boolean(target)}>
							<span>04</span>
							<div><strong>Destination</strong><code>{target ?? "not available"}</code></div>
						</li>
					</ol>
				</section>
			</div>

			{report.analysis ? (
				<section className={`${styles.module} ${styles.healthModule}`}>
					<header>
						<div>
							<span>Sitemap health</span>
							<h2>{report.analysis.pagesAnalyzed.toLocaleString()} pages inspected</h2>
						</div>
						<code>{report.analysis.source}</code>
					</header>
					<div className={styles.healthColumns}>
						<HealthList
							title="Broken internal links"
							items={report.analysis.brokenLinks.map((item) => item.targetUrl)}
						/>
						<HealthList title="Orphan pages" items={report.analysis.orphanPages} />
					</div>
				</section>
			) : (
				<section className={styles.noDeepAudit}>
					<div>
						<span>Site health</span>
						<strong>This report contains the live response probe only.</strong>
					</div>
					<Link href={`/demo?audit=${encodeURIComponent(report.id)}`}>Open inspector to run a sitemap crawl</Link>
				</section>
			)}

			<footer className={styles.footer}>
				<span>agent-404 · standing audit {report.id}</span>
				<div>
					<Link href="/demo">Run another audit</Link>
					<Link href="/">Product</Link>
				</div>
			</footer>
		</main>
	);
}

function ReportNav() {
	return (
		<nav className={styles.nav}>
			<Link href="/" className={styles.brand}><span>404</span> agent-404</Link>
			<div>
				<Link href="/demo">Live inspector</Link>
				<Link href="/dashboard">Dashboard</Link>
			</div>
		</nav>
	);
}

function HealthList({ title, items }: { title: string; items: string[] }) {
	return (
		<div>
			<header>
				<strong>{title}</strong>
				<span data-clear={items.length === 0}>{items.length === 0 ? "Clear" : items.length}</span>
			</header>
			{items.length ? (
				<ul>{items.slice(0, 8).map((item) => <li key={item}><code>{item}</code></li>)}</ul>
			) : (
				<p>No issues found in the sampled pages.</p>
			)}
		</div>
	);
}
