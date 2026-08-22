"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckIcon, CopyIcon, RefreshIcon, TerminalIcon } from "./icons";
import styles from "./dashboard.module.css";

export function VerifyDomainButton({ siteId }: { siteId: string }) {
	const router = useRouter();
	const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
	const [message, setMessage] = useState<string | null>(null);
	async function verify() {
		setState("busy"); setMessage(null);
		try {
			const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/verify`, { method: "POST" });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error ?? "Ownership proof was not found yet.");
			setState("done"); setMessage("Domain verified"); router.refresh();
		} catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Ownership proof was not found yet."); }
	}
	return <div className={styles.inlineAction}><button className={styles.buttonPrimary} type="button" onClick={verify} disabled={state === "busy"}>{state === "done" ? <CheckIcon size={13}/> : <RefreshIcon size={13}/>} {state === "busy" ? "Checking…" : state === "done" ? "Verified" : "Check verification"}</button>{message ? <span className={state === "error" ? styles.actionError : styles.actionSuccess} role="status">{message}</span> : null}</div>;
}

export function ProbeTerminal({ siteId, domain, initialPath = "/agent-404-check" }: { siteId: string; domain: string; initialPath?: string }) {
	const router = useRouter();
	const [path, setPath] = useState(initialPath);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{ status?: number; verdict?: string; hasLinkHeaders?: boolean; hasJsonLd?: boolean; headers?: string; bodySnippet?: string; summary?: string } | null>(null);
	const [error, setError] = useState<string | null>(null);
	async function probe(event: React.FormEvent) {
		event.preventDefault(); setBusy(true); setError(null);
		try {
			const response = await fetch("/api/dashboard/probe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, path }) });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error ?? "The live probe could not run.");
			setResult(data.probe ?? data); router.refresh();
		} catch (caught) { setError(caught instanceof Error ? caught.message : "The live probe could not run."); }
		finally { setBusy(false); }
	}
	return <div className={styles.probeBox}>
		<form onSubmit={probe} className={styles.probeForm}><div className={styles.probeUrl}><span className="mono">https://{domain}</span><input value={path} onChange={(event) => setPath(event.target.value)} aria-label="Dead path to probe" pattern="/.*" maxLength={120} /></div><button type="submit" className={styles.buttonPrimary} disabled={busy}><TerminalIcon size={13}/>{busy ? "Probing…" : "Run live check"}</button></form>
		{error ? <p className={styles.formError} role="alert">{error}</p> : null}
		{result ? <div className={styles.terminalResult} aria-live="polite"><header><span className={result.verdict === "recovered_404" ? styles.terminalOk : styles.terminalWarn}>HTTP {result.status ?? "—"}</span><code>{result.verdict?.replaceAll("_", " ")}</code></header><pre>{`$ curl -sI https://${domain}${path} -A "ClaudeBot/1.0"\n${result.headers || `(Link: ${result.hasLinkHeaders ? "detected" : "not present"})`}\n\nJSON-LD: ${result.hasJsonLd ? "detected" : "not detected"}${result.bodySnippet ? `\n\n${result.bodySnippet}` : ""}`}</pre>{result.summary ? <p>{result.summary}</p> : null}</div> : <div className={styles.terminalIdle}><span className="mono">$</span><p>Run a crawler-shaped request against a real missing path. The exchange is saved as installation evidence.</p></div>}
	</div>;
}

type Framework = "next" | "cloudflare" | "express" | "html";

export function InstallationSnippets({ siteId, publicKey }: { siteId: string; publicKey: string }) {
	const [framework, setFramework] = useState<Framework>("next");
	const [copied, setCopied] = useState(false);
	const snippets = useMemo<Record<Framework, { name: string; file: string; code: string }>>(() => ({
		next: { name: "Next.js", file: "middleware.ts", code: `import { agent404 } from "@agent404/next";\n\nexport const middleware = agent404({\n  apiKey: process.env.AGENT404_PUBLIC_KEY ?? "${publicKey}",\n});\n\nexport const config = {\n  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],\n};` },
		cloudflare: { name: "Cloudflare", file: "worker.ts", code: `import { agent404Worker } from "@agent404/cloudflare";\n\nexport default agent404Worker({\n  apiKey: "${publicKey}", // public, read-only\n});` },
		express: { name: "Express", file: "server.ts", code: `import { recoverExpress404 } from "@agent404/express";\n\napp.use(async (req, res) => {\n  const recovered = await recoverExpress404(req, "<h1>Not Found</h1>", {\n    apiKey: process.env.AGENT404_PUBLIC_KEY ?? "${publicKey}",\n  });\n  res.status(404);\n  recovered.headers.forEach((value, name) => res.setHeader(name, value));\n  res.send(await recovered.text());\n});` },
		html: { name: "HTML", file: "before </body>", code: `<script\n  src="https://www.agent404.dev/agent-404.min.js"\n  data-site-id="${siteId}"\n  data-public-key="${publicKey}"\n  defer\n></script>` },
	}), [publicKey, siteId]);
	async function copy() { await navigator.clipboard.writeText(snippets[framework].code); setCopied(true); setTimeout(() => setCopied(false), 1500); }
	return <div className={styles.snippetBox}>
		<div className={styles.snippetTabs} role="tablist" aria-label="Framework snippet">{(Object.keys(snippets) as Framework[]).map((key) => <button type="button" role="tab" aria-selected={framework === key} key={key} onClick={() => setFramework(key)}>{snippets[key].name}</button>)}</div>
		<div className={styles.codePanel}><header><code>{snippets[framework].file}</code><button type="button" onClick={copy}>{copied ? <CheckIcon size={13}/> : <CopyIcon size={13}/>} {copied ? "Copied" : "Copy"}</button></header><pre><code>{snippets[framework].code}</code></pre></div>
		{framework === "html" ? <p className={styles.codeCaveat}>Browser scripts improve human 404s, but crawlers do not execute JavaScript. Use an HTTP adapter when AI recovery matters.</p> : null}
	</div>;
}

export function MatcherDryRun({ publicKey, domain }: { publicKey: string; domain: string }) {
	const [path, setPath] = useState("/docs/old-guide");
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{ deadUrl?: string; suggestions?: { url: string; title: string; score: number; matchType: string }[] } | null>(null);
	const [error, setError] = useState<string | null>(null);
	async function run(event: React.FormEvent) {
		event.preventDefault(); setBusy(true); setError(null);
		try {
			const url = `https://${domain}${path.startsWith("/") ? path : `/${path}`}`;
			const response = await fetch("/api/suggest", { method: "POST", headers: { "content-type": "application/json", "x-api-key": publicKey }, body: JSON.stringify({ url }) });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error ?? "The matcher could not run.");
			setResult(data);
		} catch (caught) { setError(caught instanceof Error ? caught.message : "The matcher could not run."); }
		finally { setBusy(false); }
	}
	return <div className={styles.dryRun}><form onSubmit={run}><label><span className="mono">{domain}</span><input value={path} onChange={(event) => setPath(event.target.value)} aria-label="Missing URL path" /></label><button className={styles.buttonSecondary} type="submit" disabled={busy}>{busy ? "Matching…" : "Test matcher"}</button></form>{error ? <p className={styles.formError} role="alert">{error}</p> : null}{result ? <div className={styles.dryResults}>{result.suggestions?.length ? result.suggestions.slice(0, 3).map((suggestion) => <div key={suggestion.url}><span className="mono">{Math.round(suggestion.score * 100)}%</span><div><strong>{suggestion.title}</strong><code>{suggestion.url}</code></div><small>{suggestion.matchType}</small></div>) : <p>No indexed page was a confident match. Try a path closer to an existing page.</p>}</div> : null}</div>;
}
