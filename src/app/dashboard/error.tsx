"use client";

import { WarningIcon } from "@/components/dashboard/icons";
import styles from "@/components/dashboard/dashboard.module.css";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return <div className={styles.unavailable} role="alert"><WarningIcon size={20} /><div><h1>Dashboard data did not load</h1><p>The request failed before any account data was shown.</p><button type="button" className={styles.buttonSecondary} onClick={reset}>Try again</button></div></div>;
}
