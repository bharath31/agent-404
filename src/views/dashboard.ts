import { CANONICAL_SCRIPT_URL } from "../config.js";
import type { DashboardData, DashboardSiteData } from "../types.js";

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function truncate(str: string, max: number): string {
	return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
}

/**
 * Single source of truth for the install snippet preview and copy attributes.
 * Never embeds apiKey (secret write key).
 */
function rawScriptSnippet(site: Pick<DashboardSiteData, "id" | "publicKey">): string {
	return `<script
  src="${CANONICAL_SCRIPT_URL}"
  data-site-id="${site.id}"
  data-public-key="${site.publicKey}"
  defer
></script>`;
}

function rawNextSnippet(site: Pick<DashboardSiteData, "id" | "publicKey">): string {
	return `import { agent404 } from "@agent404/next";

// The public key is safe to commit — it can only read suggestions.
export const middleware = agent404({
  apiKey: process.env.AGENT404_PUBLIC_KEY ?? "${site.publicKey}",
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};`;
}

function rawCloudflareSnippet(site: Pick<DashboardSiteData, "id" | "publicKey">): string {
	return `import { agent404Worker } from "@agent404/cloudflare";

const agent404 = agent404Worker({
  apiKey: "${site.publicKey}", // public key — safe to commit
});

export default { fetch: agent404.fetch };`;
}

function rawExpressSnippet(site: Pick<DashboardSiteData, "id" | "publicKey">): string {
	return `import { recoverExpress404 } from "@agent404/express";

app.use(async (req, res) => {
  const recovered = await recoverExpress404(req, "<h1>Not Found</h1>", {
    apiKey: "${site.publicKey}",
  });
  res.status(404);
  recovered.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(await recovered.text());
});`;
}

/**
 * Single source of truth for the complete AI coding agent prompt.
 * Tailored with the site's domain, siteId, and publicKey (never secret key).
 */
function rawAgentPrompt(site: Pick<DashboardSiteData, "id" | "publicKey" | "domain">): string {
	return `You are an AI coding assistant. Install and configure agent-404 (https://www.agent404.dev) in this project so that all dead links and 404 responses automatically self-heal and return semantic Link headers + JSON-LD for AI assistants (Claude, GPT, Perplexity) and human users.

### Project Credentials
- **Domain:** ${site.domain}
- **Site ID:** ${site.id}
- **Public Key:** ${site.publicKey}
- **Canonical API Base:** https://www.agent404.dev

### Instructions
1. Inspect the codebase to detect the project framework (Next.js, Cloudflare Workers, Express, or Static HTML).
2. Install the appropriate SDK:
   - Next.js: run \`npm install @agent404/next\` (or pnpm/yarn/bun)
   - Cloudflare Workers: run \`npm install @agent404/cloudflare\`
   - Express: run \`npm install @agent404/express\`
   - Static HTML: insert the \`<script>\` tag from step 3
3. Configure the adapter. The public key is safe to commit — it can only read suggestions.
   - **Next.js (\`middleware.ts\`):**
   \`\`\`typescript
   import { agent404 } from "@agent404/next";

   export const middleware = agent404({
     apiKey: process.env.AGENT404_PUBLIC_KEY ?? "${site.publicKey}",
   });

   export const config = {
     matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
   };
   \`\`\`
   - **Cloudflare Worker (\`worker.ts\`):**
   \`\`\`typescript
   import { agent404Worker } from "@agent404/cloudflare";

   const agent404 = agent404Worker({
     apiKey: "${site.publicKey}", // public key — safe to commit
   });

   export default { fetch: agent404.fetch };
   \`\`\`
   - **Express (\`server.js\` / \`app.ts\`):**
   \`\`\`javascript
   import { recoverExpress404 } from "@agent404/express";

   app.use(async (req, res) => {
     const recovered = await recoverExpress404(req, "<h1>Not Found</h1>", {
       apiKey: process.env.AGENT404_PUBLIC_KEY ?? "${site.publicKey}",
     });
     res.status(404);
     recovered.headers.forEach((v, k) => res.setHeader(k, v));
     res.send(await recovered.text());
   });
   \`\`\`
   - **HTML Script Tag (browser-only — AI crawlers don't run JavaScript):**
   \`\`\`html
   <script
     src="${CANONICAL_SCRIPT_URL}"
     data-site-id="${site.id}"
     data-public-key="${site.publicKey}"
     defer
   ></script>
   \`\`\`
4. Set the environment variable in \`.env\` (or your host's env config):
   \`\`\`env
   AGENT404_PUBLIC_KEY="${site.publicKey}"
   \`\`\`
5. Verify the installation:
   - Run \`curl -sI https://${site.domain}/some-dead-path -A "ClaudeBot/1.0"\` and confirm the 404 response includes a \`Link:\` header and schema.org JSON-LD in the body.
   - Or re-run the **Live 404 check** on the dashboard at https://www.agent404.dev/dashboard.
   - Always use \`https://www.agent404.dev\` (not the apex) as the API base to avoid CORS preflight failures.`;
}

function agentOnboardButtonHtml(site: Pick<DashboardSiteData, "id" | "publicKey" | "domain">): string {
	const prompt = rawAgentPrompt(site);
	return `<button type="button" class="btn-agent-onboard" data-copy-agent-prompt="${escapeHtml(prompt)}" title="Copy a setup prompt for Claude Code, Cursor, Windsurf, or Copilot" aria-label="Copy AI agent setup prompt">
  <span class="btn-agent-icon" aria-hidden="true">✨</span>
  <span class="btn-agent-label">Copy AI setup prompt</span>
</button>`;
}

function snippetHtml(site: Pick<DashboardSiteData, "id" | "publicKey">): string {
	return escapeHtml(rawScriptSnippet(site));
}

// --- Diagnosis-specific fix guidance --------------------------------------
//
// The generic rawAgentPrompt() above assumes a from-scratch install. For a
// site whose install is already present but failing (install_broken,
// soft_404, probe_failed), an owner needs a diagnosis, not another copy of
// the setup instructions. renderRemediationPanel() + rawFixPrompt() below
// give a plain-language tip list and a tailored copy-paste agent prompt that
// carries the actual observed evidence from the last live check.

type RemediationStateId = "install_broken" | "soft_404" | "probe_failed";

/** Plain-text curl exchange block, reused inside fix prompts (markdown, not HTML). */
function rawProbeCurlBlock(site: DashboardSiteData): string {
	const probe = site.latestProbe;
	if (!probe) {
		return `No live check has been run yet for ${site.domain}. Run one from the dashboard first, or run:\ncurl -sI https://${site.domain}/some-dead-path -A "ClaudeBot/1.0"`;
	}
	const lines: string[] = [];
	lines.push(`$ curl -sI https://${site.domain}${probe.probePath} -A "ClaudeBot/1.0"`);
	lines.push(`HTTP/2 ${probe.status}`);
	if (probe.hasLinkHeaders && probe.linkHeader) {
		lines.push(`link: ${probe.linkHeader}`);
	} else {
		lines.push(`(no Link header present)`);
	}
	lines.push(
		probe.hasJsonLd
			? `body: <script type="application/ld+json"> present — schema.org/ItemList`
			: `(no JSON-LD <script> tag present in body)`,
	);
	if (probe.summary) {
		lines.push(`# ${probe.summary}`);
	}
	return lines.join("\n");
}

const REMEDIATION_TIPS: Record<RemediationStateId, string[]> = {
	install_broken: [
		"Confirm the adapter/middleware is actually deployed to production — not just committed. Redeploy and re-run the check.",
		"Confirm no CDN, edge, or reverse-proxy rule (Vercel rewrites, Cloudflare Page Rules, nginx) serves the 404 before your app's middleware runs.",
		"Confirm the middleware's matcher/config isn't excluding the path you tested — a too-narrow `matcher` regex is the most common cause.",
		"Confirm the snippet/adapter targets https://www.agent404.dev, not the apex domain — the apex redirect breaks CORS preflight.",
	],
	soft_404: [
		"Your router/framework must return a real HTTP 404 status for unmatched routes — agent-404 can't intercept a 200.",
		"Check your catch-all / not-found handler: many frameworks default to a 200 status unless you set it explicitly.",
		"If this is a single-page app, check your hosting's rewrite rules — \"rewrite all paths to index.html\" is the most common cause of a soft 404, and needs a framework-level not-found route instead.",
		"Re-run the live check after fixing to confirm the status code flips to 404.",
	],
	probe_failed: [
		"This is usually transient — retry the live check first.",
		"If it keeps failing, confirm the domain resolves and is publicly reachable (not just from your machine or VPN).",
		"Check whether a WAF or bot-protection rule is blocking automated requests — the probe uses a ClaudeBot user agent and a datacenter IP, both of which WAFs sometimes challenge or block.",
		"If the domain was reachable before, check your host/platform's status page for an outage.",
	],
};

const REMEDIATION_TITLES: Record<RemediationStateId, string> = {
	install_broken: "Install not detected — what to check",
	soft_404: "Site returns 200 for missing paths — what to check",
	probe_failed: "Live check couldn't reach your site — what to check",
};

