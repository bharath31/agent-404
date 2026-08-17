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
	return `import { agent404 } from "@agent-404/next";

export const middleware = agent404({
  apiKey: process.env.AGENT404_PUBLIC_KEY || "${site.publicKey}",
  siteId: "${site.id}",
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};`;
}

function rawCloudflareSnippet(site: Pick<DashboardSiteData, "id" | "publicKey">): string {
	return `import { agent404Worker } from "@agent-404/cloudflare";

export default {
  async fetch(req, env, ctx) {
    return agent404Worker(req, env, {
      publicKey: "${site.publicKey}",
      siteId: "${site.id}",
    });
  },
};`;
}

function rawExpressSnippet(site: Pick<DashboardSiteData, "id" | "publicKey">): string {
	return `import { agent404Express } from "@agent-404/express";

app.use(agent404Express({
  publicKey: "${site.publicKey}",
  siteId: "${site.id}",
}));`;
}

/**
 * Single source of truth for the complete AI coding agent prompt.
 * Tailored with the site's domain, siteId, and publicKey (never secret key).
 */
function rawAgentPrompt(site: Pick<DashboardSiteData, "id" | "publicKey" | "domain">): string {
	return `You are an AI coding assistant. Install and configure agent-404 (https://www.agent404.dev) in this project so that all dead links and 404 responses automatically self-heal and return semantic Link headers for AI crawlers (Claude, GPTBot, Perplexity) and human users.

### Project Credentials
- **Domain:** ${site.domain}
- **Site ID:** ${site.id}
- **Public Key:** ${site.publicKey}
- **Canonical API Base:** https://www.agent404.dev

### Instructions
1. Inspect the codebase to detect the project framework (Next.js, Cloudflare Workers, Express, or Static HTML).
2. Install the appropriate SDK:
   - Next.js: run \`npm install @agent-404/next\` (or pnpm/yarn/bun)
   - Cloudflare Workers: run \`npm install @agent-404/cloudflare\`
   - Express: run \`npm install @agent-404/express\`
   - Static HTML: insert the \`<script>\` tag in <head> or <body>
3. Configure the middleware/adapter:
   - **Next.js (\`middleware.ts\`):**
     \`\`\`typescript
     import { agent404 } from "@agent-404/next";

     export const middleware = agent404({
       apiKey: process.env.AGENT404_PUBLIC_KEY || "${site.publicKey}",
       siteId: "${site.id}",
     });

     export const config = {
       matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
     };
     \`\`\`
   - **Cloudflare Worker (\`worker.ts\`):**
     \`\`\`typescript
     import { agent404Worker } from "@agent-404/cloudflare";

     export default {
       async fetch(req: Request, env: any, ctx: any) {
         return agent404Worker(req, env, {
           publicKey: env.AGENT404_PUBLIC_KEY || "${site.publicKey}",
           siteId: "${site.id}",
         });
       },
     };
     \`\`\`
   - **Express (\`server.js\` / \`app.ts\`):**
     \`\`\`javascript
     import { agent404Express } from "@agent-404/express";

     app.use(agent404Express({
       publicKey: process.env.AGENT404_PUBLIC_KEY || "${site.publicKey}",
       siteId: "${site.id}",
     }));
     \`\`\`
   - **HTML Script Tag:**
     \`\`\`html
     <script
       src="${CANONICAL_SCRIPT_URL}"
       data-site-id="${site.id}"
       data-public-key="${site.publicKey}"
       defer
     ></script>
     \`\`\`
4. Set environment variables in \`.env\` or \`.env.local\`:
   \`\`\`env
   AGENT404_PUBLIC_KEY="${site.publicKey}"
   AGENT404_SITE_ID="${site.id}"
   \`\`\`
5. Verify the installation:
   - Request a non-existent route (e.g. \`curl -I http://localhost:3000/non-existent-test\`) and confirm that \`Link: </suggested-path>; rel="alternate"\` is present.
   - Confirm indexing status with:
     \`\`\`bash
     curl "https://www.agent404.dev/api/install/status?domain=${site.domain}&apiKey=${site.publicKey}"
     \`\`\`
   - Always ensure requests use \`https://www.agent404.dev\` (not apex) to avoid CORS preflight issues.`;
}

