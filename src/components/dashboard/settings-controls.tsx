"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KeyRotationResult, SiteKeyKind } from "@/data/dashboard";
import { CheckIcon, CopyIcon, RefreshIcon, WarningIcon } from "./icons";
import styles from "./dashboard.module.css";

export function RotateKeyControl({ siteId, kind, overlapExpiresAt }: { siteId: string; kind: SiteKeyKind; overlapExpiresAt: string | null }) {
	const router = useRouter();
	const activeOverlap = overlapExpiresAt ? Date.parse(overlapExpiresAt) > Date.now() : false;
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<KeyRotationResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	async function rotate() {
		setBusy(true); setError(null);
		try {
			const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/keys/${kind}/rotate`, { method: "POST" });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error ?? (response.status === 409 ? "A previous key is still inside its 24-hour overlap." : "The key could not be rotated."));
			setResult(data); router.refresh();
		} catch (caught) { setError(caught instanceof Error ? caught.message : "The key could not be rotated."); }
		finally { setBusy(false); }
	}
	async function copy() { if (!result) return; await navigator.clipboard.writeText(result.key); setCopied(true); setTimeout(() => setCopied(false), 1600); }
	return <div className={styles.rotationControl}>
		{activeOverlap ? <p className={styles.overlapNotice}><span/>Previous {kind} key accepted until <time dateTime={overlapExpiresAt!}>{formatUtc(overlapExpiresAt!)}</time>.</p> : <p>No overlap is active. Rotation preserves the current key for 24 hours.</p>}
		<button type="button" className={styles.buttonSecondary} onClick={rotate} disabled={busy || activeOverlap}>{busy ? <RefreshIcon className={styles.spinning} size={13}/> : null}{busy ? "Rotating…" : `Rotate ${kind} key`}</button>
		{error ? <p className={styles.formError} role="alert">{error}</p> : null}
		{result ? <div className={styles.oneTimeKey} role="status"><div><WarningIcon size={16}/><p><strong>Copy this key now.</strong><span>It will not appear in the dashboard again.</span></p></div><div><code>{result.key}</code><button type="button" onClick={copy}>{copied ? <CheckIcon size={13}/> : <CopyIcon size={13}/>} {copied ? "Copied" : "Copy"}</button></div><small>The previous key expires {formatUtc(result.previousKeyExpiresAt)}.</small></div> : null}
	</div>;
}

export function DeleteSiteControl({ siteId, domain }: { siteId: string; domain: string }) {
	const router = useRouter();
	const [confirmation, setConfirmation] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const matches = confirmation === domain;
	async function remove(event: React.FormEvent) {
		event.preventDefault(); if (!matches) return;
		setBusy(true); setError(null);
		try {
			const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: confirmation }) });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error ?? "The site could not be deleted.");
			router.push("/dashboard"); router.refresh();
		} catch (caught) { setError(caught instanceof Error ? caught.message : "The site could not be deleted."); setBusy(false); }
	}
	return <form onSubmit={remove} className={styles.deleteControl}>
		<label><span>Type <code>{domain}</code> to confirm</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} /></label>
		<button className={styles.buttonDanger} type="submit" disabled={!matches || busy}>{busy ? "Deleting…" : "Delete site permanently"}</button>
		{error ? <p className={styles.formError} role="alert">{error}</p> : null}
	</form>;
}

function formatUtc(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date);
}
