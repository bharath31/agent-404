import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchIcon } from "@/components/dashboard/icons";
import { PagesTable } from "@/components/dashboard/pages-table";
import { ReindexButton } from "@/components/dashboard/reindex-button";
import { dashboardDomain, getDashboardContext } from "@/components/dashboard/server-context";
import { DashboardUnavailable, PageIntro, Section } from "@/components/dashboard/ui";
import styles from "@/components/dashboard/dashboard.module.css";

type Props = { params: Promise<{ domain: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export const metadata: Metadata = { title: "Indexed pages" };

export default async function IndexedPagesRoute({ params, searchParams }: Props) {
	const context = await getDashboardContext();
	if (!context.storage) return <DashboardUnavailable />;
	const domain = dashboardDomain((await params).domain);
	const raw = await searchParams;
	const query = typeof raw.q === "string" ? raw.q.slice(0, 180) : "";
	const cursor = typeof raw.cursor === "string" ? raw.cursor : null;
	const site = await context.storage.getOwnedSiteByDomain(domain, context.owner.sub).catch(() => null);
	if (!site) notFound();
	let page;
	try { page = await context.storage.getIndexedPagePage(site.id, { query, cursor, limit: 40 }); }
	catch (error) { console.error("Indexed page inventory load failed", error); return <DashboardUnavailable />; }

	const base = new URLSearchParams(); if (query) base.set("q", query);
	return <>
		<PageIntro eyebrow="Matcher inventory" title="Pages" description={`Content agent-404 can offer when a URL on ${domain} disappears.`} actions={<ReindexButton siteId={site.id} />} />
		<form className={styles.inventorySearch} method="get"><label className={styles.searchField}><SearchIcon size={14}/><input name="q" defaultValue={query} placeholder="Search indexed URLs…" aria-label="Search indexed URLs" /></label><button type="submit" className={styles.buttonSecondary}>Search</button></form>
		<Section title="Indexed inventory" description={`${page.items.length} page${page.items.length === 1 ? "" : "s"} on this page · sorted by freshness.`} flush><PagesTable items={page.items} /></Section>
		{page.hasMore && page.nextCursor ? <div className={styles.pagination}><span>Newest indexed pages first</span><Link className={styles.buttonSecondary} href={`?${new URLSearchParams([...base.entries(), ["cursor", page.nextCursor]])}`}>Next page</Link></div> : null}
	</>;
}
