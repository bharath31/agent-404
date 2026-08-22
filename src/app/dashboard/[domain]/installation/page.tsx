import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckIcon, WarningIcon } from "@/components/dashboard/icons";
import { CopyButton } from "@/components/dashboard/copy-button";
import { InstallationSnippets, MatcherDryRun, ProbeTerminal, VerifyDomainButton } from "@/components/dashboard/installation-controls";
import { ReindexButton } from "@/components/dashboard/reindex-button";
import { dashboardDomain, getDashboardContext } from "@/components/dashboard/server-context";
import { DashboardUnavailable, PageIntro, Section, StatusBadge, formatDate } from "@/components/dashboard/ui";
import { deriveInstallState } from "@/lib/install-state";
import styles from "@/components/dashboard/dashboard.module.css";

type Props = { params: Promise<{ domain: string }> };
export const metadata: Metadata = { title: "Installation" };

export default async function InstallationPage({ params }: Props) {
	const context = await getDashboardContext();
	if (!context.storage) return <DashboardUnavailable />;
	const domain = dashboardDomain((await params).domain);
	let installation;
	let overview;
	try { [installation, overview] = await Promise.all([context.storage.getSiteInstallation(domain, context.owner.sub), context.storage.getSiteOverview(domain, context.owner.sub)]); }
	catch (error) { console.error("Installation load failed", error); return <DashboardUnavailable />; }
	if (!installation || !overview) notFound();

	const installState = deriveInstallState({
		verified: installation.site.verified,
		pageCount: installation.pageCount,
		latestProbe: installation.latestProbe,
		fourOhFoursLast30d: overview.metrics.suggestions30d,
		recovery: { total: overview.metrics.suggestions30d, recovered: overview.metrics.recovered30d, rate: overview.metrics.recoveryRate30d ?? 0 },
	});
	const tone = installState.badgeTone === "success" ? "live" : installState.badgeTone === "danger" ? "danger" : installState.badgeTone === "warning" ? "warning" : "neutral";

	return <>
		<PageIntro eyebrow="Setup and diagnosis" title="Installation" description={installState.statusLine} actions={<StatusBadge tone={tone}>{installState.badge}</StatusBadge>} />
		<Section title="Lifecycle" description="Each stage is backed by observed evidence, not configuration alone."><ol className={styles.lifecycle}>{installState.steps.map((step, index) => <li key={step.id} className={step.tone === "ok" ? styles.stepDone : step.tone === "problem" ? styles.stepProblem : undefined}><span>{step.done ? <CheckIcon size={13}/> : index + 1}</span><div><strong>{step.label}</strong><small>{step.hint}</small></div></li>)}</ol></Section>

		{installation.site.verified ? null : <Section title="Verify domain ownership" description="Publish either proof, then check again. Verification starts the first sitemap index.">
			<div className={styles.verificationGrid}>
				<div><p>DNS TXT record</p><dl><div><dt>Name</dt><dd><code>{installation.verification.dnsTxt.name}</code><CopyButton value={installation.verification.dnsTxt.name}/></dd></div><div><dt>Value</dt><dd><code>{installation.verification.dnsTxt.value}</code><CopyButton value={installation.verification.dnsTxt.value}/></dd></div></dl></div>
				<div><p>Well-known file</p><dl><div><dt>URL</dt><dd><code>{installation.verification.wellKnown.url}</code><CopyButton value={installation.verification.wellKnown.url}/></dd></div><div><dt>Body</dt><dd><code>{installation.verification.wellKnown.body}</code><CopyButton value={installation.verification.wellKnown.body}/></dd></div></dl></div>
			</div><VerifyDomainButton siteId={installation.site.id} />
		</Section>}

		<Section title="Install the HTTP adapter" description="Choose the boundary that can inspect a real 404 response. The public key below is read-only and safe in client configuration."><InstallationSnippets siteId={installation.site.id} publicKey={installation.site.publicKey}/></Section>

		<div className={styles.installTwoCol}>
			<Section title="Live 404 check" description={installation.latestProbe ? `Last checked ${formatDate(installation.latestProbe.probedAt, "full")}.` : "No live check has been recorded."}><ProbeTerminal siteId={installation.site.id} domain={installation.site.domain} /></Section>
			<Section title="Index freshness" description={installation.lastIndexedAt ? `Last page observed ${formatDate(installation.lastIndexedAt, "full")}.` : "No pages have been indexed yet."}><div className={styles.indexSummary}><strong className="mono">{installation.pageCount.toLocaleString("en")}</strong><span>indexed pages</span><p>{installation.reindexRequestedAt ? `Resync queued ${formatDate(installation.reindexRequestedAt, "full")}.` : "Sitemap inventory refreshes after verification and on schedule."}</p><ReindexButton siteId={installation.site.id}/></div></Section>
		</div>

		{installState.stateId === "install_broken" || installState.stateId === "soft_404" || installState.stateId === "probe_failed" ? <Remediation state={installState.stateId} domain={installation.site.domain} /> : null}

		<Section title="Matcher dry run" description="Test a missing URL against the current indexed inventory without changing your site."><MatcherDryRun publicKey={installation.site.publicKey} domain={installation.site.domain}/></Section>
		<Section title="Hand this to your coding agent" description="A scoped prompt with this site’s public credential and the exact verification target."><div className={styles.agentPrompt}><div aria-hidden="true">⌁</div><div><strong>Install agent-404 for {installation.site.domain}</strong><p>The prompt asks the agent to detect your framework, install the correct adapter, preserve real 404 statuses, and validate protocol evidence.</p></div><CopyButton className={styles.buttonSecondary} label="Copy setup prompt" value={agentPrompt(installation.site)} /></div></Section>
	</>;
}

function Remediation({ state, domain }: { state: "install_broken" | "soft_404" | "probe_failed"; domain: string }) {
	const content = state === "install_broken" ? { title: "The HTTP adapter is not intercepting 404s", text: "Confirm the adapter runs after your application resolves a missing route, uses the public key, and targets https://www.agent404.dev without an apex redirect." } : state === "soft_404" ? { title: "Missing routes return a successful status", text: "Configure your framework to return HTTP 404 before the adapter runs. A branded not-found body with HTTP 200 is still a soft 404 to crawlers." } : { title: "The site could not be reached", text: "Check DNS, TLS, deployment health, and edge access rules for ClaudeBot-shaped requests, then run the live check again." };
	return <aside className={styles.remediation}><WarningIcon size={19}/><div><p className={styles.eyebrow}>Diagnosis for {domain}</p><h2>{content.title}</h2><p>{content.text}</p></div></aside>;
}

function agentPrompt(site: { id: string; domain: string; publicKey: string }): string {
	return `Install and verify agent-404 for ${site.domain}.\n\nSite ID: ${site.id}\nPublic key: ${site.publicKey}\nCanonical API: https://www.agent404.dev\n\nInspect the project framework. Install the matching @agent404 adapter at the HTTP boundary, keep genuine 404 status codes, and use the public key above. Then request a missing path with ClaudeBot/1.0 and confirm the response includes a Link header or recovery JSON-LD. Do not use or request a secret write key.`;
}
