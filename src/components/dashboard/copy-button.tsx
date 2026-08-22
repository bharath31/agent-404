"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";
import styles from "./dashboard.module.css";

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	async function copy() {
		await navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}
	return <button type="button" className={className ?? styles.copyButton} onClick={copy} aria-live="polite">{copied ? <CheckIcon size={13}/> : <CopyIcon size={13}/>} {copied ? "Copied" : label}</button>;
}