function rawFixPrompt(site: DashboardSiteData, stateId: RemediationStateId): string {
	const evidence = rawProbeCurlBlock(site);
	const diagnosticSteps: Record<RemediationStateId, string> = {
		install_broken: `1. Check whether the agent-404 adapter/middleware is actually present in the deployed build (not just in the repo) — confirm the latest deploy includes it, and redeploy if not.
2. Check for any CDN, edge network, or reverse-proxy rule (Vercel rewrites/redirects, Cloudflare Page Rules, nginx \`try_files\`, etc.) that could be serving the 404 response before the app's own middleware runs.
3. Inspect the middleware's route matcher/config (e.g. Next.js \`config.matcher\`) and confirm it isn't excluding the path that was probed above.
4. Confirm the adapter is configured with API base \`https://www.agent404.dev\` (not the apex \`agent404.dev\`) — the apex redirect breaks the CORS preflight the client script depends on.`,
		soft_404: `1. Find the route/handler that serves the path probed above and check what HTTP status it returns — it is very likely 200 when it should be 404.
2. If this is a framework with file-based routing, confirm a proper not-found/catch-all route exists and explicitly sets the response status to 404 (many frameworks default to 200).
3. If this is a static/SPA deployment, check the hosting config (e.g. Vercel \`rewrites\`, Netlify \`_redirects\`, S3/CloudFront) for a "serve index.html for all paths" rule — that's the most common cause, and it needs to be replaced with a real not-found route.
4. After fixing, re-run the curl command above and confirm the status line changes from 200 to 404.`,
		probe_failed: `1. Re-run the curl command above once or twice — this failure mode is frequently a transient network blip.
2. If it fails consistently, confirm \`${site.domain}\` resolves via DNS and is reachable from outside your network (not just your machine/VPN).
3. Check for a WAF, bot-protection layer, or rate limiter that could be blocking the request — it was made with a ClaudeBot user agent from a datacenter IP, a combination some WAFs challenge or block by default. Look for an allowlist rule you can add.
4. Check your hosting provider's status page in case of a broader outage.`,
	};

	return `You are an AI coding assistant. agent-404 (https://www.agent404.dev) is already installed on this project for ${site.domain}, but the dashboard's live check flagged a problem. Diagnose and fix it — this is NOT a from-scratch install, the integration already exists somewhere in this codebase.

### Project Credentials
- **Domain:** ${site.domain}
- **Site ID:** ${site.id}
- **Public Key:** ${site.publicKey}
- **Canonical API Base:** https://www.agent404.dev

### Observed evidence (last live check)
\`\`\`
${evidence}
\`\`\`

### Diagnosis
${REMEDIATION_TITLES[stateId]}

### Instructions
${diagnosticSteps[stateId]}

### Verify the fix
1. Run \`curl -sI https://${site.domain}/some-dead-path -A "ClaudeBot/1.0"\` and confirm the response now includes a \`Link:\` header and schema.org JSON-LD in the body (for install_broken/soft_404) or simply succeeds (for probe_failed).
2. Re-run the **Live 404 check** on the dashboard at https://www.agent404.dev/dashboard to confirm the state updates.`;
}

function renderRemediationPanel(site: DashboardSiteData): string {
	const stateId = site.installState.stateId;
	if (stateId !== "install_broken" && stateId !== "soft_404" && stateId !== "probe_failed") {
		return "";
	}
	const tips = REMEDIATION_TIPS[stateId];
	const fixPrompt = rawFixPrompt(site, stateId);
	const tipItems = tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("\n");
	return `
  <!-- Remediation: actionable next steps for a broken/degraded install -->
  <div class="section-block remediation-block tone-danger-block" id="remediation-${escapeHtml(site.id)}">
    <div class="section-title-row">
      <div>
        <h3 class="section-title">${escapeHtml(REMEDIATION_TITLES[stateId])}</h3>
        <p class="section-sub">Specific things to check in your codebase or hosting config — not a repeat of the status above.</p>
      </div>
    </div>
    <ul class="remediation-tip-list">
      ${tipItems}
    </ul>
    <div class="remediation-action-row">
      <button type="button" class="copy-btn copy-btn-primary" data-copy-agent-prompt="${escapeHtml(fixPrompt)}">Copy fix prompt for Claude Code / Cursor / Copilot</button>
    </div>
  </div>`;
}

// --- Owner-facing lifecycle rendering ------------------------------------

const AGENT_UA_NAMES: Array<[RegExp, string]> = [
	[/claudebot|anthropic/i, "ClaudeBot"],
	[/gptbot/i, "GPTBot"],
	[/perplexitybot/i, "PerplexityBot"],
	[/google-extended/i, "Google-Extended"],
	[/applebot-extended/i, "Applebot-Extended"],
	[/ccbot/i, "CCBot"],
	[/bytespider/i, "Bytespider"],
	[/cohere-ai/i, "Cohere"],
	[/diffbot/i, "Diffbot"],
	[/omgili/i, "Omgili"],
	[/facebookexternalhit/i, "Facebook"],
	[/slackbot/i, "Slack"],
	[/twitterbot/i, "X (Twitter)"],
	[/discordbot/i, "Discord"],
	[/telegrambot/i, "Telegram"],
	[/youbot/i, "YouBot"],
	[/googlebot/i, "Googlebot"],
	[/bingbot/i, "Bingbot"],
	[/yandex/i, "Yandex"],
];

function agentLabel(ev: { userAgent: string; agentCategory: string }): string {
	const ua = ev.userAgent || "";
	for (const [re, name] of AGENT_UA_NAMES) {
		if (re.test(ua)) return name;
	}
	switch (ev.agentCategory) {
		case "crawler":
			return "Crawler";
		case "browser_agent":
			return "Browser agent";
		default:
			return "Human";
	}
}

function timeAgo(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime();
	if (Number.isNaN(ms)) return "";
	const m = Math.floor(ms / 60_000);
	if (m < 1) return "just now";
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	return `${Math.floor(d / 30)}mo ago`;
}

function probeVerdictLabel(verdict: string): string {
	switch (verdict) {
		case "recovered_404":
			return "Recovery served";
		case "unrecovered_404":
			return "Bare 404 — no recovery";
		case "non_404":
			return "Soft 404 (site returned 200)";
		default:
			return "Could not reach site";
	}
}

function probeVerdictTone(verdict: string): string {
	switch (verdict) {
		case "recovered_404":
			return "success";
		case "unrecovered_404":
			return "danger";
		case "non_404":
			return "warning";
		default:
			return "warning";
	}
}

/** The terminal body for a stored probe — the raw HTTP exchange, verbatim. */
function terminalProbeLines(site: DashboardSiteData): string {
	const probe = site.latestProbe;
	if (!probe) {
		return `<div class="term-line term-muted">Run a live check to fetch a dead URL on ${escapeHtml(site.domain)} as ClaudeBot and see the response.</div>`;
	}
	const lines: string[] = [];
	lines.push(
		`<div class="term-line"><span class="term-prompt">$</span> curl -sI <span class="term-dim">https://${escapeHtml(site.domain)}</span>${escapeHtml(probe.probePath)} <span class="term-dim">-A "ClaudeBot/1.0"</span></div>`,
	);
	lines.push(
		`<div class="term-line ${probe.status === 404 ? "" : "term-amber"}">HTTP/2 ${probe.status}</div>`,
	);
	if (probe.hasLinkHeaders && probe.linkHeader) {
		lines.push(`<div class="term-line term-green">link: ${escapeHtml(probe.linkHeader)}</div>`);
	}
	if (probe.hasJsonLd) {
		lines.push(`<div class="term-line term-green">body: &lt;script type="application/ld+json"&gt; — schema.org/ItemList</div>`);
	}
	if (probe.verdict === "unrecovered_404") {
		lines.push(`<div class="term-line term-rose">↳ no Link header, no JSON-LD — the agent gets nothing</div>`);
	}
	if (probe.verdict === "error") {
		lines.push(`<div class="term-line term-rose">↳ ${escapeHtml(probe.summary || "connection error")}</div>`);
	}
	return lines.join("\n");
}

function renderLiveCheckPanel(site: DashboardSiteData): string {
	const probe = site.latestProbe;
	const tone = probe ? probeVerdictTone(probe.verdict) : "neutral";
	const label = probe ? probeVerdictLabel(probe.verdict) : "Not checked yet";
	const text = probe ? probe.summary || probeVerdictLabel(probe.verdict) : "No live check recorded for this domain yet.";
	const meta = probe
		? `checked ${timeAgo(probe.probedAt)} · ${probe.source === "cron" ? "automatic" : "manual"}`
		: "";
	return `
  <!-- Live 404 check: the raw HTTP exchange, as ClaudeBot sees it -->
  <div class="section-block live-check-block" id="live-check-${escapeHtml(site.id)}">
    <div class="section-title-row">
      <div>
        <h3 class="section-title">Live 404 check</h3>
        <p class="section-sub">What ClaudeBot actually receives when it hits a missing page on your domain.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-live-check" data-site-id="${escapeHtml(site.id)}">Run live check</button>
    </div>
    <div class="live-check-grid" data-domain="${escapeHtml(site.domain)}">
      <div class="terminal-mock">
        <div class="terminal-bar">
          <span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span>
          <span class="term-title">probe — claudebot@${escapeHtml(site.domain)}</span>
        </div>
        <div class="terminal-body live-check-terminal">${terminalProbeLines(site)}</div>
      </div>
      <div class="live-check-verdict">
        <div class="live-check-verdict-label tone-${tone}">${escapeHtml(label)}</div>
        <p class="live-check-verdict-text">${escapeHtml(text)}</p>
        ${meta ? `<div class="live-check-meta">${escapeHtml(meta)}</div>` : ""}
        <p class="live-check-note">Browser-only script-tag installs won't appear here — crawlers don't execute JavaScript. The HTTP-layer middleware is what reaches them. If the check fails, also confirm the snippet points at <code>https://www.agent404.dev</code> (the apex redirect breaks CORS preflight).</p>
      </div>
    </div>
  </div>`;
}

