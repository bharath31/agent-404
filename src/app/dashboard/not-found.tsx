import Link from "next/link";
import { ArrowRightIcon } from "@/components/dashboard/icons";
import styles from "@/components/dashboard/dashboard.module.css";

export default function DashboardNotFound() {
	return <div className={styles.notFound}><p className="mono">404 / SITE_SCOPE</p><h1>This site is not in your portfolio.</h1><p>It may have been removed, renamed, or belong to another account.</p><Link className={styles.buttonPrimary} href="/dashboard">Return to All Sites <ArrowRightIcon size={14} /></Link></div>;
}