function agentLogosClusterHtml(): string {
	return `<span class="agent-logos-cluster" aria-hidden="true">
  <svg class="agent-logo agent-logo-claude" width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" title="Claude / Anthropic">
    <g stroke="#D97757" stroke-width="2.3" stroke-linecap="round">
      <line x1="12" y1="2.5" x2="12" y2="21.5"/>
      <line x1="2.5" y1="12" x2="21.5" y2="12"/>
      <line x1="5.28" y1="5.28" x2="18.72" y2="18.72"/>
      <line x1="18.72" y1="5.28" x2="5.28" y2="18.72"/>
      <line x1="12" y1="2.5" x2="12" y2="21.5" transform="rotate(22.5 12 12)"/>
      <line x1="2.5" y1="12" x2="21.5" y2="12" transform="rotate(22.5 12 12)"/>
    </g>
  </svg>
  <svg class="agent-logo agent-logo-terminal" width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" title="Claude Code">
    <rect width="22" height="22" x="1" y="1" rx="6" fill="#18181b"/>
    <path d="M6.5 8.5L10.5 12L6.5 15.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="12.5" y1="15.5" x2="17.5" y2="15.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
  </svg>
  <svg class="agent-logo agent-logo-cursor" width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" title="Cursor">
    <rect width="22" height="22" x="1" y="1" rx="6" fill="#09090b"/>
    <path d="M12 4L18.5 7.75V15.25L12 19L5.5 15.25V7.75L12 4Z" fill="#18181b" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12 4L18.5 7.75L12 11.5L5.5 7.75L12 4Z" fill="#ffffff" fill-opacity="0.95"/>
    <path d="M12 11.5V19L18.5 15.25V7.75L12 11.5Z" fill="#71717a"/>
    <path d="M5.5 7.75L12 11.5V19L5.5 15.25V7.75Z" fill="#3f3f46"/>
  </svg>
  <svg class="agent-logo agent-logo-editor" width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" title="Windsurf &amp; Copilot">
    <rect width="22" height="22" x="1" y="1" rx="6" fill="#09090b"/>
    <rect x="4.5" y="5.5" width="6" height="13" rx="1.5" fill="#ffffff"/>
    <rect x="12.5" y="5.5" width="7" height="13" rx="1.5" fill="#52525b"/>
  </svg>
</span>`;
}

function agentOnboardButtonHtml(site: Pick<DashboardSiteData, "id" | "publicKey" | "domain">): string {
	const prompt = rawAgentPrompt(site);
	return `<button type="button" class="btn-agent-onboard" data-copy-agent-prompt="${escapeHtml(prompt)}" title="Copy setup prompt for Claude Code, Cursor, Windsurf, or Copilot" aria-label="Onboard your agent to agent-404">
  <span class="btn-agent-label">Onboard your agent to agent-404</span>
  ${agentLogosClusterHtml()}
</button>`;
}

