"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SitePortfolioStatus, SiteSummary } from "@/data/dashboard";
import { ArrowRightIcon, GlobeIcon, SearchIcon } from "./icons";
import { AddSiteButton } from "./site-switcher";
import { EmptyState, StatusBadge, formatCompactNumber, formatDate, formatPercent } from "./ui";
import styles from "./dashboard.module.css";

const filters: { value: "all" | SitePortfolioStatus; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "live", label: "Live" },
	{ value: "warning", label: "Needs attention" },
	{ value: "unverified", label: "Unverified" },
];

export function SitesPortfolio({ sites }: { sites: SiteSummary[] }) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("all");
	const counts = useMemo(() => sites.reduce<Record<string, number>>((all, site) => ({ ...all, [site.status]: (all[site.status] ?? 0) + 1 }), {}), [sites]);
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return sites.filter((site) => (filter === "all" || site.status === filter) && (!needle || site.domain.toLowerCase().includes(needle)));
	}, [filter, query, sites]);

	if (!sites.length) {
		return <EmptyState title="Add your first site" description="Connect a production domain to verify recovery hints, index its pages, and watch agent traffic." action={<AddSiteButton />} />;
	}

	return <>
		<div className={styles.portfolioToolbar}>
			<div className={styles.searchField}><SearchIcon size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sites…" aria-label="Search sites" /></div>
			<div className={styles.filterTabs} role="group" aria-label="Filter sites by status">{filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span>{item.value === "all" ? sites.length : counts[item.value] ?? 0}</span></button>)}</div>
		</div>
		{filtered.length ? <div className={styles.siteGrid}>{filtered.map((site) => <SiteCard key={site.id} site={site} />)}</div> : <div className={styles.noResults}><GlobeIcon size={20}/><h2>No matching sites</h2><p>Change the search or status filter to see more of your portfolio.</p></div>}
	</>;
}

function SiteCard({ site }: { site: SiteSummary }) {
	const badge = site.status === "live" ? "Live" : site.status === "warning" ? "Needs attention" : "Unverified";
	return <Link href={`/dashboard/${encodeURIComponent(site.domain)}`} className={styles.siteCard} aria-label={`Open ${site.domain}`}>
		<div className={styles.siteCardTop}><span className={styles.siteCardGlyph}>{site.domain.charAt(0).toUpperCase()}</span><StatusBadge tone={site.status}>{badge}</StatusBadge></div>
		<div className={styles.siteIdentity}><h2 className="mono">{site.domain}</h2><p>Last activity · {formatDate(site.lastActivityAt)}</p></div>
		<div className={styles.siteMetrics}>
			<div><span>Indexed</span><strong>{formatCompactNumber(site.pageCount)}</strong></div>
			<div><span>Requests · 30d</span><strong>{formatCompactNumber(site.suggestions30d)}</strong></div>
			<div><span>Recovery</span><strong className={site.recoveryRate30d == null ? styles.noData : undefined}>{formatPercent(site.recoveryRate30d)}</strong></div>
		</div>
		<div className={styles.siteCardOpen}>Open site <ArrowRightIcon size={14} /></div>
	</Link>;
}
