"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon, RefreshIcon } from "./icons";
import styles from "./dashboard.module.css";

export function ReindexButton({ siteId }: { siteId: string }) {
	const router = useRouter();
	const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
	const [message, setMessage] = useState<string | null>(null);
	async function reindex() {
		setState("busy"); setMessage(null);
		try {
			const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/reindex`, { method: "POST" });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error ?? "The sitemap could not be resynced.");
			setState("done"); setMessage("Resync queued"); router.refresh();
		} catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "The sitemap could not be resynced."); }
	}
	return <div className={styles.inlineAction}><button type="button" className={styles.buttonSecondary} onClick={reindex} disabled={state === "busy"}>{state === "done" ? <CheckIcon size={13}/> : <RefreshIcon size={13}/>} {state === "busy" ? "Queuing…" : state === "done" ? "Queued" : "Resync sitemap"}</button>{message ? <span className={state === "error" ? styles.actionError : styles.actionSuccess} role="status">{message}</span> : null}</div>;
}
