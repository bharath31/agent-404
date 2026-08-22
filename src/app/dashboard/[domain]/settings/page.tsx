import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/dashboard/copy-button";
import { AddSiteButton } from "@/components/dashboard/site-switcher";
import { dashboardDomain, getDashboardContext } from "@/components/dashboard/server-context";
import { DeleteSiteControl, RotateKeyControl } from "@/components/dashboard/settings-controls";
import { DashboardUnavailable, PageIntro, Section, StatusBadge, formatDate } from "@/components/dashboard/ui";
import styles from "@/components/dashboard/dashboard.module.css";

type Props = { params: Promise<{ domain: string }> };
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: Props) {
	const context = await getDashboardContext();
	if (!context.storage) return <DashboardUnavailable />;
	const domain = dashboardDomain((await params).domain);
	let settings;
	try { settings = await context.storage.getSiteSettings(domain, context.owner.sub); }
	catch (error) { console.error("Site settings load failed", error); return <DashboardUnavailable />; }
	if (!settings) notFound();

	return <>
		<PageIntro eyebrow="Site configuration" title="Settings" description={`Identity and credentials for ${settings.site.domain}.`} />
		<Section title="Site identity" description="The registered domain is immutable so its recovery history stays trustworthy.">
			<dl className={styles.settingsList}><div><dt>Domain</dt><dd><code>{settings.site.domain}</code><StatusBadge tone={settings.site.verified ? "live" : "unverified"}>{settings.site.verified ? "Verified" : "Unverified"}</StatusBadge></dd></div><div><dt>Site ID</dt><dd><code>{settings.site.id}</code><CopyButton value={settings.site.id}/></dd></div><div><dt>Created</dt><dd>{formatDate(settings.site.createdAt, "full")}</dd></div></dl>
		</Section>

		<Section title="Replace the domain" description="Domain changes are staged to keep the current site and its history intact until the replacement is live.">
			<div className={styles.stagedFlow}><ol><li><span>1</span><div><strong>Register a separate site</strong><p>Add the replacement domain with its own identity and keys.</p></div></li><li><span>2</span><div><strong>Verify and install</strong><p>Confirm the new domain serves recovery before moving traffic.</p></div></li><li><span>3</span><div><strong>Remove this site</strong><p>Delete the old domain only after the cutover is complete.</p></div></li></ol><AddSiteButton className={styles.buttonSecondary}>Add replacement site</AddSiteButton></div>
		</Section>

		<Section title="Credentials" description="Secret and public keys rotate independently. The prior key remains valid for a 24-hour deployment overlap.">
			<div className={styles.credentialGrid}>
				<div><header><div><p>Secret write key</p><span>Registration and indexing</span></div><code>key_••••••••••••</code></header><RotateKeyControl siteId={settings.site.id} kind="secret" overlapExpiresAt={settings.rotation.secretOverlapExpiresAt}/></div>
				<div><header><div><p>Public read key</p><span>Runtime suggestions</span></div><code>{settings.site.publicKey}</code></header><div className={styles.publicKeyCopy}><CopyButton value={settings.site.publicKey}/></div><RotateKeyControl siteId={settings.site.id} kind="public" overlapExpiresAt={settings.rotation.publicOverlapExpiresAt}/></div>
			</div>
		</Section>

		<section className={styles.dangerZone}><header><div><h2>Delete site</h2><p>Permanently removes indexed pages, activity, probes, and every credential for this site. Independent public audit reports remain.</p></div><span>Danger zone</span></header><DeleteSiteControl siteId={settings.site.id} domain={settings.site.domain}/></section>
	</>;
}
