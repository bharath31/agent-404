"use client";

import { useState, type FormEvent } from "react";
import styles from "./public.module.css";

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const integrations = {
	next: {
		label: "Next.js",
		file: "proxy.ts",
		code: `import { agent404 } from "@agent404/next";

export const proxy = agent404({
  publicKey: process.env.AGENT404_PUBLIC_KEY!,
  siteId: process.env.AGENT404_SITE_ID!,
});`,
	},
	cloudflare: {
		label: "Cloudflare",
		file: "worker.ts",
		code: `import { agent404Worker } from "@agent404/cloudflare";

export default agent404Worker({
  publicKey: env.AGENT404_PUBLIC_KEY,
  siteId: env.AGENT404_SITE_ID,
});`,
	},
	express: {
		label: "Express",
		file: "app.ts",
		code: `import { agent404Express } from "@agent404/express";

app.use(agent404Express({
  publicKey: process.env.AGENT404_PUBLIC_KEY,
  siteId: process.env.AGENT404_SITE_ID,
}));`,
	},
	script: {
		label: "Script tag",
		file: "index.html",
		code: `<script
  src="https://www.agent404.dev/agent-404.min.js"
  data-site-id="YOUR_SITE_ID"
  data-public-key="pk_..."
  defer
></script>`,
	},
} as const;

type Integration = keyof typeof integrations;

function normalizeDomain(value: string): string | null {
	const normalized = value.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
	return DOMAIN_RE.test(normalized) ? normalized : null;
}

export function DomainStartForm() {
	const [error, setError] = useState("");

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const domain = normalizeDomain(String(data.get("domain") || ""));
		if (!domain) {
			setError("Enter a domain such as docs.example.com.");
			return;
		}
		setError("");
		void fetch("/api/funnel/install-cta", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ domain, source: "landing_hero" }),
			keepalive: true,
		}).catch(() => undefined);
		const destination = `/dashboard?register=${encodeURIComponent(domain)}`;
		window.location.assign(`/auth/login?return_to=${encodeURIComponent(destination)}`);
	}

	return (
		<div>
			<form className={styles.domainForm} onSubmit={submit} noValidate>
				<label className={styles.srOnly} htmlFor="landing-domain">
					Documentation domain
				</label>
				<span className={styles.formProtocol} aria-hidden="true">
					https://
				</span>
				<input
					id="landing-domain"
					name="domain"
					autoComplete="url"
					placeholder="docs.yourcompany.com"
					aria-describedby={error ? "landing-domain-error" : "landing-domain-help"}
					aria-invalid={Boolean(error)}
				/>
				<button type="submit">Add your site</button>
			</form>
			{error ? (
				<p className={styles.formError} id="landing-domain-error" role="alert">
					{error}
				</p>
			) : (
				<p className={styles.formHelp} id="landing-domain-help">
					Free to start · no credit card · sitemap sync included
				</p>
			)}
		</div>
	);
}

export function IntegrationWorkbench() {
	const [active, setActive] = useState<Integration>("next");
	const [copied, setCopied] = useState(false);
	const selected = integrations[active];

	async function copy() {
		await navigator.clipboard.writeText(selected.code);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1600);
	}

	return (
		<div className={styles.integrationWorkbench}>
			<div className={styles.integrationTabs} role="tablist" aria-label="Framework integration">
				{(Object.keys(integrations) as Integration[]).map((key) => (
					<button
						key={key}
						type="button"
						role="tab"
						aria-selected={active === key}
						className={active === key ? styles.activeTab : undefined}
						onClick={() => {
							setActive(key);
							setCopied(false);
						}}
					>
						{integrations[key].label}
					</button>
				))}
			</div>
			<div className={styles.codeTopline}>
				<span>{selected.file}</span>
				<button type="button" onClick={copy} aria-live="polite">
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			<pre className={styles.codeBlock} tabIndex={0}>
				<code>{selected.code}</code>
			</pre>
		</div>
	);
}
