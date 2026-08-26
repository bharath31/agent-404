"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ActivityIcon, CloseIcon, ExternalIcon, GridIcon, MenuIcon, PagesIcon, SettingsIcon, TerminalIcon } from "./icons";
import { SiteSwitcher, type SiteNavItem } from "./site-switcher";
import { ThemeToggle } from "./theme-toggle";
import styles from "./dashboard.module.css";

const scopedNav = [
	{ suffix: "", label: "Overview", icon: GridIcon },
	{ suffix: "/activity", label: "Activity", icon: ActivityIcon },
	{ suffix: "/pages", label: "Pages", icon: PagesIcon },
	{ suffix: "/installation", label: "Installation", icon: TerminalIcon },
	{ suffix: "/settings", label: "Settings", icon: SettingsIcon },
];

function decodeDomain(value: string | string[] | undefined): string | null {
	if (typeof value !== "string") return null;
	try { return decodeURIComponent(value); } catch { return value; }
}

export function DashboardShell({ sites, viewerEmail, children }: { sites: SiteNavItem[]; viewerEmail: string | null; children: React.ReactNode }) {
	const pathname = usePathname();
	const params = useParams<{ domain?: string }>();
	const activeDomain = decodeDomain(params.domain);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const drawerRef = useRef<HTMLElement>(null);
	const menuButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => setDrawerOpen(false), [pathname]);
	useEffect(() => {
		if (!drawerOpen) return;
		const focusable = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])') ?? []);
		focusable()[0]?.focus();
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") { setDrawerOpen(false); menuButtonRef.current?.focus(); return; }
			if (event.key !== "Tab") return;
			const items = focusable();
			if (!items.length) return;
			const first = items[0]; const last = items[items.length - 1];
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [drawerOpen]);

	const base = activeDomain ? `/dashboard/${encodeURIComponent(activeDomain)}` : "/dashboard";
	const pageLabel = activeDomain ? scopedNav.find(({ suffix }) => pathname === `${base}${suffix}`)?.label ?? "Overview" : "Sites";

	return (
		<div className={styles.appShell}>
			<a href="#dashboard-content" className={styles.skipLink}>Skip to content</a>
			<aside className={styles.rail} aria-label="Dashboard navigation">
				<RailContent sites={sites} viewerEmail={viewerEmail} activeDomain={activeDomain} pathname={pathname} />
			</aside>
			{drawerOpen ? <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDrawerOpen(false); }}><aside id="dashboard-drawer" ref={drawerRef} className={styles.drawer} role="dialog" aria-modal="true" aria-label="Dashboard navigation"><button type="button" className={styles.drawerClose} onClick={() => { setDrawerOpen(false); menuButtonRef.current?.focus(); }} aria-label="Close navigation"><CloseIcon /></button><RailContent sites={sites} viewerEmail={viewerEmail} activeDomain={activeDomain} pathname={pathname} /></aside></div> : null}
			<div className={styles.workspace}>
				<header className={styles.topbar}>
					<button ref={menuButtonRef} className={styles.mobileMenu} type="button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" aria-controls="dashboard-drawer" aria-expanded={drawerOpen}><MenuIcon /></button>
					<nav className={styles.breadcrumbs} aria-label="Breadcrumb">
						<Link href="/dashboard">All Sites</Link>
						{activeDomain ? <><span>/</span><Link href={base} className="mono">{activeDomain}</Link>{pageLabel !== "Overview" ? <><span>/</span><strong>{pageLabel}</strong></> : null}</> : null}
					</nav>
					<div className={styles.topbarActions}><a href="/skills/agent-404" target="_blank" rel="noreferrer">Docs <ExternalIcon size={13} /></a><ThemeToggle /></div>
				</header>
				<main id="dashboard-content" className={styles.main}>{children}</main>
				{activeDomain ? (
					<nav className={styles.mobileDock} aria-label={`${activeDomain} mobile navigation`}>
						{scopedNav.map(({ suffix, label, icon: Icon }) => {
							const href = `${base}${suffix}`;
							const active = pathname === href;
							return <Link key={label} href={href} className={active ? styles.mobileDockActive : undefined} aria-current={active ? "page" : undefined}><Icon size={17} /><span>{label}</span></Link>;
						})}
					</nav>
				) : null}
			</div>
		</div>
	);
}

function RailContent({ sites, viewerEmail, activeDomain, pathname }: { sites: SiteNavItem[]; viewerEmail: string | null; activeDomain: string | null; pathname: string }) {
	const base = activeDomain ? `/dashboard/${encodeURIComponent(activeDomain)}` : "/dashboard";
	return <>
		<div className={styles.railBrand}><Link href="/dashboard" aria-label="agent-404 dashboard"><span aria-hidden="true">↳</span><strong className="mono">agent-404</strong></Link></div>
		<div className={styles.railSwitcher}><SiteSwitcher sites={sites} activeDomain={activeDomain} /></div>
		<nav className={styles.railNav} aria-label={activeDomain ? `${activeDomain} navigation` : "Portfolio navigation"}>
			{activeDomain ? scopedNav.map(({ suffix, label, icon: Icon }) => {
				const href = `${base}${suffix}`;
				const active = pathname === href;
				return <Link key={label} href={href} className={active ? styles.navActive : undefined} aria-current={active ? "page" : undefined}><Icon size={15} /><span>{label}</span></Link>;
			}) : <Link href="/dashboard" className={styles.navActive} aria-current="page"><GridIcon size={15} /><span>Sites</span></Link>}
		</nav>
		<div className={styles.railBottom}>
			<div className={styles.accountBadge} aria-label={viewerEmail ? `Signed in as ${viewerEmail}` : "Signed in"}><span>{viewerEmail?.charAt(0).toUpperCase() ?? "A"}</span><div><strong>{viewerEmail?.split("@")[0] ?? "Account"}</strong><small>{viewerEmail ?? "Owner"}</small></div></div>
			<a href="/auth/logout" className={styles.signOut}>Sign out</a>
		</div>
	</>;
}
