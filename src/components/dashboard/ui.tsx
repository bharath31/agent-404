import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, WarningIcon } from "./icons";
import styles from "./dashboard.module.css";

export type Tone = "live" | "warning" | "unverified" | "neutral" | "danger";

export function PageIntro({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
	return <header className={styles.pageIntro}>
		<div>{eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}<h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
		{actions ? <div className={styles.pageActions}>{actions}</div> : null}
	</header>;
}

export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
	return <span className={`${styles.statusBadge} ${styles[`tone_${tone}`]}`}><span aria-hidden="true" />{children}</span>;
}

export function Section({ title, description, action, children, flush = false }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; flush?: boolean }) {
	return <section className={`${styles.module} ${flush ? styles.moduleFlush : ""}`}>
		{title || description || action ? <header className={styles.moduleHeader}><div>{title ? <h2>{title}</h2> : null}{description ? <p>{description}</p> : null}</div>{action}</header> : null}
		<div className={flush ? undefined : styles.moduleBody}>{children}</div>
	</section>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
	return <div className={styles.emptyState}><div className={styles.emptyGlyph} aria-hidden="true">404</div><h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function DashboardUnavailable() {
	return <div className={styles.unavailable} role="status"><WarningIcon size={20} /><div><h1>Dashboard temporarily unavailable</h1><p>The dashboard cannot reach its data store. Configuration and request details remain private; try again shortly.</p></div></div>;
}

export function Recommendation({ title, description, href, label = "Resolve next" }: { title: string; description: string; href: string; label?: string }) {
	return <aside className={styles.recommendation}><div className={styles.recommendationIndex} aria-hidden="true">NEXT</div><div><h2>{title}</h2><p>{description}</p></div><Link href={href}>{label}<ArrowRightIcon size={14} /></Link></aside>;
}

export function MetricStrip({ items }: { items: { label: string; value: string; detail?: string; noData?: boolean }[] }) {
	return <dl className={styles.metricStrip}>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd className={item.noData ? styles.noData : undefined}>{item.value}</dd>{item.detail ? <small>{item.detail}</small> : null}</div>)}</dl>;
}

export function formatCompactNumber(value: number | null): string {
	if (value == null) return "No data";
	return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number | null): string {
	if (value == null) return "No data";
	return new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

export function formatDate(value: string | null, mode: "short" | "full" = "short"): string {
	if (!value) return "No activity";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "No activity";
	return new Intl.DateTimeFormat("en", mode === "full" ? { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function pathFromUrl(value: string): string {
	try {
		const url = new URL(value);
		return `${url.pathname}${url.search}`;
	} catch {
		return value;
	}
}
