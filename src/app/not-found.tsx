import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
	return (
		<main className={styles.page}>
			<nav>
				<Link href="/" className={styles.brand}><span>404</span> agent-404</Link>
			</nav>
			<section className={styles.content}>
				<div className={styles.copy}>
					<p>HTTP 404 · no indexed route</p>
					<h1>This path ends here. You do not have to.</h1>
					<p>
						The requested page is not part of agent-404. These are the closest product destinations we can
						verify.
					</p>
					<div className={styles.actions}>
						<Link href="/">Product overview</Link>
						<Link href="/demo">Live recovery inspector</Link>
						<Link href="/dashboard">Dashboard</Link>
					</div>
				</div>
				<div className={styles.trace} aria-label="Unresolved recovery trace">
					<div><span>01</span><strong>404 request</strong><code>current path</code></div>
					<div><span>02</span><strong>Matcher</strong><code>no indexed match</code></div>
					<div data-muted="true"><span>03</span><strong>Link / JSON-LD</strong><code>not attached</code></div>
					<div data-muted="true"><span>04</span><strong>Destination</strong><code>choose a verified route</code></div>
				</div>
			</section>
		</main>
	);
}