function renderLifecycleStrip(site: DashboardSiteData): string {
	const items = site.installState.steps
		.map((step, i) => {
			const marker = step.done ? "\u2713" : step.tone === "problem" ? "\u2715" : "\u25CB";
			return `<div class="step-item step-${step.tone}" role="listitem">
      <span class="step-num" aria-hidden="true">${i + 1}</span>
      <span class="step-label">${escapeHtml(step.label)}</span>
      <span class="step-marker" aria-hidden="true">${marker}</span>
      <span class="step-hint">${escapeHtml(step.hint)}</span>
    </div>`;
		})
		.join("");
	return `<div class="lifecycle-strip" role="list" aria-label="Install progress">${items}</div>`;
}

const CONFIRMED_WORKING_STATES = new Set(["install_live", "serving", "recovering"]);

/**
 * The install snippet tabs (Next.js / Cloudflare / Express / Script Tag /
 * Agent Prompt). Once a fresh live-check probe confirms the install works
 * (install_live, serving, recovering), this is no-longer-actionable
 * boilerplate for the owner — collapse it behind a <details> instead of
 * hiding it entirely, since it's still useful reference (e.g. adding a
 * second framework, or copying the snippet for a teammate).
 */
function integrationPanelHtml(site: DashboardSiteData, index: number): string {
	const body = `<div class="integration-panel">
    <div class="integration-tabs-header">
      <div class="integration-tabs" role="tablist">
        <button type="button" class="tab-btn active" data-tab-target="tab-next-${index}">Next.js</button>
        <button type="button" class="tab-btn" data-tab-target="tab-cf-${index}">Cloudflare</button>
        <button type="button" class="tab-btn" data-tab-target="tab-express-${index}">Express</button>
        <button type="button" class="tab-btn" data-tab-target="tab-script-${index}">Script Tag</button>
        <button type="button" class="tab-btn tab-btn-agent" data-tab-target="tab-agent-${index}">
          <span class="tab-agent-sparkle">✨</span> Agent Prompt
        </button>
      </div>
    </div>

    <div class="tab-content active" id="tab-next-${index}">
      <div class="code-block">
        <div class="code-block-header">
          <span class="code-lang">middleware.ts (Edge / Node)</span>
          <button type="button" class="copy-btn" data-copy="${escapeHtml(rawNextSnippet(site))}">Copy</button>
        </div>
        <pre class="snippet"><code>${escapeHtml(rawNextSnippet(site))}</code></pre>
      </div>
    </div>

    <div class="tab-content" id="tab-cf-${index}">
      <div class="code-block">
        <div class="code-block-header">
          <span class="code-lang">worker.ts (Cloudflare Workers)</span>
          <button type="button" class="copy-btn" data-copy="${escapeHtml(rawCloudflareSnippet(site))}">Copy</button>
        </div>
        <pre class="snippet"><code>${escapeHtml(rawCloudflareSnippet(site))}</code></pre>
      </div>
    </div>

    <div class="tab-content" id="tab-express-${index}">
      <div class="code-block">
        <div class="code-block-header">
          <span class="code-lang">server.js (Express)</span>
          <button type="button" class="copy-btn" data-copy="${escapeHtml(rawExpressSnippet(site))}">Copy</button>
        </div>
        <pre class="snippet"><code>${escapeHtml(rawExpressSnippet(site))}</code></pre>
      </div>
    </div>

    <div class="tab-content" id="tab-script-${index}">
      <div class="code-block">
        <div class="code-block-header">
          <span class="code-lang">HTML &lt;head&gt; or &lt;body&gt;</span>
          <button type="button" class="copy-btn" data-copy="${escapeHtml(rawScriptSnippet(site))}">Copy</button>
        </div>
        <pre class="snippet"><code>${snippetHtml(site)}</code></pre>
      </div>
    </div>

    <div class="tab-content" id="tab-agent-${index}">
      <div class="code-block">
        <div class="code-block-header">
          <div class="agent-tab-badges">
            <span class="code-lang">Prompt for Claude Code, Cursor, Windsurf, Copilot, &amp; Pi</span>
            <a href="/skills/agent-404/SKILL.md" target="_blank" class="agent-skill-link" title="Open SKILL.md specification">SKILL.md &nearr;</a>
          </div>
          <button type="button" class="copy-btn copy-btn-primary" data-copy-agent-prompt="${escapeHtml(rawAgentPrompt(site))}">Copy</button>
        </div>
        <pre class="snippet snippet-markdown"><code>${escapeHtml(rawAgentPrompt(site))}</code></pre>
        <div class="agent-helper-row">
          <div class="agent-tip-pill"><strong>Claude Code:</strong> <code>claude "Install agent-404"</code></div>
          <div class="agent-tip-pill"><strong>Cursor:</strong> Paste into Composer (<code>Cmd+I</code>)</div>
          <div class="agent-tip-pill"><strong>Windsurf:</strong> Paste into Cascade (<code>Cmd+I</code>)</div>
          <div class="agent-tip-pill"><strong>Copilot:</strong> Paste into Copilot Edits</div>
        </div>
      </div>
    </div>
  </div>`;

	if (!CONFIRMED_WORKING_STATES.has(site.installState.stateId)) {
		return `\n  <!-- Integration Snippets -->\n  ${body}`;
	}

	return `\n  <!-- Integration Snippets (confirmed working — collapsed) -->
  <details class="integration-panel-details">
    <summary class="integration-panel-summary">
      <span class="integration-summary-check" aria-hidden="true">✓</span>
      Integration confirmed working — view install snippets
    </summary>
    ${body}
  </details>`;
}

