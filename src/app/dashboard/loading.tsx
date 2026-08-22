import styles from "@/components/dashboard/dashboard.module.css";

export default function DashboardLoading() {
	return <div className={styles.loadingPage} aria-label="Loading dashboard"><div className={`${styles.loadingTitle} skeleton`} /><div className={`${styles.loadingBanner} skeleton`} /><div className={styles.loadingGrid}>{[0, 1, 2].map((item) => <div key={item} className={`${styles.loadingCard} skeleton`} />)}</div></div>;
}
