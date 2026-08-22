import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ActivityAgentFilter, ActivityOutcomeFilter, ActivityRange } from "@/data/dashboard";
import { ActivityTable } from "@/components/dashboard/activity-table";
import { SearchIcon } from "@/components/dashboard/icons";
import { RecoveryChart } from "@/components/dashboard/recovery-chart";
import { dashboardDomain, getDashboardContext } from "@/components/dashboard/server-context";
import { DashboardUnavailable, PageIntro, Section } from "@/components/dashboard/ui";
import styles from "@/components/dashboard/dashboard.module.css";

type Props = { params: Promise<{ domain: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata: Metadata = { title: "Activity" };

function one(value: string | string[] | undefined): string { return typeof value === "string" ? value : ""; }
function validRange(value: string): ActivityRange { return value === "24h" || value === "7d" ? value : "30d"; }
function validAgent(value: string): ActivityAgentFilter { return value === "crawler" || value === "browser_agent" || value === "human" ? value : "all"; }
function validOutcome(value: string): ActivityOutcomeFilter { return value === "recovered" || value === "unrecovered" ? value : "all"; }

export default async function ActivityPageRoute({ params, searchParams }: Props) {
	const context = await getDashboardContext();
	if (!context.storage) return <DashboardUnavailable />;
	const domain = dashboardDomain((await params).domain);
	const query = await searchParams;
	const range = validRange(one(query.range));
	const agent = validAgent(one(query.agent));
	const outcome = validOutcome(one(query.outcome));
	const search = one(query.q).slice(0, 160);
	const cursor = one(query.cursor) || null;
	const site = await context.storage.getOwnedSiteByDomain(domain, context.owner.sub).catch(() => null);
	if (!site) notFound();

	let activity;
	let overview;
	try {
		[activity, overview] = await Promise.all([
			context.storage.getActivityPage(site.id, { range, agent, outcome, query: search, cursor, limit: 30 }),
			context.storage.getSiteOverview(domain, context.owner.sub),
		]);
	} catch (error) { console.error("Activity load failed", error); return <DashboardUnavailable />; }
	if (!overview) notFound();
	const days = range === "24h" ? 1 : range === "7d" ? 7 : 30;
	const points = overview.recoverySeries.slice(-days);
	const baseParams = new URLSearchParams({ range, agent, outcome });
	if (search) baseParams.set("q", search);

	return <>
		<PageIntro eyebrow="Recovery traffic" title="Activity" description={`Requests observed for ${domain}. Times are shown in UTC.`} />
		<nav className={styles.rangeTabs} aria-label="Activity range">{(["24h", "7d", "30d"] as const).map((value) => { const next = new URLSearchParams(baseParams); next.set("range", value); return <Link key={value} aria-current={range === value ? "page" : undefined} href={`?${next}`}>{value}</Link>; })}</nav>
		<Section><RecoveryChart points={points} compact /></Section>
		<form className={styles.activityFilters} method="get">
			<input type="hidden" name="range" value={range} />
			<label className={styles.searchField}><SearchIcon size={14}/><input name="q" defaultValue={search} placeholder="Search request URL…" aria-label="Search request URL" /></label>
			<label><span className="sr-only">Agent</span><select name="agent" defaultValue={agent}><option value="all">All agents</option><option value="crawler">Crawlers</option><option value="browser_agent">Browser agents</option><option value="human">Humans</option></select></label>
			<label><span className="sr-only">Outcome</span><select name="outcome" defaultValue={outcome}><option value="all">All outcomes</option><option value="recovered">Recovered</option><option value="unrecovered">Not recovered</option></select></label>
			<button className={styles.buttonSecondary} type="submit">Apply</button>
		</form>
		<Section title="Request log" description={`${activity.items.length} event${activity.items.length === 1 ? "" : "s"} on this page.`} flush><ActivityTable items={activity.items} /></Section>
		{activity.hasMore && activity.nextCursor ? <div className={styles.pagination}><span>Showing newest first</span><Link className={styles.buttonSecondary} href={`?${new URLSearchParams([...baseParams.entries(), ["cursor", activity.nextCursor]])}`}>Next page</Link></div> : null}
	</>;
}
