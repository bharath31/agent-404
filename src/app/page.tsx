import type { Metadata } from "next";
import Link from "next/link";
import { DomainStartForm, IntegrationWorkbench } from "./landing-client";
import styles from "./public.module.css";

export const metadata: Metadata = {
	title: "agent-404 — Self-healing 404s for AI agents & crawlers",
	description:
		"Prevent AI agents from hallucinating on dead links. agent-404 answers any 404 at the HTTP layer with RFC Link headers and JSON-LD recovery evidence.",
};

const Arrow = () => <span aria-hidden="true">↗</span>;

export default function LandingPage() {
	return (
		<main className={styles.publicPage}>
			<header className={styles.publicNav}>
				<Link className={styles.brand} href="/" aria-label="agent-404 home">
					<span className={styles.brandMark}>404</span>
					<span>agent-404</span>
				</Link>
				<nav aria-label="Primary navigation">
					<Link href="/demo">Live audit</Link>
					<a href="https://github.com/bharath31/agent-404" target="_blank" rel="noreferrer">
						GitHub <Arrow />
					</a>
					<Link className={styles.navButton} href="/auth/login?return_to=/dashboard">
						Dashboard
					</Link>
				</nav>
			</header>

			<section className={styles.hero}>
				<div className={styles.heroCopy}>
					<p className={styles.eyebrow}>
						<span className={styles.liveDot} aria-hidden="true" /> Self-healing 404s for AI agents &amp; crawlers
					</p>
					<h1>
						Your pages moved.
						<span>AI agents still get the right answer.</span>
					</h1>
					<p className={styles.heroDescription}>
						agent-404 answers dead URLs at the HTTP layer — docs, product, pricing, any page in your
						sitemap. Cursor, Claude, and search bots get the closest live page in a Link header and
						JSON-LD, while your 404 stays an honest 404. Three lines of middleware, under 25ms at the edge.
					</p>
					<DomainStartForm />
					<ul className={styles.proofStrip} aria-label="Product highlights">
						<li><strong>3 lines</strong> of middleware</li>
						<li><strong>&lt;25ms</strong> edge resolution</li>
						<li><strong>60s</strong> to install</li>
						<li><strong>MIT</strong> open source</li>
					</ul>
				</div>

				<div className={styles.heroEvidence} aria-label="Live recovery protocol trace">
					<div className={styles.evidenceTopbar}>
						<span>request trace</span>
						<span className={styles.monoMuted}>edge · 18ms</span>
					</div>
					<div className={styles.requestLine}>
						<span className={styles.method}>GET</span>
						<code>/api/v1/authentication</code>
						<span className={styles.status404}>404</span>
					</div>
					<div className={styles.traceRail}>
						<div className={styles.traceStep}>
							<span>01</span>
							<div>
								<strong>Matcher</strong>
								<code>96.4% · moved</code>
							</div>
						</div>
						<div className={styles.traceStep}>
							<span>02</span>
							<div>
								<strong>Recovery evidence</strong>
								<code>Link + JSON-LD</code>
							</div>
						</div>
						<div className={`${styles.traceStep} ${styles.traceDestination}`}>
							<span>03</span>
							<div>
								<strong>Followed destination</strong>
								<code>/api/v2/auth</code>
							</div>
						</div>
					</div>
					<pre className={styles.responseEvidence}>
						<code>{`HTTP/1.1 404 Not Found\nLink: </api/v2/auth>; rel="alternate"\nX-Agent-404-Match: moved\nX-Agent-404-Score: 0.964`}</code>
					</pre>
				</div>
			</section>

			<section className={styles.agentBand} aria-label="Compatible AI agents">
				<span>Recovers the agents that still remember your old URLs</span>
				<ul>
					<li>ClaudeBot</li>
					<li>GPTBot</li>
					<li>PerplexityBot</li>
					<li>Cursor</li>
					<li>Browser agents</li>
				</ul>
			</section>

			<section className={styles.protocolSection}>
				<div className={styles.sectionHeading}>
					<p className={styles.kicker}>The recovery contract</p>
					<h2>A 404 can be both honest and useful.</h2>
					<p>
						Keep the correct HTTP status. Attach the evidence an automated client needs to recover in one
						hop. Measure whether it followed.
					</p>
				</div>
				<ol className={styles.protocolGrid}>
					<li>
						<span>404 request</span>
						<strong>Intercept the dead route</strong>
						<p>The adapter runs only after your application resolves the request as missing.</p>
					</li>
					<li>
						<span>Matcher</span>
						<strong>Rank the current sitemap</strong>
						<p>Path, language, metadata, and semantic signals pick the closest live document.</p>
					</li>
					<li>
						<span>Link / JSON-LD</span>
						<strong>Return portable evidence</strong>
						<p>Standards-based hints work across crawlers instead of requiring a product-specific client.</p>
					</li>
					<li>
						<span>Destination</span>
						<strong>Observe the recovery</strong>
						<p>The dashboard connects the suggestion to the follow so you can see what was actually saved.</p>
					</li>
				</ol>
			</section>

			<section className={styles.installSection}>
				<div className={styles.sectionHeading}>
					<p className={styles.kicker}>Install at the boundary</p>
					<h2>Small adapter. Managed recovery index.</h2>
					<p>
						Keep the integration beside routing. agent-404 handles sitemap synchronization, matching,
						telemetry, and operator diagnostics.
					</p>
					<Link className={styles.textLink} href="/demo">
						Inspect a live response <Arrow />
					</Link>
				</div>
				<IntegrationWorkbench />
			</section>

			<section className={styles.operatingSection}>
				<div className={styles.sectionHeading}>
					<p className={styles.kicker}>Operate it like infrastructure</p>
					<h2>One place to answer “is recovery working?”</h2>
				</div>
				<div className={styles.operatingGrid}>
					<article>
						<span className={styles.moduleLabel}>Portfolio</span>
						<h3>Every site, one status each</h3>
						<p>Switch between domains without stacking dashboards or mixing one site’s evidence into another.</p>
					</article>
					<article>
						<span className={styles.moduleLabel}>Diagnosis</span>
						<h3>One recommended next action</h3>
						<p>Verification, indexing, install health, and recovery have distinct remediation paths.</p>
					</article>
					<article>
						<span className={styles.moduleLabel}>Evidence</span>
						<h3>Inspect the protocol, not a vanity score</h3>
						<p>See the request, alternate destination, agent category, latency, and follow outcome.</p>
					</article>
				</div>
			</section>

			<section className={styles.finalCta}>
				<div>
					<p className={styles.kicker}>Your next broken link can recover itself</p>
					<h2>Give old URLs a route forward.</h2>
				</div>
				<div className={styles.finalActions}>
					<Link className={styles.primaryButton} href="/auth/login?return_to=/dashboard">
						Claim your domain
					</Link>
					<Link className={styles.secondaryButton} href="/demo">
						Run an audit
					</Link>
				</div>
			</section>

			<footer className={styles.publicFooter}>
				<span className={styles.brand}>agent-404</span>
				<span>Open source adapters · Managed recovery infrastructure</span>
				<div>
					<Link href="/llms.txt">llms.txt</Link>
					<a href="https://github.com/bharath31/agent-404" target="_blank" rel="noreferrer">
						Source
					</a>
				</div>
			</footer>
		</main>
	);
}
