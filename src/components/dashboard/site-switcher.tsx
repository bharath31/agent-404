"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronsIcon, CloseIcon, GlobeIcon, PlusIcon, SearchIcon } from "./icons";
import styles from "./dashboard.module.css";

export interface SiteNavItem {
	id: string;
	domain: string;
	state?: "live" | "warning" | "unverified";
}

export function SiteSwitcher({ sites, activeDomain }: { sites: SiteNavItem[]; activeDomain: string | null }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [adding, setAdding] = useState(false);
	const [query, setQuery] = useState("");
	const panelRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return needle ? sites.filter((site) => site.domain.toLowerCase().includes(needle)) : sites;
	}, [query, sites]);

	useEffect(() => {
		if (!open) return;
		const frame = requestAnimationFrame(() => searchRef.current?.focus());
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") setOpen(false);
		}
		function onPointer(event: PointerEvent) {
			if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
		}
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onPointer);
		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onPointer);
		};
	}, [open]);

	function navigate(domain: string | null) {
		setOpen(false);
		setQuery("");
		router.push(domain ? `/dashboard/${encodeURIComponent(domain)}` : "/dashboard");
	}

	return (
		<>
			<div className={styles.switcherWrap} ref={panelRef}>
				<button className={styles.switcherButton} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
					<span className={styles.siteGlyph} aria-hidden="true">{activeDomain ? activeDomain.charAt(0).toUpperCase() : <GlobeIcon size={14} />}</span>
					<span className={styles.switcherLabel}>{activeDomain ?? "All Sites"}</span>
					<ChevronsIcon size={14} />
				</button>

				{open ? (
					<div className={styles.switcherPanel} role="dialog" aria-label="Switch site">
						<div className={styles.switcherSearch}>
							<SearchIcon size={14} />
							<input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a site…" aria-label="Find a site" />
						</div>
						<div className={styles.switcherList}>
							<button type="button" className={styles.switcherOption} onClick={() => navigate(null)}>
								<span className={styles.optionGlyph}><GlobeIcon size={14} /></span>
								<span>All Sites</span>
								{!activeDomain ? <CheckIcon size={14} /> : null}
							</button>
							{filtered.map((site) => (
								<button type="button" className={styles.switcherOption} key={site.id} onClick={() => navigate(site.domain)}>
									<span className={styles.optionGlyph}>{site.domain.charAt(0).toUpperCase()}</span>
									<span className={styles.optionText}><span>{site.domain}</span><small>{site.state === "live" ? "Live" : site.state === "warning" ? "Needs attention" : "Not verified"}</small></span>
									{site.domain === activeDomain ? <CheckIcon size={14} /> : null}
								</button>
							))}
							{filtered.length === 0 ? <p className={styles.switcherEmpty}>No sites match “{query}”.</p> : null}
						</div>
						<div className={styles.switcherFooter}>
							<button type="button" onClick={() => { setOpen(false); setAdding(true); }}><PlusIcon size={14} /> Add Site</button>
						</div>
					</div>
				) : null}
			</div>
			{adding ? <AddSiteDialog onClose={() => setAdding(false)} /> : null}
		</>
	);
}

export function AddSiteButton({ className, children }: { className?: string; children?: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	return <><button type="button" className={className ?? styles.buttonPrimary} onClick={() => setOpen(true)}><PlusIcon size={14} />{children ?? "Add Site"}</button>{open ? <AddSiteDialog onClose={() => setOpen(false)} /> : null}</>;
}

function AddSiteDialog({ onClose }: { onClose: () => void }) {
	const router = useRouter();
	const [domain, setDomain] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [created, setCreated] = useState<{ id: string; domain: string; apiKey?: string } | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const dialogRef = useRef<HTMLElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape" && !busy) { onClose(); return; }
			if (event.key !== "Tab") return;
			const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])') ?? []);
			if (!items.length) return;
			const first = items[0]; const last = items[items.length - 1];
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [busy, onClose]);

	async function create(event: React.FormEvent) {
		event.preventDefault();
		setError(null);
		setBusy(true);
		try {
			const response = await fetch("/api/sites", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ domain }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error ?? "The site could not be added.");
			setCreated({ id: data.id, domain: data.domain, apiKey: response.status === 201 ? data.apiKey : undefined });
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "The site could not be added.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}>
			<section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="add-site-title">
				<header className={styles.dialogHeader}>
					<div><p className={styles.eyebrow}>Portfolio</p><h2 id="add-site-title">Add a site</h2></div>
					<button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close"><CloseIcon /></button>
				</header>
				{created ? (
					<div className={styles.dialogBody}>
						<div className={styles.successMark}><CheckIcon size={18} /></div>
						<h3>{created.domain} is ready to verify</h3>
						<p className={styles.muted}>{created.apiKey ? "The write key below is shown once. Store it in your site’s environment variables before continuing." : "This site is already connected to your account. Continue to review its verification and installation state."}</p>
						{created.apiKey ? <SecretReveal value={created.apiKey} /> : null}
						<div className={styles.dialogActions}>
							<button className={styles.buttonSecondary} type="button" onClick={() => { onClose(); router.refresh(); }}>Finish later</button>
							<button className={styles.buttonPrimary} type="button" onClick={() => router.push(`/dashboard/${encodeURIComponent(created.domain)}/installation`)}>Open installation</button>
						</div>
					</div>
				) : (
					<form onSubmit={create} className={styles.dialogBody}>
						<p className={styles.muted}>Enter the production hostname you want agent-404 to recover. You can add preview domains separately.</p>
						<label className={styles.field}><span>Domain</span><div className={styles.inputAffix}><span>https://</span><input ref={inputRef} name="domain" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" autoCapitalize="none" autoCorrect="off" required /></div></label>
						{error ? <p className={styles.formError} role="alert">{error}</p> : null}
						<div className={styles.dialogActions}>
							<button className={styles.buttonSecondary} type="button" onClick={onClose}>Cancel</button>
							<button className={styles.buttonPrimary} type="submit" disabled={busy || !domain.trim()}>{busy ? "Adding…" : "Add site"}</button>
						</div>
					</form>
				)}
			</section>
		</div>
	);
}

function SecretReveal({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);
	async function copy() {
		await navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1600);
	}
	return <div className={styles.secretReveal}><code>{value}</code><button type="button" onClick={copy}>{copied ? <CheckIcon size={14} /> : null}{copied ? "Copied" : "Copy"}</button></div>;
}
