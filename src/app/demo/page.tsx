import type { Metadata } from "next";
import Link from "next/link";
import { DemoInspector } from "./demo-inspector";
import styles from "./demo.module.css";

export const metadata: Metadata = {
	title: "Live recovery inspector — agent-404",
	description:
		"Inspect ranked recovery destinations, Link headers, JSON-LD, and an AI crawler trace for a broken documentation URL.",
};

export default function DemoPage() {
	return (
		<main className={styles.page}>
			<header className={styles.nav}>
				<Link className={styles.brand} href="/">
					<span>404</span> agent-404
				</Link>
				<div className={styles.navContext}>Recovery inspector</div>
				<nav aria-label="Demo navigation">
					<Link href="/">Home</Link>
					<Link href="/dashboard">Dashboard</Link>
				</nav>
			</header>
			<section className={styles.intro}>
				<div>
					<p>Live protocol workbench</p>
					<h1>Follow a broken URL through recovery.</h1>
				</div>
				<p>
					Choose a known documentation move for an instant trace, or probe a URL on your own domain. The
					inspector keeps ranking, protocol evidence, and crawler behavior in one view.
				</p>
			</section>
			<DemoInspector />
		</main>
	);
}