function siteSection(site: DashboardSiteData, index: number): string {
	const mq = site.matchQuality;
	const total =
		mq.matchTypeDistribution.moved +
		mq.matchTypeDistribution.similar +
		mq.matchTypeDistribution.related;
	const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
	const movedPct = pct(mq.matchTypeDistribution.moved);
	const similarPct = pct(mq.matchTypeDistribution.similar);
	const relatedPct = pct(mq.matchTypeDistribution.related);

	// Plain-language read of the resolution bar — the numbers only mean
	// something once interpreted for the owner.
	const distNoteText =
		total === 0
			? ""
			: relatedPct >= 60
				? "Most dead URLs resolve to section pages (like /docs), not a specific page. Adding an llms.txt or more descriptive page titles makes matches more precise."
				: movedPct + similarPct >= 80
					? "Most dead URLs resolve to a specific page — that's the match quality you want."
					: "A mix of specific-page and section-page matches — see below for what lifts precision.";

	const recentRows = site.recentLogs
		.map((log) => {
			const topSuggestion = log.suggestedUrls[0] || "\u2014";
			const scores = log.scores ? JSON.parse(log.scores) : [];
			const topScore = scores[0] != null ? (scores[0] as number).toFixed(3) : "\u2014";
			const scorePercent =
				scores[0] != null ? `${Math.round((scores[0] as number) * 100)}%` : "\u2014";
			const time = new Date(log.createdAt).toLocaleString("en-US", {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
			return `<tr>
				<td class="cell-mono cell-url" title="${escapeHtml(log.deadUrl)}">
					<span class="status-pill status-pill-dead">404</span>
					<span class="url-text">${escapeHtml(truncate(log.deadUrl, 52))}</span>
				</td>
				<td class="cell-mono cell-url" title="${escapeHtml(topSuggestion)}">
					<span class="status-pill status-pill-target">target</span>
					<span class="url-text">${escapeHtml(truncate(topSuggestion, 52))}</span>
				</td>
				<td>
					<span class="score-badge" title="Confidence: ${topScore}">${scorePercent}</span>
				</td>
				<td class="cell-time">${time}</td>
			</tr>`;
		})
		.join("\n");

	const recoveryRows = site.recentRecoveryEvents
		.map((ev) => {
			const top = ev.suggestedUrls[0] || "\u2014";
			const time = new Date(ev.createdAt).toLocaleString("en-US", {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
			const latency =
				ev.recoveryLatencyMs != null
					? ` in ${(ev.recoveryLatencyMs / 1000).toFixed(1)}s`
					: "";
			const outcome = ev.recovered
				? `<span class="outcome-pill outcome-yes">\u2713 followed${latency}</span>`
				: `<span class="outcome-pill outcome-no">served \u00B7 not followed</span>`;
			return `<tr>
				<td class="cell-time">${time}</td>
				<td><span class="agent-chip">${escapeHtml(agentLabel(ev))}</span></td>
				<td class="cell-mono cell-url" title="${escapeHtml(ev.deadUrl)}"><span class="url-text">${escapeHtml(truncate(ev.deadUrl, 46))}</span></td>
				<td class="cell-mono cell-url" title="${escapeHtml(top)}"><span class="url-text">${escapeHtml(truncate(top, 46))}</span></td>
				<td>${outcome}</td>
			</tr>`;
		})
		.join("\n");

	// Owner-facing state: the status line + lifecycle strip in the header
	// answer "is this working?" directly, and the live check panel supplies
	// the evidence. The old alert boxes (domain unverified / no beacons)
	// are superseded by the state machine, which says the same thing with
	// the install context attached.

	const verificationPanel = !site.verified
		? `<div class="section-block" id="verify-${escapeHtml(site.id)}">
    <div class="section-title-row">
      <h3 class="section-title">Verify Domain Ownership</h3>
      <span class="section-meta">Required before indexing starts</span>
    </div>
    <p class="alert-desc" style="margin-bottom:1rem">
      Add a DNS TXT record (or a well-known file, whichever is easier) proving you control ${escapeHtml(site.domain)}, then verify.
      DNS changes can take a few minutes to propagate.
    </p>
    <div class="verify-instructions">
      <div class="verify-option">
        <span class="meta-label">DNS TXT Record</span>
        <div class="meta-item" style="margin-top:0.35rem">
          <span class="meta-label">Name</span>
          <code class="meta-value">${escapeHtml(site.verification.dnsTxt.name)}</code>
          <button type="button" class="btn-icon-copy" data-copy="${escapeHtml(site.verification.dnsTxt.name)}" title="Copy record name" aria-label="Copy record name">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
        <div class="meta-item" style="margin-top:0.35rem">
          <span class="meta-label">Value</span>
          <code class="meta-value">${escapeHtml(site.verification.dnsTxt.value)}</code>
          <button type="button" class="btn-icon-copy" data-copy="${escapeHtml(site.verification.dnsTxt.value)}" title="Copy record value" aria-label="Copy record value">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
      </div>
      <div class="verify-option">
        <span class="meta-label">Or well-known file</span>
        <div class="meta-item" style="margin-top:0.35rem">
          <span class="meta-label">URL</span>
          <code class="meta-value">${escapeHtml(site.verification.wellKnown.url)}</code>
        </div>
        <div class="meta-item" style="margin-top:0.35rem">
          <span class="meta-label">Body</span>
          <code class="meta-value">${escapeHtml(site.verification.wellKnown.body)}</code>
          <button type="button" class="btn-icon-copy" data-copy="${escapeHtml(site.verification.wellKnown.body)}" title="Copy file body" aria-label="Copy file body">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
      </div>
    </div>
    <div class="verify-action-row">
      <button type="button" class="btn btn-primary btn-verify-now" data-site-id="${escapeHtml(site.id)}">Verify now</button>
      <span class="verify-status" hidden></span>
    </div>
  </div>`
		: "";

	const state = site.installState;

	return `
<section class="site-card" id="site-${escapeHtml(site.id)}">
  <div class="site-card-header">
    <div class="site-title-group">
      <div class="site-domain-row">
        <h2 class="site-domain">${escapeHtml(site.domain)}</h2>
        <span class="badge badge-${state.badgeTone}">
          <span class="dot"></span> ${escapeHtml(state.badge)}
        </span>
        <span class="badge ${site.verified ? "badge-success" : "badge-warning"}">
          <span class="dot"></span> ${site.verified ? "Domain Verified" : "Verification Needed"}
        </span>
        ${agentOnboardButtonHtml(site)}
      </div>
      <p class="site-status-line tone-${state.badgeTone}">
        <span class="status-dot" aria-hidden="true"></span>
        <span class="status-text">${escapeHtml(state.statusLine)}</span>
      </p>
      ${renderLifecycleStrip(site)}
      <div class="site-meta-keys">
        <div class="meta-item">
          <span class="meta-label">Site ID</span>
          <code class="meta-value">${escapeHtml(site.id)}</code>
          <button type="button" class="btn-icon-copy" data-copy="${escapeHtml(site.id)}" title="Copy Site ID" aria-label="Copy Site ID">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
        <div class="meta-item">
          <span class="meta-label">Public Key</span>
          <code class="meta-value">${escapeHtml(site.publicKey)}</code>
          <button type="button" class="btn-icon-copy" data-copy="${escapeHtml(site.publicKey)}" title="Copy Public Key" aria-label="Copy Public Key">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  ${verificationPanel}

  ${site.verified && site.pageCount > 0 ? renderLiveCheckPanel(site) : ""}

  ${renderRemediationPanel(site)}

  ${integrationPanelHtml(site, index)}

  <!-- Key Metrics -->
  <div class="stats-grid">
    <div class="stat-card">
      <span class="stat-label">Indexed Pages</span>
      <div class="stat-value">${site.pageCount.toLocaleString()}</div>
      <span class="stat-hint">Pages we can recommend — synced from your sitemap</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">404s · Last 30 Days</span>
      <div class="stat-value">${mq.last30d.toLocaleString()}</div>
      <span class="stat-hint">${mq.last7d.toLocaleString()} in the last 7 days</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Suggestions Served</span>
      <div class="stat-value">${site.suggestionsServed.toLocaleString()}</div>
      <span class="stat-hint">All-time 404s where recovery was returned</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Agents Recovered</span>
      <div class="stat-value">${site.recovery.total > 0 ? `${Math.round(site.recovery.rate * 100)}%` : "\u2014"}</div>
      <span class="stat-hint">${site.recovery.recovered.toLocaleString()} of ${site.recovery.total.toLocaleString()} served suggestions followed through</span>
    </div>
  </div>

  <!-- Match Distribution -->
  <div class="section-block">
    <div class="section-title-row">
      <h3 class="section-title">Resolution Breakdown</h3>
      <span class="section-meta">${total > 0 ? `${total} 404s evaluated` : "Awaiting traffic"}</span>
    </div>
    <div class="dist-bar-container">
      <div class="dist-bar">
        <div class="dist-segment dist-moved" style="width: ${movedPct}%" title="Moved: ${movedPct}%"></div>
        <div class="dist-segment dist-similar" style="width: ${similarPct}%" title="Similar: ${similarPct}%"></div>
        <div class="dist-segment dist-related" style="width: ${relatedPct}%" title="Related: ${relatedPct}%"></div>
      </div>
    </div>
    <div class="dist-legend">
      <div class="dist-item"><span class="dist-dot dot-moved"></span> Exact / Moved <span class="dist-pct">${movedPct}%</span></div>
      <div class="dist-item"><span class="dist-dot dot-similar"></span> Semantic Similar <span class="dist-pct">${similarPct}%</span></div>
      <div class="dist-item"><span class="dist-dot dot-related"></span> Related Section <span class="dist-pct">${relatedPct}%</span></div>
    </div>
    ${distNoteText ? `<p class="dist-note">${escapeHtml(distNoteText)}</p>` : ""}
  </div>

  <!-- Matcher dry run -->
  <div class="section-block">
    <div class="section-title-row">
      <h3 class="section-title">Matcher dry run</h3>
      <span class="section-meta">Simulates a match against your index — doesn't touch your live site</span>
    </div>
    <div class="tester-form" data-domain="${escapeHtml(site.domain)}" data-key="${escapeHtml(site.publicKey)}">
      <div class="tester-input-group">
        <span class="tester-prefix">https://${escapeHtml(site.domain)}</span>
        <input type="text" class="tester-path-input" placeholder="/docs/v1/auth" spellcheck="false" />
        <button type="button" class="btn btn-secondary btn-test-match">Test match</button>
      </div>
      <div class="tester-result" hidden></div>
    </div>
  </div>

  <!-- Recent 404 Activity -->
  <div class="section-block">
    <div class="section-title-row">
      <h3 class="section-title">Recent 404 Activity</h3>
      <span class="section-meta">${
			site.recentRecoveryEvents.length > 0
				? `${site.recentRecoveryEvents.length} recent 404s`
				: `${site.recentLogs.length} recent queries`
		}</span>
    </div>
    ${
			site.recentRecoveryEvents.length > 0
				? `<div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Agent</th>
            <th>Dead URL</th>
            <th>Served</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>${recoveryRows}</tbody>
      </table>
    </div>
    <p class="table-note">“Followed” means the agent fetched the suggested page within 60 seconds of the 404. Outcome is only measurable while the suggested page reports its loads back (script-tag installs); HTTP-layer-only installs show what was served to which agent.</p>`
				: site.recentLogs.length > 0
					? `<div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Dead URL Hit</th>
            <th>Resolved Suggestion</th>
            <th>Confidence</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>${recentRows}</tbody>
      </table>
    </div>`
				: `<div class="empty-table-state">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p>No 404 queries recorded yet for this domain.</p>
      <p class="empty-table-hint">Crawlers find dead links on their own schedule — this table fills in as they arrive.</p>
    </div>`
		}
  </div>
</section>`;
}

export function dashboardHtml(data: DashboardData): string {
	const notice = data.notice
		? `<div class="alert-box alert-info" role="alert">
  <div class="alert-header">
    <svg class="alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    <strong>${escapeHtml(data.notice)}</strong>
  </div>
</div>`
		: "";

	const claim = data.claimDomain
		? `<div class="claim-card" role="form">
  <div class="claim-header">
    <span class="claim-badge">Claim Domain</span>
    <h3>Link ${escapeHtml(data.claimDomain)}</h3>
    <p>This domain is already indexed. Paste the API key from your existing script tag to link it to your account.</p>
  </div>
  <form method="post" action="/api/sites/claim" id="claim-form">
    <input type="hidden" name="domain" value="${escapeHtml(data.claimDomain)}" />
    <div class="input-action-row">
      <input type="text" id="claim-key" placeholder="key_sec_…" autocomplete="off" required spellcheck="false" />
      <button type="submit" class="btn btn-primary">Link Site</button>
    </div>
  </form>
  <p id="claim-error" class="form-error" hidden></p>
</div>`
		: "";

	const pending = data.pendingDomain
		? `<div class="claim-card" role="form">
  <div class="claim-header">
    <span class="claim-badge">Confirm Domain</span>
    <h3>Register ${escapeHtml(data.pendingDomain)}</h3>
    <p>Confirm to add this domain to your account and generate your install credentials.</p>
  </div>
  <form method="post" action="/api/sites" id="register-pending-form">
    <input type="hidden" name="domain" value="${escapeHtml(data.pendingDomain)}" />
    <button type="submit" class="btn btn-primary">Confirm & Register</button>
  </form>
  <p id="register-pending-error" class="form-error" hidden></p>
</div>`
		: "";

	const emptyStateHtml = `
<div class="dashboard-empty-card">
  <div class="empty-graphic">
    <div class="terminal-mock">
      <div class="terminal-bar">
        <span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span>
        <span class="term-title">agent-404 register</span>
      </div>
      <div class="terminal-body">
        <div class="term-line"><span class="term-prompt">$</span> curl -I https://api.yoursite.com/v1/auth</div>
        <div class="term-line term-muted">HTTP/1.1 404 Not Found</div>
        <div class="term-line term-green">Link: &lt;/v2/authentication&gt;; rel="alternate"</div>
      </div>
    </div>
  </div>

  <div class="empty-content">
    <h2 class="empty-title">Register your first domain</h2>
    <p class="empty-desc">
      agent-404 monitors your site for dead links, indexes active pages automatically, and provides instant semantic 404 recovery to Cursor, Claude, ChatGPT, Perplexity, and browser agents.
    </p>

    <form id="inline-register-form" class="inline-register-form">
      <div class="input-action-row">
        <input
          type="text"
          id="inline-domain-input"
          placeholder="docs.yourcompany.com"
          autocomplete="off"
          spellcheck="false"
          required
        />
        <button type="submit" id="inline-register-btn" class="btn btn-primary">
          Register Domain
        </button>
      </div>
      <p id="inline-register-error" class="form-error" hidden></p>
    </form>

    <div class="empty-alt-action">
      <span>Already have an active API key?</span>
      <button type="button" class="btn-link" id="btn-toggle-claim-modal">Link existing site</button>
    </div>
  </div>

  <div class="empty-steps-row">
    <div class="step-card">
      <div class="step-num">01</div>
      <div class="step-text">
        <strong>Register Domain</strong>
        <span>Add your production or docs domain to your dashboard.</span>
      </div>
    </div>
    <div class="step-card">
      <div class="step-num">02</div>
      <div class="step-text">
        <strong>Install Middleware</strong>
        <span>Paste 3 lines into Next.js, Cloudflare Worker, or HTML.</span>
      </div>
    </div>
    <div class="step-card">
      <div class="step-num">03</div>
      <div class="step-text">
        <strong>Self-Healing 404s</strong>
        <span>AI agents receive instant alternative paths in Link headers.</span>
      </div>
    </div>
  </div>
</div>`;

	const sitesHtml =
		data.sites.length > 0
			? data.sites.map((s, idx) => siteSection(s, idx)).join("\n")
			: emptyStateHtml;

	const emailLabel = data.email ? escapeHtml(data.email) : "Signed in";

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard — agent-404</title>
<meta name="description" content="Manage your indexed domains, 404 recovery metrics, and middleware credentials.">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%2310b981'/%3E%3Ctext x='50' y='58' font-family='system-ui,sans-serif' font-size='48' font-weight='800' fill='white' text-anchor='middle' dominant-baseline='middle'%3E404%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #09090b;
    --bg-subtle: #0f0f12;
    --surface: #121215;
    --surface-elevated: #18181c;
    --surface-hover: #1f1f24;
    --border: #27272a;
    --border-subtle: #1e1e22;
    --border-focus: #52525b;
    --text: #f4f4f5;
    --text-secondary: #a1a1aa;
    --text-muted: #71717a;
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --accent-subtle: rgba(59, 130, 246, 0.12);
    --emerald: #10b981;
    --emerald-subtle: rgba(16, 185, 129, 0.12);
    --amber: #f59e0b;
    --amber-subtle: rgba(245, 158, 11, 0.12);
    --rose: #f43f5e;
    --rose-subtle: rgba(244, 63, 94, 0.12);
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
  }

  body {
    font-family: var(--font-sans);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  a { color: var(--text); text-decoration: none; }
  a:hover { color: #fff; }

  .layout {
    max-width: 1080px;
    margin: 0 auto;
    padding: 0 1.5rem 4rem;
  }

  /* Top Navigation */
  header.nav-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 0;
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: 2rem;
  }

  .brand-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .brand-logo {
    font-family: var(--font-mono);
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .brand-badge {
    font-size: 0.65rem;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .nav-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .user-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .user-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--emerald);
  }

  .nav-link {
    font-size: 0.85rem;
    color: var(--text-secondary);
    transition: color 0.15s;
  }
  .nav-link:hover { color: var(--text); }

  /* Dashboard Header */
  .dashboard-heading-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .dashboard-title-group h1 {
    font-size: 1.65rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.2;
  }

  .dashboard-subtitle {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.55rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
    font-family: inherit;
    text-decoration: none;
    white-space: nowrap;
  }

  .btn-primary {
    background: #f4f4f5;
    color: #09090b;
    border-color: #f4f4f5;
    font-weight: 600;
  }
  .btn-primary:hover {
    background: #ffffff;
    border-color: #ffffff;
    color: #000;
  }

  .btn-secondary {
    background: var(--surface);
    color: var(--text);
    border-color: var(--border);
  }
  .btn-secondary:hover {
    background: var(--surface-hover);
    border-color: var(--border-focus);
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
    text-decoration: underline;
  }
  .btn-link:hover { color: #60a5fa; }

  .btn-icon-copy {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.2rem;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
  }
  .btn-icon-copy:hover { color: var(--text); }

  /* Alert boxes */
  .alert-box {
    border-radius: var(--radius-md);
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
    border: 1px solid;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .alert-warning {
    background: rgba(245, 158, 11, 0.06);
    border-color: rgba(245, 158, 11, 0.25);
    color: #fde68a;
  }
  .alert-warning strong { color: var(--amber); }
  .alert-warning code {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.15rem 0.35rem;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.8em;
    color: #fff;
  }

  .alert-info {
    background: rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.25);
    color: #bfdbfe;
  }

  .alert-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
  }

  .alert-desc {
    color: var(--text-secondary);
    font-size: 0.825rem;
  }

  /* Claim / Confirm cards */
  .claim-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .claim-badge {
    display: inline-block;
    font-size: 0.65rem;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--accent-subtle);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.2);
    margin-bottom: 0.5rem;
  }

  .claim-header h3 {
    font-size: 1.15rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .claim-header p {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }

  .input-action-row {
    display: flex;
    gap: 0.5rem;
    max-width: 540px;
  }

  .input-action-row input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.55rem 0.85rem;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.85rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .input-action-row input:focus {
    border-color: var(--border-focus);
  }

  .form-error {
    color: var(--rose);
    font-size: 0.8rem;
    margin-top: 0.5rem;
  }

  /* Modal Register Drawer / Dialog */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1.5rem;
  }
  .modal-backdrop.open {
    display: flex;
  }
  .modal-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    max-width: 480px;
    width: 100%;
    padding: 1.75rem;
    position: relative;
    box-shadow: 0 20px 40px rgba(0,0,0,0.5);
  }
  .modal-close-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
  }
  .modal-close-btn:hover { color: var(--text); }

  /* High fidelity empty state */
  .dashboard-empty-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 2.5rem 2rem;
    text-align: center;
    max-width: 760px;
    margin: 1.5rem auto;
  }

  .empty-graphic {
    max-width: 460px;
    margin: 0 auto 2rem;
    text-align: left;
  }

  .terminal-mock {
    background: #09090b;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .terminal-bar {
    background: #121215;
    padding: 0.45rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  .term-dot { width: 7px; height: 7px; border-radius: 50%; background: #27272a; }
  .term-title { margin-left: 0.5rem; color: var(--text-muted); font-size: 0.7rem; }

  .terminal-body {
    padding: 0.85rem 1rem;
    line-height: 1.6;
  }
  .term-prompt { color: var(--accent); }
  .term-muted { color: var(--text-muted); }
  .term-green { color: var(--emerald); }

  .empty-title {
    font-size: 1.45rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 0.5rem;
  }

  .empty-desc {
    color: var(--text-secondary);
    font-size: 0.9rem;
    max-width: 520px;
    margin: 0 auto 1.5rem;
    line-height: 1.6;
  }

  .inline-register-form {
    max-width: 460px;
    margin: 0 auto;
  }

  .empty-alt-action {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .empty-steps-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-top: 2.5rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border-subtle);
    text-align: left;
  }
  @media (max-width: 640px) {
    .empty-steps-row { grid-template-columns: 1fr; }
  }

  .step-card {
    display: flex;
    gap: 0.75rem;
  }
  .step-num {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .step-text strong {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text);
  }
  .step-text span {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  /* Site Cards */
  .site-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.75rem;
    margin-bottom: 2.5rem;
  }

  .site-card-header {
    margin-bottom: 1.5rem;
  }

  .site-domain-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .site-domain {
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-family: var(--font-mono);
  }

  /* Onboard Agent Button */
  .btn-agent-onboard {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: var(--accent-subtle);
    color: #93c5fd;
    border: 1px solid rgba(59, 130, 246, 0.35);
    border-radius: var(--radius-sm);
    padding: 0.4rem 0.85rem;
    font-size: 0.8125rem;
    font-weight: 600;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    text-decoration: none;
    line-height: 1.2;
    margin-left: auto;
  }
  .btn-agent-onboard:hover {
    background: rgba(59, 130, 246, 0.22);
    border-color: var(--accent);
    color: #bfdbfe;
  }
  .btn-agent-onboard:active {
    transform: translateY(0.5px);
  }
  .btn-agent-onboard.copied {
    background: var(--emerald-subtle);
    border-color: var(--emerald);
    color: #6ee7b7;
  }
  .btn-agent-icon {
    font-size: 0.75rem;
  }

  @media (max-width: 768px) {
    .btn-agent-onboard {
      margin-left: 0;
      width: 100%;
      justify-content: center;
      margin-top: 0.5rem;
    }
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-family: var(--font-mono);
    font-weight: 500;
    border: 1px solid;
  }

  .badge-success {
    background: var(--emerald-subtle);
    border-color: rgba(16, 185, 129, 0.25);
    color: var(--emerald);
  }
  .badge-success .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--emerald); }

  .badge-neutral {
    background: rgba(255, 255, 255, 0.04);
    border-color: var(--border);
    color: var(--text-muted);
  }
  .badge-neutral .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--text-muted); }

  .badge-warning {
    background: var(--amber-subtle);
    border-color: rgba(245, 158, 11, 0.25);
    color: var(--amber);
  }
  .badge-warning .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--amber); }

  .badge-danger {
    background: var(--rose-subtle);
    border-color: rgba(244, 63, 94, 0.3);
    color: var(--rose);
  }
  .badge-danger .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--rose); }

  /* Status line — the one-sentence answer to "is this working?" */
  .site-status-line {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    font-size: 0.875rem;
    line-height: 1.55;
    margin-top: 0.65rem;
    padding: 0.6rem 0.85rem;
    border-radius: var(--radius-md);
    border: 1px solid;
  }
  .site-status-line .status-dot {
    flex-shrink: 0;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-top: 0.42rem;
  }
  .site-status-line.tone-success {
    background: var(--emerald-subtle);
    border-color: rgba(16, 185, 129, 0.25);
    color: #a7f3d0;
  }
  .site-status-line.tone-success .status-dot { background: var(--emerald); }
  .site-status-line.tone-warning {
    background: var(--amber-subtle);
    border-color: rgba(245, 158, 11, 0.25);
    color: #fde68a;
  }
  .site-status-line.tone-warning .status-dot { background: var(--amber); }
  .site-status-line.tone-danger {
    background: var(--rose-subtle);
    border-color: rgba(244, 63, 94, 0.3);
    color: #fda4af;
  }
  .site-status-line.tone-danger .status-dot { background: var(--rose); }
  .site-status-line.tone-neutral {
    background: rgba(255, 255, 255, 0.03);
    border-color: var(--border);
    color: var(--text-secondary);
  }
  .site-status-line.tone-neutral .status-dot { background: var(--text-muted); }

  /* Lifecycle strip — the install funnel, in order */
  .lifecycle-strip {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.9rem;
  }
  .step-item {
    flex: 1 1 160px;
    min-width: 150px;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    /* A hint that doesn't fit beside its label drops onto its own line
       inside the card instead of pushing text past the border. */
    flex-wrap: wrap;
    background: var(--bg);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.45rem 0.6rem;
  }
  .step-num {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
    flex-shrink: 0;
  }
  .step-label {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-secondary);
    /* Label may wrap and shrink so the line stays inside the card —
       nothing is clipped or pushed past the border. */
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .step-marker {
    font-size: 0.68rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .step-hint {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--text-muted);
    /* Hint may wrap too; right-aligned so multi-line hints stay tidy
       against the card's right edge instead of overflowing it. */
    min-width: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .step-item.step-ok { border-color: rgba(16, 185, 129, 0.2); }
  .step-item.step-ok .step-label { color: var(--text); }
  .step-item.step-ok .step-marker { color: var(--emerald); }
  .step-item.step-problem { border-color: rgba(244, 63, 94, 0.3); }
  .step-item.step-problem .step-label { color: var(--rose); }
  .step-item.step-problem .step-marker { color: var(--rose); }
  .step-item.step-problem .step-hint { color: #fda4af; }

  /* Domain Verification Panel */
  .verify-instructions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  @media (max-width: 768px) {
    .verify-instructions { grid-template-columns: 1fr; }
  }

  .verify-option {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1rem 1.15rem;
  }
  .verify-option .meta-item { display: flex; flex-wrap: wrap; }
  .verify-option .meta-value { word-break: break-all; }

  .verify-action-row {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    flex-wrap: wrap;
  }

  .verify-status {
    font-size: 0.8rem;
    font-family: var(--font-mono);
  }
  .verify-status.status-ok { color: var(--emerald); }
  .verify-status.status-error { color: var(--rose); }
  .verify-status.status-pending { color: var(--text-muted); }

  .site-meta-keys {
    display: flex;
    gap: 1.25rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
  }

  .meta-label {
    color: var(--text-muted);
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.65rem;
  }

  .meta-value {
    font-family: var(--font-mono);
    color: var(--text-secondary);
    background: var(--bg);
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    border: 1px solid var(--border-subtle);
  }

  /* Remediation panel — actionable tips + fix prompt for broken/degraded installs */
  .remediation-block {
    background: var(--rose-subtle);
    border: 1px solid rgba(244, 63, 94, 0.25);
    border-top: 1px solid rgba(244, 63, 94, 0.25);
    border-radius: var(--radius-md);
    padding: 1.25rem 1.5rem;
  }

  .remediation-block .section-title {
    color: #fda4af;
  }

  .remediation-block .section-sub {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin-top: 0.2rem;
  }

  .remediation-tip-list {
    list-style: none;
    margin: 0.9rem 0 1.1rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .remediation-tip-list li {
    position: relative;
    padding-left: 1.35rem;
    font-size: 0.85rem;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  .remediation-tip-list li::before {
    content: '→';
    position: absolute;
    left: 0;
    color: var(--rose);
    font-weight: 600;
  }

  .remediation-action-row {
    display: flex;
    justify-content: flex-start;
  }

  .remediation-action-row .copy-btn-primary {
    padding: 0.5rem 0.9rem;
  }

  /* Collapsed integration snippets once install is confirmed working */
  .integration-panel-details {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    margin-bottom: 1.75rem;
    overflow: hidden;
  }

  .integration-panel-details .integration-panel {
    border: none;
    border-radius: 0;
    margin-bottom: 0;
    border-top: 1px solid var(--border);
  }

  .integration-panel-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.85rem 1.1rem;
    background: var(--surface-elevated);
    color: var(--text-secondary);
    font-size: 0.825rem;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .integration-panel-summary::-webkit-details-marker {
    display: none;
  }

  .integration-panel-summary:hover {
    color: var(--text);
  }

  .integration-summary-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--emerald-subtle);
    color: var(--emerald);
    font-size: 0.65rem;
    flex-shrink: 0;
  }

  /* Code Tabs & Snippets */
  .integration-panel {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    margin-bottom: 1.75rem;
  }

  .integration-tabs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--surface-elevated);
    border-bottom: 1px solid var(--border);
    padding: 0.25rem 0.5rem 0;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .integration-tabs-header .integration-tabs {
    border-bottom: none;
    padding: 0;
  }

  .integration-tabs {
    display: flex;
    background: var(--surface-elevated);
    border-bottom: 1px solid var(--border);
    padding: 0.25rem 0.5rem 0;
    gap: 0.25rem;
    overflow-x: auto;
  }

  .tab-btn {
    background: none;
    border: none;
    padding: 0.5rem 0.85rem;
    font-size: 0.75rem;
    font-family: var(--font-mono);
    color: var(--text-muted);
    cursor: pointer;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    transition: all 0.15s;
    border-bottom: 2px solid transparent;
  }
  .tab-btn:hover { color: var(--text); }
  .tab-btn.active {
    color: var(--text);
    background: var(--bg);
    border-bottom: 2px solid var(--accent);
    font-weight: 600;
  }

  .tab-btn-agent {
    color: #93c5fd;
  }
  .tab-btn-agent.active {
    color: #bfdbfe;
    border-bottom-color: #3b82f6;
  }
  .tab-agent-sparkle {
    margin-right: 0.25rem;
    font-size: 0.75rem;
  }

  .tab-content { display: none; }
  .tab-content.active { display: block; }

  .code-block {
    position: relative;
    padding: 1rem 1.25rem;
  }

  .code-block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .code-lang {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .code-header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .copy-btn {
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    padding: 0.25rem 0.6rem;
    font-size: 0.7rem;
    font-family: var(--font-mono);
    cursor: pointer;
    transition: all 0.15s;
  }
  .copy-btn:hover {
    color: var(--text);
    border-color: var(--border-focus);
  }

  .copy-btn-primary {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
    font-weight: 600;
  }
  .copy-btn-primary:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
    color: #ffffff;
  }

  .agent-tab-badges {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .agent-skill-link {
    font-size: 0.7rem;
    font-family: var(--font-mono);
    color: var(--accent);
    text-decoration: underline;
    transition: color 0.15s;
  }
  .agent-skill-link:hover {
    color: #93c5fd;
  }

  .snippet-markdown {
    color: #e4e4e7;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 380px;
    overflow-y: auto;
  }

  .agent-helper-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-subtle);
  }

  .agent-tip-pill {
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.3rem 0.6rem;
    font-size: 0.72rem;
    color: var(--text-secondary);
  }
  .agent-tip-pill strong {
    color: var(--text);
  }
  .agent-tip-pill code {
    font-family: var(--font-mono);
    color: #93c5fd;
    background: rgba(0,0,0,0.3);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.9em;
  }

  .snippet {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--text);
    overflow-x: auto;
    white-space: pre-wrap;
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }
  @media (max-width: 768px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
  }

  .stat-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1rem 1.15rem;
  }

  .stat-label {
    font-size: 0.7rem;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    display: block;
    margin-bottom: 0.35rem;
  }

  .stat-value {
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.2;
    color: var(--text);
  }

  .stat-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    display: block;
    margin-top: 0.35rem;
  }

  /* Section Blocks */
  .section-block {
    margin-top: 2rem;
    padding-top: 1.75rem;
    border-top: 1px solid var(--border-subtle);
  }

  .section-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .section-title {
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .section-meta {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  /* Distribution Bar */
  .dist-bar-container {
    margin-bottom: 0.75rem;
  }

  .dist-bar {
    height: 8px;
    background: #18181b;
    border-radius: 999px;
    overflow: hidden;
    display: flex;
  }

  .dist-segment {
    height: 100%;
    transition: width 0.3s ease;
  }
  .dist-moved { background: var(--accent); }
  .dist-similar { background: var(--emerald); }
  .dist-related { background: var(--amber); }

  .dist-legend {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .dist-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .dist-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .dot-moved { background: var(--accent); }
  .dot-similar { background: var(--emerald); }
  .dot-related { background: var(--amber); }

  .dist-pct {
    font-family: var(--font-mono);
    color: var(--text);
    font-weight: 600;
  }

  /* Interactive Tester Form */
  .tester-form {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 0.75rem;
  }

  .tester-input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.25rem 0.5rem;
  }

  .tester-prefix {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .tester-path-input {
    flex: 1;
    background: none;
    border: none;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.85rem;
    outline: none;
  }

  .btn-test-match {
    padding: 0.4rem 0.85rem;
    font-size: 0.75rem;
  }

  .tester-result {
    margin-top: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  /* Data Table */
  .table-container {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--bg);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    text-align: left;
  }

  .data-table th {
    background: var(--surface-elevated);
    padding: 0.65rem 1rem;
    font-size: 0.65rem;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    font-weight: 600;
  }

  .data-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .data-table tr:last-child td {
    border-bottom: none;
  }

  .data-table tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }

  .cell-mono {
    font-family: var(--font-mono);
  }

  .cell-url {
    max-width: 280px;
  }

  .url-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
    vertical-align: middle;
    max-width: 210px;
    color: var(--text);
  }

  .status-pill {
    display: inline-block;
    font-size: 0.6rem;
    font-family: var(--font-mono);
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    margin-right: 0.35rem;
    vertical-align: middle;
  }
  .status-pill-dead {
    background: var(--rose-subtle);
    color: var(--rose);
  }
  .status-pill-target {
    background: var(--emerald-subtle);
    color: var(--emerald);
  }

  .score-badge {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text);
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
  }

  .cell-time {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .empty-table-state {
    padding: 2.5rem 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .empty-table-state svg { color: var(--text-muted); }

  /* Live 404 check — the raw HTTP exchange as ClaudeBot sees it */
  .section-sub {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin-top: 0.15rem;
  }

  .live-check-grid {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 1.25rem;
    margin-top: 1rem;
  }
  @media (max-width: 768px) {
    .live-check-grid { grid-template-columns: 1fr; }
  }

  .live-check-grid .terminal-mock {
    max-width: none;
    font-size: 0.73rem;
  }

  .term-dim { color: var(--text-muted); }
  .term-amber { color: var(--amber); }
  .term-rose { color: var(--rose); }

  .live-check-verdict {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1rem 1.15rem;
  }
  .live-check-verdict-label {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.4rem;
  }
  .live-check-verdict-label.tone-success { color: var(--emerald); }
  .live-check-verdict-label.tone-warning { color: var(--amber); }
  .live-check-verdict-label.tone-danger { color: var(--rose); }
  .live-check-verdict-label.tone-neutral { color: var(--text-muted); }
  .live-check-verdict-text {
    font-size: 0.83rem;
    color: var(--text-secondary);
    line-height: 1.55;
  }
  .live-check-meta {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-top: 0.5rem;
  }
  .live-check-note {
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-top: 0.8rem;
    padding-top: 0.65rem;
    border-top: 1px solid var(--border-subtle);
    line-height: 1.55;
  }
  .live-check-note code {
    font-family: var(--font-mono);
    background: rgba(0, 0, 0, 0.3);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.9em;
    color: #fff;
  }

  /* Interpretation line under the resolution bar */
  .dist-note {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.75rem;
    line-height: 1.5;
  }

  /* Agent chips + outcome pills in the activity table */
  .agent-chip {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .outcome-pill {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
    white-space: nowrap;
  }
  .outcome-yes {
    background: var(--emerald-subtle);
    color: var(--emerald);
    border: 1px solid rgba(16, 185, 129, 0.25);
  }
  .outcome-no {
    background: rgba(255, 255, 255, 0.03);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .table-note {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-top: 0.6rem;
    line-height: 1.5;
  }

  .empty-table-hint {
    font-size: 0.72rem;
    color: var(--text-muted);
    max-width: 320px;
  }

  /* Toast Notification */
  .toast {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.6rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-family: var(--font-mono);
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    transform: translateY(100px);
    opacity: 0;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .toast.show {
    transform: translateY(0);
    opacity: 1;
  }
  .toast-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--emerald);
  }
</style>
</head>
<body>
<div class="layout">
  <header class="nav-header">
    <div class="brand-group">
      <a href="/" class="brand-logo">
        agent<span>-</span>404
      </a>
      <span class="brand-badge">Dashboard</span>
    </div>

    <div class="nav-actions">
      <div class="user-chip">
        <span class="user-dot"></span>
        <span>${emailLabel}</span>
      </div>
      <a href="/demo" class="nav-link">Live Audit</a>
      <a href="https://github.com/bharath31/agent-404" class="nav-link" target="_blank" rel="noopener">GitHub</a>
      <a href="/auth/logout" class="nav-link">Log out</a>
    </div>
  </header>

  <main>
    <div class="dashboard-heading-row">
      <div class="dashboard-title-group">
        <h1>Overview</h1>
        <p class="dashboard-subtitle">When an AI crawler hits a missing page, agent-404 puts the closest real page inside the 404 response itself — Link headers + JSON-LD, no JavaScript. Below: whether each of your sites is doing that, and what's left.</p>
      </div>

      <button type="button" class="btn btn-secondary" id="btn-open-register-modal">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Domain
      </button>
    </div>

    ${notice}
    ${claim}
    ${pending}

    <div class="sites-container">
      ${sitesHtml}
    </div>
  </main>
</div>

<!-- Add Domain Modal -->
<div class="modal-backdrop" id="register-modal" role="dialog" aria-modal="true">
  <div class="modal-card">
    <button type="button" class="modal-close-btn" id="modal-close" aria-label="Close modal">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div class="claim-header">
      <span class="claim-badge">New Site</span>
      <h3>Register a Domain</h3>
      <p>Enter your documentation or API domain. We'll generate your middleware keys and start indexing your sitemap.</p>
    </div>
    <form id="modal-register-form">
      <div class="input-action-row" style="max-width:100%">
        <input type="text" id="modal-domain-input" placeholder="docs.acme.com" required autocomplete="off" spellcheck="false" />
        <button type="submit" id="modal-register-submit" class="btn btn-primary">Register</button>
      </div>
      <p id="modal-register-error" class="form-error" hidden></p>
    </form>
    <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border-subtle);font-size:0.8rem;color:var(--text-muted)">
      <span>Already have an API key?</span>
      <button type="button" class="btn-link" id="btn-switch-to-claim">Link existing domain</button>
    </div>
  </div>
</div>

<!-- Claim Existing Domain Modal -->
<div class="modal-backdrop" id="claim-modal" role="dialog" aria-modal="true">
  <div class="modal-card">
    <button type="button" class="modal-close-btn" id="claim-modal-close" aria-label="Close modal">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div class="claim-header">
      <span class="claim-badge">Claim Site</span>
      <h3>Link Existing Domain</h3>
      <p>Enter the domain and its existing API key to attach it to your account.</p>
    </div>
    <form id="modal-claim-form" style="display:flex;flex-direction:column;gap:0.75rem">
      <input type="text" id="modal-claim-domain" placeholder="docs.acme.com" required autocomplete="off" spellcheck="false"
        style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.55rem 0.85rem;color:var(--text);font-family:var(--font-mono);font-size:0.85rem;outline:none" />
      <input type="text" id="modal-claim-key" placeholder="key_sec_…" required autocomplete="off" spellcheck="false"
        style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.55rem 0.85rem;color:var(--text);font-family:var(--font-mono);font-size:0.85rem;outline:none" />
      <button type="submit" class="btn btn-primary" style="align-self:flex-start">Link Site</button>
      <p id="modal-claim-error" class="form-error" hidden></p>
    </form>
  </div>
</div>

<!-- Toast element -->
<div class="toast" id="toast">
  <span class="toast-dot"></span>
  <span id="toast-text">Copied to clipboard</span>
</div>

<script>
  function showToast(text) {
    const el = document.getElementById('toast');
    const txt = document.getElementById('toast-text');
    txt.textContent = text || 'Copied to clipboard';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  }

  // Copy buttons
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy') || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const isSmallBtn = btn.classList.contains('copy-btn');
        if (isSmallBtn) {
          const prev = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = prev; }, 1600);
        } else {
          showToast('Copied to clipboard');
        }
      });
    });
  });

  // Agent prompt copy buttons
  document.querySelectorAll('[data-copy-agent-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy-agent-prompt') || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const isPill = btn.classList.contains('btn-agent-onboard');

        if (isPill) {
          const labelEl = btn.querySelector('.btn-agent-label');
          if (labelEl) {
            const prev = labelEl.textContent;
            labelEl.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
              labelEl.textContent = prev;
              btn.classList.remove('copied');
            }, 2000);
          }
        } else {
          const prev = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = prev; }, 1800);
        }
        showToast('Agent prompt copied! Paste into Claude Code, Cursor, Windsurf, or Copilot.');
      });
    });
  });

  // Snippet tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab-target');
      const container = btn.closest('.integration-panel');
      if (!container) return;
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // Modal controls
  const regModal = document.getElementById('register-modal');
  const claimModal = document.getElementById('claim-modal');

  document.getElementById('btn-open-register-modal')?.addEventListener('click', () => {
    regModal?.classList.add('open');
    document.getElementById('modal-domain-input')?.focus();
  });

  document.getElementById('modal-close')?.addEventListener('click', () => {
    regModal?.classList.remove('open');
  });

  document.getElementById('claim-modal-close')?.addEventListener('click', () => {
    claimModal?.classList.remove('open');
  });

  document.getElementById('btn-toggle-claim-modal')?.addEventListener('click', () => {
    claimModal?.classList.add('open');
  });

  document.getElementById('btn-switch-to-claim')?.addEventListener('click', () => {
    regModal?.classList.remove('open');
    claimModal?.classList.add('open');
  });

  // Close modals on background click
  window.addEventListener('click', (e) => {
    if (e.target === regModal) regModal.classList.remove('open');
    if (e.target === claimModal) claimModal.classList.remove('open');
  });

  // Helper registration function
  async function submitRegistration(domain, errEl, submitBtn) {
    errEl.hidden = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Registering…';
    }
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      if (res.ok) {
        showToast('Site registered successfully');
        setTimeout(() => { window.location = '/dashboard'; }, 400);
        return;
      }
      if (res.status === 409) {
        window.location = '/dashboard?register=' + encodeURIComponent(domain);
        return;
      }
      const body = await res.json().catch(() => ({}));
      errEl.textContent = body.error || 'Could not register this domain.';
      errEl.hidden = false;
    } catch (err) {
      errEl.textContent = 'Network error while registering domain.';
      errEl.hidden = false;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register';
      }
    }
  }

  // Inline register form in empty state
  const inlineForm = document.getElementById('inline-register-form');
  if (inlineForm) {
    inlineForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const domain = document.getElementById('inline-domain-input').value.trim();
      const errEl = document.getElementById('inline-register-error');
      const submitBtn = document.getElementById('inline-register-btn');
      submitRegistration(domain, errEl, submitBtn);
    });
  }

  // Modal register form
  const modalRegForm = document.getElementById('modal-register-form');
  if (modalRegForm) {
    modalRegForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const domain = document.getElementById('modal-domain-input').value.trim();
      const errEl = document.getElementById('modal-register-error');
      const submitBtn = document.getElementById('modal-register-submit');
      submitRegistration(domain, errEl, submitBtn);
    });
  }

  // Claim forms
  async function submitClaim(domain, apiKey, errEl) {
    errEl.hidden = true;
    try {
      const res = await fetch('/api/sites/claim', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, apiKey })
      });
      if (res.ok) {
        showToast('Site linked to account');
        setTimeout(() => { window.location = '/dashboard'; }, 400);
        return;
      }
      const body = await res.json().catch(() => ({}));
      errEl.textContent = body.error || 'Could not link this site. Check the API key.';
      errEl.hidden = false;
    } catch {
      errEl.textContent = 'Network error while linking site.';
      errEl.hidden = false;
    }
  }

  const claimForm = document.getElementById('claim-form');
  if (claimForm) {
    claimForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const domain = claimForm.querySelector('input[name="domain"]').value;
      const apiKey = document.getElementById('claim-key').value.trim();
      const errEl = document.getElementById('claim-error');
      submitClaim(domain, apiKey, errEl);
    });
  }

  const modalClaimForm = document.getElementById('modal-claim-form');
  if (modalClaimForm) {
    modalClaimForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const domain = document.getElementById('modal-claim-domain').value.trim();
      const apiKey = document.getElementById('modal-claim-key').value.trim();
      const errEl = document.getElementById('modal-claim-error');
      submitClaim(domain, apiKey, errEl);
    });
  }

  // Pending register form
  const pendingForm = document.getElementById('register-pending-form');
  if (pendingForm) {
    pendingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const domain = pendingForm.querySelector('input[name="domain"]').value;
      const errEl = document.getElementById('register-pending-error');
      submitRegistration(domain, errEl);
    });
  }

  // Verify domain ownership
  document.querySelectorAll('.btn-verify-now').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const siteId = btn.getAttribute('data-site-id');
      const statusEl = btn.parentElement.querySelector('.verify-status');
      btn.disabled = true;
      const prevText = btn.textContent;
      btn.textContent = 'Verifying…';
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.className = 'verify-status status-pending';
        statusEl.textContent = 'Checking DNS / well-known file…';
      }
      try {
        const res = await fetch('/api/sites/' + encodeURIComponent(siteId) + '/verify', {
          method: 'POST',
          credentials: 'same-origin',
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.verified) {
          showToast('Domain verified — indexing will begin shortly');
          setTimeout(() => { window.location.reload(); }, 600);
          return;
        }
        if (statusEl) {
          statusEl.className = 'verify-status status-error';
          statusEl.textContent = body.error
            ? body.error + ' — TXT record not found yet, DNS can take a few minutes to propagate.'
            : 'TXT record not found yet — DNS can take a few minutes to propagate.';
        }
      } catch (err) {
        if (statusEl) {
          statusEl.className = 'verify-status status-error';
          statusEl.textContent = 'Network error while verifying. Please try again.';
        }
      } finally {
        btn.disabled = false;
        btn.textContent = prevText;
      }
    });
  });

  // Interactive 404 tester
  document.querySelectorAll('.tester-form').forEach((form) => {
    const domain = form.getAttribute('data-domain');
    const publicKey = form.getAttribute('data-key');
    const input = form.querySelector('.tester-path-input');
    const btn = form.querySelector('.btn-test-match');
    const resultBox = form.querySelector('.tester-result');

    btn.addEventListener('click', async () => {
      let path = input.value.trim();
      if (!path.startsWith('/')) path = '/' + path;
      const fullUrl = 'https://' + domain + path;
      btn.disabled = true;
      btn.textContent = 'Matching…';
      resultBox.hidden = false;
      resultBox.innerHTML = '<span style="color:var(--text-muted)">Querying matcher…</span>';

      try {
        const res = await fetch('/api/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': publicKey },
          body: JSON.stringify({ url: fullUrl })
        });
        const data = await res.json();
        if (data.suggestions && data.suggestions.length > 0) {
          const top = data.suggestions[0];
          resultBox.innerHTML = '<div style="color:var(--emerald);margin-bottom:0.25rem">✓ Match found (' + Math.round((top.score || 0) * 100) + '% match)</div>' +
            '<div style="color:var(--text)">Target: <a href="' + top.url + '" target="_blank" style="color:var(--accent);text-decoration:underline">' + top.url + '</a></div>' +
            '<div style="color:var(--text-muted);font-size:0.75rem;margin-top:0.25rem">Type: ' + (top.matchType || 'similar') + ' &middot; Link headers and JSON-LD attached</div>';
        } else {
          resultBox.innerHTML = '<div style="color:var(--amber)">No matching pages found for this path. Make sure your sitemap is indexed.</div>';
        }
      } catch (err) {
        resultBox.innerHTML = '<div style="color:var(--rose)">Could not query matcher: ' + err.message + '</div>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Test match';
      }
    });
  });

  // Live 404 check — fetch a dead URL on the owner's own domain as
  // ClaudeBot and render the real HTTP exchange in the terminal block.
  function clientEscape(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.querySelectorAll('.btn-live-check').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const siteId = btn.getAttribute('data-site-id');
      // The button lives in .section-title-row; the grid is its sibling inside
      // the enclosing .live-check-block (not an ancestor of the button), so
      // resolve the block first, then its own grid. Scoped per site panel.
      const block = btn.closest('.live-check-block');
      const grid = block ? block.querySelector('.live-check-grid') : null;
      if (!grid) return;
      const domain = grid.getAttribute('data-domain') || '';
      const body = grid.querySelector('.live-check-terminal');
      const verdictCard = grid.querySelector('.live-check-verdict');
      const label = verdictCard.querySelector('.live-check-verdict-label');
      const text = verdictCard.querySelector('.live-check-verdict-text');
      const meta = verdictCard.querySelector('.live-check-meta');

      btn.disabled = true;
      btn.textContent = 'Probing…';
      body.innerHTML = '<div class="term-line term-muted">Fetching a dead URL as ClaudeBot…</div>';
      if (label) {
        label.textContent = 'Checking';
        label.className = 'live-check-verdict-label tone-neutral';
      }
      if (text) text.textContent = 'Talking to your site from our servers. This takes a couple of seconds.';
      if (meta) meta.textContent = '';

      try {
        const res = await fetch('/api/dashboard/probe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId }),
        });
        const data = await res.json().catch(() => ({}));
        const p = data.probe;
        if (!res.ok || !p) {
          throw new Error(data.error || 'probe failed');
        }

        const lines = [];
        lines.push('<div class="term-line"><span class="term-prompt">$</span> curl -sI <span class="term-dim">https://' + clientEscape(domain) + '</span>' + clientEscape(p.probePath) + ' <span class="term-dim">-A "ClaudeBot/1.0"</span></div>');
        lines.push('<div class="term-line' + (p.status === 404 ? '' : ' term-amber') + '">HTTP/2 ' + p.status + '</div>');
        if (p.linkHeader) {
          lines.push('<div class="term-line term-green">link: ' + clientEscape(p.linkHeader) + '</div>');
        }
        if (p.hasJsonLd) {
          lines.push('<div class="term-line term-green">body: &lt;script type="application/ld+json"&gt; — schema.org/ItemList</div>');
        }
        if (p.verdict === 'unrecovered_404') {
          lines.push('<div class="term-line term-rose">↳ no Link header, no JSON-LD — the agent gets nothing</div>');
        }
        body.innerHTML = lines.join('');

        const LABELS = {
          recovered_404: 'Recovery served',
          unrecovered_404: 'Bare 404 — no recovery',
          non_404: 'Soft 404 (site returned 200)',
          error: 'Could not reach site',
        };
        const TONES = {
          recovered_404: 'success',
          unrecovered_404: 'danger',
          non_404: 'warning',
          error: 'warning',
        };
        label.textContent = LABELS[p.verdict] || p.verdict;
        label.className = 'live-check-verdict-label tone-' + (TONES[p.verdict] || 'warning');
        text.textContent = p.summary || '';
        if (meta) meta.textContent = 'checked just now · manual';
      } catch (err) {
        body.innerHTML = '<div class="term-line term-rose">↳ ' + clientEscape(err.message || 'network error') + '</div>';
        label.textContent = 'Check failed';
        label.className = 'live-check-verdict-label tone-warning';
        text.textContent = 'Could not reach your site from our servers. Try again in a moment.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Run live check';
      }
    });
  });
</script>
</body>
</html>`;
}
