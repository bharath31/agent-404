import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivityTable } from "@/components/dashboard/activity-table";
import { RecoveryChart } from "@/components/dashboard/recovery-chart";
import { RecoveryTrace } from "@/components/dashboard/recovery-trace";
import { dashboardDomain, getDashboardContext } from "@/components/dashboard/server-context";
import { DashboardUnavailable, MetricStrip, PageIntro, Recommendation, Section, StatusBadge, formatCompactNumber, formatDate, formatPercent } from "@/components/dashboard/ui";
import styles from "@/components/dashboard/dashboard.module.css";

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { domain } = await params;
	return { title: dashboardDomain(domain) };
}

export default async function SiteOverviewPage({ params }: Props) {
	const context = await getDashboardContext();
	if (!context.storage) return <DashboardUnavailable />;
	const domain = dashboardDomain((await params).domain);
	let overview;
	try { overview = await context.storage.getSiteOverview(domain, context.owner.sub); }
	catch (error) { console.error("Site overview load failed", error); return <DashboardUnavailable />; }
	if (!overview) notFound();

	const statusLabel = overview.status === "live" ? "Live recovery" : overview.status === "warning" ? "Needs attention" : "Unverified";
	const latest = overview.recentActivity[0] ?? null;
	return <>
		<PageIntro eyebrow="Site overview" title={overview.site.domain} description={`Recovery status · Last activity ${formatDate(overview.metrics.lastActivityAt)}`} actions={<StatusBadge tone={overview.status}>{statusLabel}</StatusBadge>} />
		<Recommendation title={overview.recommendedAction.title} description={overview.recommendedAction.description} href={overview.recommendedAction.href} />
		<MetricStrip items={[
			{ label: "Recovery rate · 30d", value: formatPercent(overview.metrics.recoveryRate30d), noData: overview.metrics.recoveryRate30d == null },
			{ label: "404 requests · 30d", value: formatCompactNumber(overview.metrics.suggestions30d) },
			{ label: "Recovered", value: formatCompactNumber(overview.metrics.recovered30d) },
			{ label: "Indexed pages", value: formatCompactNumber(overview.metrics.indexedPages) },
			{ label: "Median follow time", value: overview.metrics.medianRecoveryLatencyMs30d == null ? "No data" : `${Math.round(overview.metrics.medianRecoveryLatencyMs30d)} ms`, noData: overview.metrics.medianRecoveryLatencyMs30d == null },
		]} />
		<div className={styles.overviewGrid}>
			<Section title="Recovery trend" description="404 suggestions and followed destinations over the last 30 days."><RecoveryChart points={overview.recoverySeries} /></Section>
			<Section title="Live recovery trace" description="The latest observable request moving through the recovery protocol."><RecoveryTrace request={latest?.deadUrl ?? null} match={latest?.suggestedUrls[0] ?? null} hasProtocolEvidence={Boolean(overview.latestProbe?.hasLinkHeaders || overview.latestProbe?.hasJsonLd)} destination={latest?.recoveredUrl ?? null} /></Section>
		</div>
		<Section title="Recent activity" description="Latest requests for this site only." action={<a className={styles.textLink} href={`/dashboard/${encodeURIComponent(domain)}/activity`}>View all</a>} flush><ActivityTable items={overview.recentActivity.slice(0, 7)} compact /></Section>
	</>;
}
