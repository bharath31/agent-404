import { CANONICAL_SCRIPT_URL } from "./config.js";

export function landingPageHtml(opts: { signedIn?: boolean } = {}): string {
	const signedIn = Boolean(opts.signedIn);
	const navAuth = signedIn
		? `<a href="/dashboard">Dashboard</a>
        <a href="/auth/logout">Log out</a>`
		: `<a href="/auth/login?return_to=/dashboard">Sign in</a>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>agent-404 — Self-Healing 404s for AI Agents &amp; Developers</title>
  <meta name="description" content="Stop losing AI agents and developers to dead links. agent-404 intercepts 404s at the HTTP layer and returns instant semantic replacements via JSON-LD and Link headers.">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%233b82f6'/%3E%3Ctext x='50' y='58' font-family='system-ui,sans-serif' font-size='48' font-weight='800' fill='white' text-anchor='middle' dominant-baseline='middle'%3E404%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #09090b;
      --surface: #121215;
      --surface-elevated: #18181d;
      --surface-hover: #202026;
      --border: #27272a;
      --border-subtle: #1c1c21;
      --border-accent: rgba(59, 130, 246, 0.4);
      --text: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --accent: #3b82f6;
      --accent-dim: #2563eb;
      --accent-glow: rgba(59, 130, 246, 0.15);
      --green: #22c55e;
      --green-glow: rgba(34, 197, 94, 0.15);
      --orange: #f97316;
      --red: #ef4444;
      --purple: #a855f7;
      --mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      background-image: 
        radial-gradient(circle at 50% -15%, rgba(59, 130, 246, 0.14) 0%, transparent 55%),
        radial-gradient(circle at 85% 25%, rgba(168, 85, 247, 0.06) 0%, transparent 40%);
      min-height: 100vh;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .container { max-width: 860px; margin: 0 auto; padding: 0 1.5rem; }

    /* Nav */
    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 0;
      border-bottom: 1px solid var(--border-subtle);
    }
    .logo {
      font-family: var(--mono);
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .logo-badge {
      font-size: 0.65rem;
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent);
      border: 1px solid var(--border-accent);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .logo span { color: var(--text-muted); }
    nav .links { display: flex; gap: 1.5rem; font-size: 0.875rem; align-items: center; }
    nav .links a { color: var(--text-secondary); transition: color 0.15s; }
    nav .links a:hover { color: var(--text); text-decoration: none; }

    /* Hero */
    .hero {
      padding: 4rem 0 2.25rem;
      text-align: center;
    }
    .hero .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.95rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.75rem;
      font-family: var(--mono);
      color: var(--text-secondary);
      margin-bottom: 1.5rem;
      background: var(--surface);
    }
    .hero .badge .pulse {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 8px var(--green);
    }
    .hero h1 {
      font-size: 3rem;
      font-weight: 800;
      line-height: 1.12;
      letter-spacing: -0.04em;
      margin-bottom: 1.25rem;
    }
    .hero h1 .highlight {
      background: linear-gradient(135deg, #60a5fa 0%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p.lead {
      font-size: 1.15rem;
      color: var(--text-secondary);
      max-width: 650px;
      margin: 0 auto 2.25rem;
      line-height: 1.6;
    }

    .hero-actions {
      display: flex;
      justify-content: center;
      gap: 0.85rem;
      margin-bottom: 2.75rem;
      flex-wrap: wrap;
    }

    /* Proof Strip */
    .proof-strip {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.35rem 1rem;
      margin-bottom: 2.75rem;
      text-align: center;
    }
    .proof-stat {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .proof-stat .val {
      font-family: var(--mono);
      font-size: 1.45rem;
      font-weight: 700;
      color: var(--text);
    }
    .proof-stat .val.highlight { color: var(--accent); }
    .proof-stat .label {
      font-size: 0.75rem;
      color: var(--text-muted);
      line-height: 1.4;
    }

    /* The Problem Box / Reality Check */
    .problem-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2.75rem;
    }
    .problem-box h3 {
      font-size: 1.05rem;
      font-weight: 700;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .problem-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .problem-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      font-size: 0.82rem;
      line-height: 1.55;
    }
    .problem-card.bad { border-left: 3px solid var(--red); }
    .problem-card.good { border-left: 3px solid var(--green); }
    .problem-card .title {
      font-weight: 700;
      margin-bottom: 0.35rem;
      font-size: 0.85rem;
    }
    .problem-card.bad .title { color: var(--red); }
    .problem-card.good .title { color: var(--green); }
    .problem-card code {
      font-family: var(--mono);
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.05);
      padding: 0.1rem 0.3rem;
      border-radius: 4px;
    }

    /* Live Animated Demo */
    .demo-window {
      max-width: 640px;
      margin: 0 auto 3rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 12px 36px -8px rgba(0, 0, 0, 0.5);
    }
    .demo-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.65rem 1rem;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .demo-dots { display: flex; gap: 0.4rem; }
    .demo-dot { width: 9px; height: 9px; border-radius: 50%; }
    .demo-dot:nth-child(1) { background: #ef4444; }
    .demo-dot:nth-child(2) { background: #f97316; }
    .demo-dot:nth-child(3) { background: #22c55e; }
    .demo-title {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--text-muted);
    }
    .demo-body {
      padding: 1.35rem 1.25rem;
      min-height: 96px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.5rem;
    }
    .demo-row {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      font-family: var(--mono);
      font-size: 0.84rem;
      line-height: 1.7;
    }
    .demo-label {
      flex-shrink: 0;
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      width: 3.4rem;
      text-align: center;
    }
    .demo-label.miss {
      background: rgba(239, 68, 68, 0.15);
      color: var(--red);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .demo-label.hit {
      background: rgba(34, 197, 94, 0.15);
      color: var(--green);
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .demo-url {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .demo-url.dead {
      color: var(--text-muted);
      text-decoration: line-through;
      text-decoration-color: #52525b;
    }
    .demo-url.live {
      color: var(--green);
      font-weight: 500;
    }

    /* Installation Switcher Box */
    .install-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.75rem;
      margin: 0 auto 3rem;
      text-align: left;
    }
    .install-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .install-header .label {
      font-family: var(--mono);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text);
      font-weight: 700;
    }
    .tabs {
      display: flex;
      gap: 0.35rem;
      background: var(--bg);
      padding: 0.25rem;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-family: var(--mono);
      font-size: 0.75rem;
      padding: 0.35rem 0.8rem;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active {
      background: var(--surface-elevated);
      color: var(--text);
      font-weight: 600;
      border: 1px solid var(--border);
    }

    .code-preview {
      position: relative;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .code-preview pre {
      font-family: var(--mono);
      font-size: 0.82rem;
      line-height: 1.65;
      color: var(--text);
      overflow-x: auto;
      white-space: pre;
    }
    .code-preview .kw { color: #f472b6; }
    .code-preview .fn { color: #60a5fa; }
    .code-preview .str { color: var(--green); }
    .code-preview .comment { color: #52525b; }

    .copy-btn {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-secondary);
      padding: 0.3rem 0.55rem;
      font-size: 0.7rem;
      font-family: var(--mono);
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .copy-btn:hover { color: var(--text); border-color: var(--text-secondary); }
    .copy-btn.copied { color: var(--green); border-color: var(--green); }

    /* Domain Register Card inside Install Box */
    .domain-cta {
      border-top: 1px dashed var(--border);
      padding-top: 1.25rem;
    }
    .domain-cta h4 {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 0.35rem;
    }
    .domain-cta p {
      font-size: 0.82rem;
      color: var(--text-secondary);
      margin-bottom: 0.85rem;
    }

    /* Sections */
    .section {
      padding: 3.5rem 0;
      border-top: 1px solid var(--border-subtle);
    }
    .section h2 {
      font-size: 1.85rem;
      font-weight: 800;
      margin-bottom: 0.5rem;
      letter-spacing: -0.03em;
    }
    .section p.sub {
      color: var(--text-secondary);
      font-size: 0.98rem;
      margin-bottom: 2rem;
      max-width: 680px;
    }

    /* How it works */
    .flow {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .flow-card {
      display: flex;
      gap: 1.25rem;
      padding: 1.35rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      transition: border-color 0.15s;
    }
    .flow-card:hover { border-color: var(--border-accent); }
    .flow-card .step-num {
      flex-shrink: 0;
      width: 2.35rem;
      height: 2.35rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: var(--accent);
      border-radius: 8px;
      font-family: var(--mono);
      font-size: 0.85rem;
      font-weight: 700;
    }
    .flow-card h3 {
      font-size: 1.05rem;
      font-weight: 600;
      margin-bottom: 0.35rem;
    }
    .flow-card p {
      font-size: 0.88rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }
    .flow-card .tag-badge {
      display: inline-block;
      margin-top: 0.6rem;
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--text-secondary);
      background: var(--bg);
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      border: 1px solid var(--border);
    }

    /* Engine Weight Grid */
    .signals-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      margin-top: 1.5rem;
    }
    .signal-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.85rem 0.75rem;
      text-align: center;
    }
    .signal-pct {
      font-family: var(--mono);
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 0.2rem;
    }
    .signal-title {
      font-size: 0.78rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .signal-desc {
      font-size: 0.7rem;
      color: var(--text-muted);
      line-height: 1.35;
    }

    /* Use cases */
    .use-cases {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .use-case {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      padding: 1.35rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .use-case .icon-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .use-case .icon {
      font-size: 1.15rem;
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .use-case h3 {
      font-size: 0.98rem;
      font-weight: 600;
    }
    .use-case p {
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* Interactive Audit Banner */
    .audit-banner {
      background: linear-gradient(135deg, #181438 0%, #0d1222 100%);
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: 12px;
      padding: 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      flex-wrap: wrap;
      margin: 1.5rem 0 3.5rem;
      box-shadow: 0 8px 24px -6px rgba(99, 102, 241, 0.15);
    }
    .audit-banner h3 {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 0.4rem;
      color: #fff;
    }
    .audit-banner p {
      font-size: 0.9rem;
      color: #cbd5e1;
      max-width: 520px;
      line-height: 1.55;
    }

    /* CTA Section */
    .cta {
      text-align: center;
      padding: 4rem 0 2.5rem;
      border-top: 1px solid var(--border-subtle);
    }
    .cta h2 {
      font-size: 2.1rem;
      font-weight: 800;
      margin-bottom: 0.75rem;
      letter-spacing: -0.03em;
    }
    .cta p {
      color: var(--text-secondary);
      margin-bottom: 2rem;
      font-size: 1rem;
      max-width: 580px;
      margin-left: auto;
      margin-right: auto;
    }
    .btn-group { display: flex; gap: 0.85rem; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.65rem 1.35rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      transition: all 0.15s;
    }
    .btn-primary {
      background: var(--accent);
      color: white;
    }
    .btn-primary:hover { background: var(--accent-dim); text-decoration: none; }
    .btn-vercel {
      background: #fff;
      color: #000;
    }
    .btn-vercel:hover { background: #e5e5e5; text-decoration: none; }
    .btn-secondary {
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { border-color: var(--text-secondary); text-decoration: none; }

    /* Footer */
    footer {
      padding: 2.5rem 0 2rem;
      border-top: 1px solid var(--border-subtle);
      text-align: center;
      font-size: 0.82rem;
      color: #52525b;
    }
    footer a { color: #71717a; }
    footer a:hover { color: var(--text-secondary); }

    @media (max-width: 700px) {
      .hero h1 { font-size: 2.2rem; }
      .proof-strip { grid-template-columns: 1fr; gap: 0.75rem; }
      .problem-grid { grid-template-columns: 1fr; }
      .signals-grid { grid-template-columns: 1fr 1fr; }
      .use-cases { grid-template-columns: 1fr; }
      .install-box { padding: 1.25rem; }
    }
  </style>
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
  <div class="container">
    <nav>
      <div class="logo">
        agent<span>-</span>404
        <span class="logo-badge">Self-Healing HTTP</span>
      </div>
      <div class="links">
        <a href="/demo">Live Audit</a>
        <a href="https://github.com/bharath31/agent-404">GitHub</a>
        ${navAuth}
      </div>
    </nav>

    <div class="hero">
      <div class="badge">
        <span class="pulse"></span>
        <span>Self-Healing Docs &amp; APIs for the Agent Stack</span>
      </div>
      <h1>When AI agents hit a dead link,<br><span class="highlight">give them the right page automatically.</span></h1>
      <p class="lead">AI coding assistants, RAG pipelines, and LLMs constantly query outdated documentation URLs from their pre-training. agent-404 intercepts 404s at the HTTP layer and returns ranked, semantic replacements in &lt;25ms &mdash; before agents hallucinate or give up.</p>
      
      <div class="hero-actions">
        <a href="/demo" class="btn btn-primary">Audit Your Documentation (Free) &rarr;</a>
        <a href="#install" class="btn btn-secondary">Get API Keys</a>
      </div>
    </div>

    <div class="proof-strip">
      <div class="proof-stat">
        <span class="val highlight">3&times; Higher</span>
        <span class="label">404 citation rate from LLMs compared to traditional search</span>
      </div>
      <div class="proof-stat">
        <span class="val">&lt;25ms</span>
        <span class="label">cached pgvector semantic resolution latency</span>
      </div>
      <div class="proof-stat">
        <span class="val highlight">100% Agent-Native</span>
        <span class="label">RFC Link headers &amp; schema.org ItemList JSON-LD</span>
      </div>
    </div>

    <div class="problem-box">
      <h3>The AI Agent 404 Problem in 2026</h3>
      <div class="problem-grid">
        <div class="problem-card bad">
          <div class="title">Without agent-404</div>
          <p>An AI coding agent (Cursor, Claude Code, Copilot) follows a moved URL like <code>/docs/v2/auth</code>. It receives a blank 404, assumes the capability does not exist, and hallucinates broken deprecated code.</p>
        </div>
        <div class="problem-card good">
          <div class="title">With agent-404</div>
          <p>The agent receives a 404 accompanied by <code>Link: &lt;/docs/v3/auth&gt;; rel="alternate"</code> and structured JSON-LD. The agent immediately self-corrects and generates working code.</p>
        </div>
      </div>
    </div>

    <div class="demo-window">
      <div class="demo-header">
        <div class="demo-dots">
          <div class="demo-dot"></div>
          <div class="demo-dot"></div>
          <div class="demo-dot"></div>
        </div>
        <div class="demo-title">agent-404 &mdash; live semantic resolution</div>
      </div>
      <div class="demo-body" id="demo-body">
        <div class="demo-row">
          <span class="demo-label miss">404</span>
          <span class="demo-url dead" id="demo-dead"></span>
        </div>
        <div class="demo-row" id="demo-match-row" style="opacity:0">
          <span class="demo-label hit">found</span>
          <span class="demo-url live" id="demo-live"></span>
        </div>
      </div>
    </div>

    <div class="install-box" id="install">
      <div class="install-header">
        <div class="label">Install in 60 Seconds</div>
        <div class="tabs">
          <button class="tab-btn active" onclick="switchTab('next')">Next.js</button>
          <button class="tab-btn" onclick="switchTab('worker')">Cloudflare Worker</button>
          <button class="tab-btn" onclick="switchTab('express')">Express / Node</button>
          <button class="tab-btn" onclick="switchTab('script')">HTML Script</button>
        </div>
      </div>

      <div class="code-preview" id="snippet-next">
        <pre><span class="comment">// middleware.ts — intercepts 404s before headers are committed</span>
<span class="kw">import</span> { agent404 } <span class="kw">from</span> <span class="str">"@agent-404/next"</span>;

<span class="kw">export const</span> middleware = <span class="fn">agent404</span>({
  apiKey: process.env.<span class="fn">AGENT404_PUBLIC_KEY</span>!,
});</pre>
      </div>

      <div class="code-preview" id="snippet-worker" style="display:none">
        <pre><span class="comment">// worker.ts — Cloudflare Workers 404 recovery</span>
<span class="kw">import</span> { agent404Worker } <span class="kw">from</span> <span class="str">"@agent-404/cloudflare"</span>;

<span class="kw">export default</span> {
  fetch: <span class="fn">agent404Worker</span>(handler, {
    apiKey: env.<span class="fn">AGENT404_PUBLIC_KEY</span>,
  }),
};</pre>
      </div>

      <div class="code-preview" id="snippet-express" style="display:none">
        <pre><span class="comment">// app.ts — Express / Node middleware</span>
<span class="kw">import</span> { recoverExpress404 } <span class="kw">from</span> <span class="str">"@agent-404/express"</span>;

app.<span class="fn">use</span>(<span class="fn">recoverExpress404</span>({ apiKey: process.env.<span class="fn">AGENT404_PUBLIC_KEY</span>! }));</pre>
      </div>

      <div class="code-preview" id="snippet-script" style="display:none">
        <pre><span class="comment">&lt;!-- Zero-config fallback for human browsers &amp; JS clients --&gt;</span>
&lt;<span class="kw">script</span>
  src=<span class="str">"${CANONICAL_SCRIPT_URL}"</span>
  data-site-id=<span class="str">"your-site-id"</span>
  data-public-key=<span class="str">"your-public-key"</span>
  defer
&gt;&lt;/<span class="kw">script</span>&gt;</pre>
      </div>

      <div class="domain-cta">
        <h4>Register your domain for API keys</h4>
        <p>Enter your domain. We'll email a one-time login code &mdash; no password required.</p>
        <div id="register-form">
          <div style="display:flex;gap:0.5rem;align-items:stretch">
            <input type="text" id="domain-input" placeholder="yoursite.com"
              style="flex:1;padding:0.65rem 0.85rem;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--mono);font-size:0.85rem;outline:none"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
            >
            <button id="register-btn" onclick="registerSite()"
              style="padding:0.65rem 1.35rem;background:var(--accent);color:white;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:background 0.15s"
              onmouseover="this.style.background='var(--accent-dim)'" onmouseout="this.style.background='var(--accent)'"
            >Get Keys &rarr;</button>
          </div>
          <p id="register-error" class="form-error" hidden style="margin-top:0.5rem;font-size:0.8rem;color:var(--red)"></p>
          <div id="claim-panel" hidden style="margin-top:0.75rem">
            <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.4rem">Paste the API key from your existing script tag to link this domain.</p>
            <div style="display:flex;gap:0.5rem">
              <input type="text" id="claim-key-input" placeholder="key_…" autocomplete="off"
                style="flex:1;padding:0.6rem 0.8rem;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--mono);font-size:0.85rem;outline:none">
              <button type="button" id="claim-btn"
                style="padding:0.6rem 1.25rem;background:var(--accent);color:white;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;white-space:nowrap"
              >Link site</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="audit-banner">
      <div>
        <h3>Test your documentation before installing</h3>
        <p>Run a free audit on your live sitemap. See what AI assistants receive on broken URLs and preview real-time vector matching on moved endpoints.</p>
      </div>
      <a href="/demo" class="btn btn-primary" style="white-space:nowrap;">Launch Interactive Audit &rarr;</a>
    </div>

    <div class="section">
      <h2>How it works</h2>
      <p class="sub">Three steps to recover lost developer and AI traffic automatically.</p>
      
      <div class="flow">
        <div class="flow-card">
          <div class="step-num">01</div>
          <div>
            <h3>Intercept at the HTTP layer</h3>
            <p>Middleware catches the 404 before the response body is flushed. Fast vector lookup (&lt;25ms) queries your indexed sitemap without adding latency to live pages.</p>
            <div class="tag-badge">Next.js &middot; Cloudflare Workers &middot; Express &middot; Netlify &middot; nginx</div>
          </div>
        </div>

        <div class="flow-card">
          <div class="step-num">02</div>
          <div>
            <h3>4-signal hybrid ranking</h3>
            <p>Scores live pages against the dead URL using path Jaccard similarity, pgvector semantic cosine embeddings, Levenshtein edit distance, and keyword overlap.</p>
            
            <div class="signals-grid">
              <div class="signal-card">
                <div class="signal-pct">35%</div>
                <div class="signal-title">Path Jaccard</div>
                <div class="signal-desc">Catches version bumps (/v2 &rarr; /v3)</div>
              </div>
              <div class="signal-card">
                <div class="signal-pct">30%</div>
                <div class="signal-title">pgvector 256d</div>
                <div class="signal-desc">Catches zero-overlap renames</div>
              </div>
              <div class="signal-card">
                <div class="signal-pct">20%</div>
                <div class="signal-title">Levenshtein</div>
                <div class="signal-desc">Handles typos and pluralization</div>
              </div>
              <div class="signal-card">
                <div class="signal-pct">15%</div>
                <div class="signal-title">Keyword Match</div>
                <div class="signal-desc">Matches titles &amp; H1 headings</div>
              </div>
            </div>
          </div>
        </div>

        <div class="flow-card">
          <div class="step-num">03</div>
          <div>
            <h3>Deliver structured agent recovery</h3>
            <p>Returns ranked HTML links for human visitors, schema.org ItemList JSON-LD and Link alternate headers for AI tools, and structured JSON on Accept: application/json.</p>
            <div class="tag-badge">HTTP Link headers &middot; schema.org JSON-LD &middot; RFC-compliant 404s</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Built for the entire agent stack</h2>
      <p class="sub">Where standard 404 pages break modern AI workflows.</p>
      
      <div class="use-cases">
        <div class="use-case">
          <div class="icon-row">
            <div class="icon">🤖</div>
            <h3>Coding Assistants (Claude Code, Cursor, Copilot)</h3>
          </div>
          <p>Models query documentation links baked into their pre-training data. When your docs restructure, agents hit 404s and hallucinate. agent-404 serves structured JSON-LD so models self-correct automatically.</p>
        </div>

        <div class="use-case">
          <div class="icon-row">
            <div class="icon">⚡</div>
            <h3>RAG Pipelines &amp; Document Crawlers</h3>
          </div>
          <p>Retrieval systems index URLs that break after API version bumps. Instead of returning empty context or broken citations, systems receive the matching destination endpoint immediately.</p>
        </div>

        <div class="use-case">
          <div class="icon-row">
            <div class="icon">🧭</div>
            <h3>Autonomous Web &amp; Workflow Agents</h3>
          </div>
          <p>Browser-use and API agents navigating your application give up when links 404. Standardized schema.org suggestions provide instant fallback targets to keep the run moving.</p>
        </div>

        <div class="use-case">
          <div class="icon-row">
            <div class="icon">🔌</div>
            <h3>Model Context Protocol (MCP) Tools</h3>
          </div>
          <p>MCP tool calls requesting documentation or assets receive ranked alternative endpoints rather than an unparseable generic error page.</p>
        </div>
      </div>
    </div>

    <div class="cta">
      <h2>Stop losing developers to broken links</h2>
      <p>Self-host with one click on Vercel or Cloudflare, or register your domain for instant hosted keys.<br>100% open source, MIT licensed, and privacy-preserving.</p>
      
      <div class="btn-group">
        <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbharath31%2Fagent-404&env=DATABASE_URL,EMBEDDING_API_KEY,CRON_SECRET,AUTH0_DOMAIN,AUTH0_CLIENT_ID,AUTH0_CLIENT_SECRET,AUTH0_SESSION_ENCRYPTION_KEY,BASE_URL&envDescription=DATABASE_URL%3A%20Neon%20Postgres.%20Auth0%20passwordless%20email%20OTP%20for%20the%20dashboard.&project-name=agent-404&repository-name=agent-404" class="btn btn-vercel">
          <svg width="16" height="16" viewBox="0 0 76 65" fill="currentColor"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/></svg>
          Deploy to Vercel
        </a>
        <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/bharath31/agent-404" style="display:inline-flex;align-items:center;">
          <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" height="36">
        </a>
        <a href="https://github.com/bharath31/agent-404" class="btn btn-secondary">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          View on GitHub
        </a>
      </div>
    </div>

    <footer>
      Built with ❤️ by <a href="https://bharath.sh">Bharath Natarajan</a> &middot; <a href="https://github.com/bharath31/agent-404">Source</a> &middot; <a href="/demo">Live Audit</a>
    </footer>
  </div>
  <script>
    // Tab switching for install snippets
    function switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = event.currentTarget;
      if (activeBtn) activeBtn.classList.add('active');
      
      const snippetNext = document.getElementById('snippet-next');
      const snippetWorker = document.getElementById('snippet-worker');
      const snippetExpress = document.getElementById('snippet-express');
      const snippetScript = document.getElementById('snippet-script');
      
      if (snippetNext) snippetNext.style.display = tab === 'next' ? 'block' : 'none';
      if (snippetWorker) snippetWorker.style.display = tab === 'worker' ? 'block' : 'none';
      if (snippetExpress) snippetExpress.style.display = tab === 'express' ? 'block' : 'none';
      if (snippetScript) snippetScript.style.display = tab === 'script' ? 'block' : 'none';
    }

    // Copy buttons for code blocks
    function addCopyBtn(block) {
      const pre = block.querySelector('pre');
      if (!pre) return;
      const existing = block.querySelector('.copy-btn');
      if (existing) existing.remove();
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.textContent).then(() => {
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Copied';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy';
            btn.classList.remove('copied');
          }, 2000);
        });
      });
      block.appendChild(btn);
    }
    document.querySelectorAll('.code-preview').forEach(addCopyBtn);

    // Animated demo
    const examples = [
      { dead: '/docs/customize/login-pages/acul', live: '/docs/customize/login-pages/advanced-customizations', domain: 'auth0.com' },
      { dead: '/payment/checkout',           live: '/payments/checkout',          domain: 'docs.stripe.com' },
      { dead: '/docs/app/building-your-application/deploying/static-html-export', live: '/docs/app/guides/static-exports', domain: 'nextjs.org' },
      { dead: '/docs/edge-functions/overview', live: '/docs/functions',          domain: 'vercel.com' },
      { dead: '/docs/auth/overview',        live: '/docs/guides/auth',           domain: 'supabase.com' },
      { dead: '/reference/hooks',           live: '/reference/react/hooks',      domain: 'react.dev' },
    ];
    let demoIdx = 0;
    const demoDead = document.getElementById('demo-dead');
    const demoLive = document.getElementById('demo-live');
    const demoMatchRow = document.getElementById('demo-match-row');

    function runDemo() {
      const ex = examples[demoIdx % examples.length];
      demoIdx++;

      // Phase 1: show the dead URL
      demoMatchRow.style.opacity = '0';
      demoMatchRow.style.transform = 'translateY(4px)';
      demoDead.textContent = ex.domain + ex.dead;
      demoDead.style.opacity = '0';
      demoDead.style.transform = 'translateY(4px)';
      requestAnimationFrame(() => {
        demoDead.style.transition = 'all 0.4s ease';
        demoDead.style.opacity = '1';
        demoDead.style.transform = 'translateY(0)';
      });

      // Phase 2: after a beat, show the match
      setTimeout(() => {
        demoLive.textContent = ex.domain + ex.live;
        demoMatchRow.style.transition = 'all 0.4s ease';
        demoMatchRow.style.opacity = '1';
        demoMatchRow.style.transform = 'translateY(0)';
      }, 800);

      // Phase 3: hold, then cycle
      setTimeout(runDemo, 3000);
    }
    setTimeout(runDemo, 600);

    // Domain registration — passwordless email OTP via Auth0, then dashboard
    const signedIn = ${signedIn};
    const domainInput = document.getElementById('domain-input');
    const errorEl = document.getElementById('register-error');
    const claimPanel = document.getElementById('claim-panel');
    domainInput.addEventListener('keydown', e => { if (e.key === 'Enter') registerSite(); });
    document.getElementById('claim-btn').addEventListener('click', claimSite);

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = !msg;
    }

    function loginUrl(domain) {
      const returnTo = domain
        ? '/dashboard?register=' + encodeURIComponent(domain)
        : '/dashboard';
      return '/auth/login?return_to=' + encodeURIComponent(returnTo);
    }

    async function registerSite() {
      let domain = domainInput.value.trim();
      if (!domain) { domainInput.focus(); return; }
      domain = domain.replace(/^https?:\\/\\//, '').replace(/\\/+\$/, '');
      showError('');
      claimPanel.hidden = true;

      if (!signedIn) {
        window.location.href = loginUrl(domain);
        return;
      }

      const btn = document.getElementById('register-btn');
      const origText = btn.textContent;
      btn.textContent = 'Generating...';
      btn.disabled = true;
      btn.style.opacity = '0.7';

      try {
        const res = await fetch('/api/sites', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain })
        });

        if (res.status === 401) {
          window.location.href = loginUrl(domain);
          return;
        }

        if (res.status === 201 || res.status === 200) {
          window.location.href = '/dashboard';
          return;
        }

        const err = await res.json().catch(() => ({}));
        if (res.status === 409 && err.code === 'unowned') {
          claimPanel.hidden = false;
          claimPanel.dataset.domain = err.domain || domain;
          showError(err.error || 'Link this site with your API key.');
          return;
        }
        showError(err.error || 'Something went wrong');
      } catch {
        showError('Network error — please try again');
      } finally {
        btn.textContent = origText;
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }

    async function claimSite() {
      const domain = claimPanel.dataset.domain || domainInput.value.trim();
      const apiKey = document.getElementById('claim-key-input').value.trim();
      showError('');
      const res = await fetch('/api/sites/claim', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, apiKey })
      });
      if (res.ok) {
        window.location.href = '/dashboard';
        return;
      }
      const err = await res.json().catch(() => ({}));
      showError(err.error || 'Could not link this site.');
    }
  </script>
  <script
    src="${CANONICAL_SCRIPT_URL}"
    data-site-id="a0beb545-91af-4ea4-8de5-f37c5e0118df"
    data-api-key="key_e644afe7a33f4b13b8e21446abe70ccb"
    defer
  ></script>
</body>
</html>
`;
}