function snippetHtml(site: Pick<DashboardSiteData, "id" | "publicKey">): string {
	return escapeHtml(rawScriptSnippet(site));
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

	const warning =
		site.pageCount === 0
			? `<div class="alert-box alert-warning" role="alert">
  <div class="alert-header">
    <svg class="alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <strong>No beacons received</strong>
  </div>
  <p class="alert-desc">
    This site has not indexed any pages yet. The install is not working — an empty page count is not a quiet success.
    Confirm the snippet uses <code>https://www.agent404.dev</code> (not the apex; redirects break CORS preflight),
    then open a live page and check the browser console for <code>[agent-404]</code> warnings.
    You can also call <code>GET /api/install/status</code> with your API key.
  </p>
  <div class="alert-agent-row">
    <span>Let an AI agent inspect and complete the setup for you:</span>
    <button type="button" class="btn-alert-copy-prompt" data-copy-agent-prompt="${escapeHtml(rawAgentPrompt(site))}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
      Copy Agent Prompt
    </button>
  </div>
</div>`
			: "";

	return `
<section class="site-card" id="site-${escapeHtml(site.id)}">
  <div class="site-card-header">
    <div class="site-title-group">
      <div class="site-domain-row">
        <h2 class="site-domain">${escapeHtml(site.domain)}</h2>
        <span class="badge ${site.pageCount > 0 ? "badge-success" : "badge-neutral"}">
          <span class="dot"></span> ${site.pageCount > 0 ? "Active" : "Awaiting Beacons"}
        </span>
        ${agentOnboardButtonHtml(site)}
      </div>
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

  ${warning}

  <!-- Integration Snippets -->
  <div class="integration-panel">
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
      <button type="button" class="btn-copy-agent-quick" data-copy-agent-prompt="${escapeHtml(rawAgentPrompt(site))}" title="Copy complete prompt for AI coding agents">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>Copy Agent Prompt</span>
      </button>
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
          <button type="button" class="copy-btn copy-btn-primary" data-copy-agent-prompt="${escapeHtml(rawAgentPrompt(site))}">Copy Agent Prompt</button>
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
  </div>

  <!-- Key Metrics -->
  <div class="stats-grid">
    <div class="stat-card">
      <span class="stat-label">Indexed Pages</span>
      <div class="stat-value">${site.pageCount.toLocaleString()}</div>
      <span class="stat-hint">${site.pageCount > 0 ? "Continuous sitemap sync" : "No pages yet"}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Suggestions Served</span>
      <div class="stat-value">${site.suggestionsServed.toLocaleString()}</div>
      <span class="stat-hint">Total 404 recoveries</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Last 24 Hours</span>
      <div class="stat-value">${mq.last24h.toLocaleString()}</div>
      <span class="stat-hint">Active bot queries</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Last 7 Days</span>
      <div class="stat-value">${mq.last7d.toLocaleString()}</div>
      <span class="stat-hint">${mq.last30d.toLocaleString()} in 30d</span>
    </div>
  </div>

  <!-- Match Distribution -->
  <div class="section-block">
    <div class="section-title-row">
      <h3 class="section-title">Resolution Breakdown</h3>
      <span class="section-meta">${total > 0 ? `${total} evaluated requests` : "Awaiting traffic"}</span>
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
  </div>

  <!-- Live 404 Sandbox -->
  <div class="section-block">
    <div class="section-title-row">
      <h3 class="section-title">Test 404 Resolution</h3>
      <span class="section-meta">Query the matcher for this domain</span>
    </div>
    <div class="tester-form" data-domain="${escapeHtml(site.domain)}" data-key="${escapeHtml(site.publicKey)}">
      <div class="tester-input-group">
        <span class="tester-prefix">https://${escapeHtml(site.domain)}</span>
        <input type="text" class="tester-path-input" placeholder="/docs/v1/auth" value="/v1/authentication" spellcheck="false" />
        <button type="button" class="btn btn-secondary btn-test-match">Test Match</button>
      </div>
      <div class="tester-result" hidden></div>
    </div>
  </div>

  <!-- Recent 404 Activity -->
  <div class="section-block">
    <div class="section-title-row">
      <h3 class="section-title">Recent 404 Activity</h3>
      <span class="section-meta">${site.recentLogs.length} recent queries</span>
    </div>
    ${
			site.recentLogs.length > 0
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
      agent-404 monitors your site for dead links, indexes active pages automatically, and provides instant semantic 404 recovery to Claude, GPTBot, and browser agents.
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

  /* Onboard Agent Pill Button (Cloudflare-style) */
  .btn-agent-onboard {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    background: #ffffff;
    color: #09090b;
    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: 9999px;
    padding: 0.35rem 0.85rem;
    font-size: 0.8125rem;
    font-weight: 550;
    font-family: var(--font-sans);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15);
    transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
    white-space: nowrap;
    text-decoration: none;
    line-height: 1.2;
    margin-left: auto;
  }
  .btn-agent-onboard:hover {
    background: #ffffff;
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(255, 255, 255, 0.2), 0 2px 4px rgba(0, 0, 0, 0.3);
    border-color: #ffffff;
    color: #000;
  }
  .btn-agent-onboard:active {
    transform: translateY(0);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .btn-agent-onboard.copied {
    background: #ecfdf5;
    border-color: #10b981;
    color: #065f46;
  }

  .agent-logos-cluster {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .agent-logo {
    display: inline-block;
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    vertical-align: middle;
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

  .btn-copy-agent-quick {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.72rem;
    font-family: var(--font-mono);
    padding: 0.25rem 0.6rem;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    transition: all 0.15s;
    margin-bottom: 0.25rem;
  }
  .btn-copy-agent-quick:hover {
    color: var(--text);
    border-color: var(--border-focus);
    background: var(--surface-hover);
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

  .alert-agent-row {
    margin-top: 0.75rem;
    padding-top: 0.65rem;
    border-top: 1px solid rgba(245, 158, 11, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.8rem;
    color: var(--text);
    flex-wrap: wrap;
  }

  .btn-alert-copy-prompt {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    color: #fde68a;
    border-radius: var(--radius-sm);
    padding: 0.25rem 0.6rem;
    font-size: 0.75rem;
    font-family: var(--font-mono);
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    transition: all 0.15s;
  }
  .btn-alert-copy-prompt:hover {
    background: rgba(245, 158, 11, 0.25);
    border-color: rgba(245, 158, 11, 0.6);
    color: #fff;
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
        <p class="dashboard-subtitle">Active sites and HTTP-layer 404 recovery status</p>
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
        const isQuickBtn = btn.classList.contains('btn-copy-agent-quick') || btn.classList.contains('btn-alert-copy-prompt') || btn.classList.contains('copy-btn-primary');

        if (isPill) {
          const labelEl = btn.querySelector('.btn-agent-label');
          if (labelEl) {
            const prev = labelEl.textContent;
            labelEl.textContent = 'Prompt copied! ✓';
            btn.classList.add('copied');
            setTimeout(() => {
              labelEl.textContent = prev;
              btn.classList.remove('copied');
            }, 2000);
          }
        } else if (isQuickBtn) {
          const prev = btn.textContent;
          btn.textContent = 'Copied! ✓';
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
        btn.textContent = 'Test Match';
      }
    });
  });
</script>
</body>
</html>`;
}
