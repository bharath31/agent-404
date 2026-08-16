import { CANONICAL_SCRIPT_URL } from "../config.js";

export function landingPageHtml(opts: { signedIn?: boolean } = {}): string {
	const signedIn = Boolean(opts.signedIn);
	const navAuth = signedIn
		? `<a href="/dashboard" class="btn btn-sm btn-secondary">Dashboard</a>
       <a href="/auth/logout" class="nav-link">Log out</a>`
		: `<a href="/auth/login?return_to=/dashboard" class="btn btn-sm btn-primary">Sign in</a>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>agent-404 — Self-Healing 404s for AI Agents &amp; Developers</title>
  <meta name="description" content="Stop losing AI agents to broken docs links. agent-404 intercepts 404s at the HTTP layer and returns instant semantic replacements via RFC Link headers and JSON-LD schema.">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%2310b981'/%3E%3Ctext x='50' y='58' font-family='system-ui,sans-serif' font-size='48' font-weight='800' fill='white' text-anchor='middle' dominant-baseline='middle'%3E404%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
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

    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 0 1.5rem 4rem;
    }

    /* Top Navigation */
    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 0;
      border-bottom: 1px solid var(--border-subtle);
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .logo {
      font-family: var(--font-mono);
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.4rem;
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

    .nav-links {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }

    .nav-link {
      font-size: 0.85rem;
      color: var(--text-secondary);
      transition: color 0.15s;
    }
    .nav-link:hover { color: var(--text); }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.6rem 1.15rem;
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

    .btn-sm {
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
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
      text-decoration: none;
    }

    .btn-secondary {
      background: var(--surface);
      color: var(--text);
      border-color: var(--border);
    }
    .btn-secondary:hover {
      background: var(--surface-hover);
      border-color: var(--border-focus);
      text-decoration: none;
    }

    /* Hero */
    .hero {
      padding: 4.5rem 0 3rem;
      text-align: center;
    }

    .hero-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.3rem 0.85rem;
      border-radius: 999px;
      background: var(--surface);
      border: 1px solid var(--border);
      font-size: 0.75rem;
      font-family: var(--font-mono);
      color: var(--text-secondary);
      margin-bottom: 1.5rem;
    }

    .hero-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--emerald);
    }

    .hero h1 {
      font-size: 2.85rem;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.035em;
      margin-bottom: 1rem;
      color: var(--text);
    }

    .hero h1 .highlight {
      color: var(--text-muted);
      font-weight: 600;
    }

    .hero p.hero-desc {
      font-size: 1.05rem;
      color: var(--text-secondary);
      max-width: 600px;
      margin: 0 auto 2rem;
      line-height: 1.6;
    }

    .hero-cta-group {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 2.5rem;
    }

    /* Quick Register Bar */
    .hero-register-box {
      max-width: 500px;
      margin: 0 auto 3rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.35rem 0.4rem 0.35rem 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .hero-register-input {
      flex: 1;
      background: none;
      border: none;
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 0.85rem;
      outline: none;
    }

    /* Comparison Terminal (Signature Element) */
    .comparison-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      margin-bottom: 4rem;
      text-align: left;
    }

    .terminal-top-bar {
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--border);
      padding: 0.65rem 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .term-dots-group {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .term-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #27272a;
    }

    .term-title {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .term-badge {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      text-transform: uppercase;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: var(--emerald-subtle);
      color: var(--emerald);
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .comparison-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    @media (max-width: 700px) {
      .comparison-grid { grid-template-columns: 1fr; }
    }

    .term-column {
      padding: 1.25rem 1.5rem;
    }
    .term-column-bad {
      border-right: 1px solid var(--border-subtle);
      background: rgba(244, 63, 94, 0.02);
    }
    .term-column-good {
      background: rgba(16, 185, 129, 0.02);
    }

    .term-col-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .term-col-header.bad { color: var(--rose); }
    .term-col-header.good { color: var(--emerald); }

    .term-snippet {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      line-height: 1.7;
      color: var(--text-secondary);
      white-space: pre-wrap;
    }
    .t-method { color: #f43f5e; }
    .t-status { color: #f59e0b; }
    .t-header { color: #38bdf8; }
    .t-val { color: #34d399; }
    .t-dim { color: #71717a; }

    /* Live Animated Ticker */
    .ticker-container {
      border-top: 1px solid var(--border-subtle);
      padding: 0.75rem 1.5rem;
      background: var(--bg);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: var(--font-mono);
      font-size: 0.75rem;
    }
    .ticker-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      overflow: hidden;
    }
    .ticker-tag-dead {
      color: var(--rose);
      background: var(--rose-subtle);
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      font-size: 0.65rem;
      font-weight: 600;
    }
    .ticker-tag-live {
      color: var(--emerald);
      background: var(--emerald-subtle);
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      font-size: 0.65rem;
      font-weight: 600;
    }
    .ticker-url {
      color: var(--text-muted);
      text-decoration: line-through;
    }
    .ticker-arrow { color: var(--text-muted); }
    .ticker-dest { color: var(--text); font-weight: 500; }

    /* Framework Tabs */
    .section-title-wrap {
      margin-bottom: 1.5rem;
    }
    .section-eyebrow {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      display: block;
      margin-bottom: 0.35rem;
    }
    .section-h2 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .section-desc {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
    }

    .install-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      margin-bottom: 4rem;
    }

    .install-tabs {
      display: flex;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--border);
      padding: 0.25rem 0.75rem 0;
      gap: 0.25rem;
      overflow-x: auto;
    }

    .tab-btn {
      background: none;
      border: none;
      padding: 0.55rem 0.85rem;
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
      border-bottom: 2px solid var(--text);
      font-weight: 600;
    }

    .tab-panel { display: none; padding: 1.25rem; }
    .tab-panel.active { display: block; }

    .code-preview {
      position: relative;
      background: var(--bg);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 1rem 1.25rem;
    }
    .code-preview pre {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      line-height: 1.65;
      color: var(--text);
      overflow-x: auto;
    }

    .copy-btn {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
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

    /* Pillars Grid */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
      margin-bottom: 4rem;
    }
    @media (max-width: 640px) {
      .features-grid { grid-template-columns: 1fr; }
    }

    .feature-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1.5rem;
    }

    .feature-tag {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
      display: block;
    }

    .feature-title {
      font-size: 1.05rem;
      font-weight: 600;
      margin-bottom: 0.4rem;
      letter-spacing: -0.01em;
    }

    .feature-desc {
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.55;
    }

    /* How it works */
    .flow-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
      margin-bottom: 4rem;
    }
    @media (max-width: 768px) {
      .flow-grid { grid-template-columns: 1fr; }
    }

    .flow-step-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1.5rem;
    }

    .flow-step-num {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1rem;
    }

    .flow-step-title {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 0.35rem;
    }

    .flow-step-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* CTA Section */
    .cta-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 3rem 2rem;
      text-align: center;
      margin-bottom: 3rem;
    }

    .cta-card h2 {
      font-size: 1.65rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 0.5rem;
    }

    .cta-card p {
      font-size: 0.9rem;
      color: var(--text-secondary);
      max-width: 520px;
      margin: 0 auto 1.75rem;
    }

    .cta-btn-group {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    /* Footer */
    footer {
      border-top: 1px solid var(--border-subtle);
      padding-top: 1.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    footer a { color: var(--text-secondary); }
    footer a:hover { color: var(--text); }

    /* Toast */
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
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--emerald); }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <div class="brand-group">
        <a href="/" class="logo">
          agent<span>-</span>404
        </a>
        <span class="brand-badge">open source</span>
      </div>

      <div class="nav-links">
        <a href="/demo" class="nav-link">Live Audit</a>
        <a href="https://github.com/bharath31/agent-404" class="nav-link" target="_blank" rel="noopener">GitHub</a>
        ${navAuth}
      </div>
    </nav>

    <!-- Hero -->
    <div class="hero">
      <div class="hero-eyebrow">
        <span class="hero-dot"></span>
        <span>HTTP-layer 404 recovery for AI agents</span>
      </div>

      <h1>Your docs change.<br><span class="highlight">Don't lose agents to 404s.</span></h1>
      
      <p class="hero-desc">
        When Claude, Cursor, or GPTBot hit a moved URL, agent-404 intercepts at the edge — returning ranked semantic suggestions via RFC Link headers and JSON-LD schema so agents recover immediately.
      </p>

      <form class="hero-register-box" id="hero-register-form">
        <input
          type="text"
          id="hero-domain-input"
          class="hero-register-input"
          placeholder="docs.yourcompany.com"
          autocomplete="off"
          spellcheck="false"
          required
        />
        <button type="submit" class="btn btn-primary btn-sm">Get Started &rarr;</button>
      </form>
      <p id="hero-register-error" class="form-error" hidden style="margin-top:-2rem;margin-bottom:2.5rem;font-size:0.8rem;color:var(--rose)"></p>

      <div class="hero-cta-group">
        <a href="/demo" class="btn btn-secondary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          Audit Your Live Site
        </a>
        <a href="https://github.com/bharath31/agent-404" class="btn btn-secondary" target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          View on GitHub
        </a>
      </div>
    </div>

    <!-- Comparison Terminal -->
    <div class="comparison-card">
      <div class="terminal-top-bar">
        <div class="term-dots-group">
          <span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span>
          <span class="term-title">HTTP 404 Response Comparison</span>
        </div>
        <span class="term-badge">Live Resolution</span>
      </div>

      <div class="comparison-grid">
        <div class="term-column term-column-bad">
          <div class="term-col-header bad">Without agent-404</div>
          <div class="term-snippet"><span class="t-method">GET</span> /docs/v1/authentication
<span class="t-status">HTTP/1.1 404 Not Found</span>
<span class="t-header">Content-Type:</span> text/html

<span class="t-dim">&lt;!-- Client-side SPA HTML. --&gt;
&lt;!-- Crawlers do not execute JS. --&gt;
&lt;!-- Agent assumes feature is missing --&gt;
&lt;!-- and hallucinates or gives up. --&gt;</span></div>
        </div>

        <div class="term-column term-column-good">
          <div class="term-col-header good">With agent-404</div>
          <div class="term-snippet"><span class="t-method">GET</span> /docs/v1/authentication
<span class="t-status">HTTP/1.1 404 Not Found</span>
<span class="t-header">Link:</span> <span class="t-val">&lt;/docs/v2/auth&gt;; rel="alternate"</span>
<span class="t-header">Content-Type:</span> text/html; schema.org

<span class="t-dim">&lt;script type="application/ld+json"&gt;
{ "@type": "ItemList", "name": "/docs/v2/auth" }
&lt;/script&gt;
&lt;!-- Agent recovers in 1 hop --&gt;</span></div>
        </div>
      </div>

      <div class="ticker-container">
        <div class="ticker-left">
          <span class="ticker-tag-dead">404</span>
          <span class="ticker-url" id="ticker-dead">auth0.com/docs/customize/login-pages/acul</span>
          <span class="ticker-arrow">&rarr;</span>
          <span class="ticker-tag-live">found</span>
          <span class="ticker-dest" id="ticker-live">auth0.com/docs/customize/login-pages/advanced-customizations</span>
        </div>
      </div>
    </div>

    <!-- Framework Integration -->
    <div class="section-title-wrap">
      <span class="section-eyebrow">Integration</span>
      <h2 class="section-h2">Install in under 60 seconds</h2>
      <p class="section-desc">Zero external dependencies. Compatible with edge runtimes and serverless adapters.</p>
    </div>

    <div class="install-box">
      <div class="install-tabs" role="tablist">
        <button type="button" class="tab-btn active" onclick="switchTab('next')">Next.js</button>
        <button type="button" class="tab-btn" onclick="switchTab('cf')">Cloudflare Worker</button>
        <button type="button" class="tab-btn" onclick="switchTab('express')">Express</button>
        <button type="button" class="tab-btn" onclick="switchTab('script')">HTML Script Tag</button>
      </div>

      <div class="tab-panel active" id="tab-panel-next">
        <div class="code-preview">
          <button type="button" class="copy-btn" data-copy="import { agent404 } from &quot;@agent-404/next&quot;;

export const middleware = agent404({
  apiKey: process.env.AGENT404_PUBLIC_KEY!,
});

export const config = {
  matcher: [&quot;/((?!api|_next/static|_next/image|favicon.ico).*)&quot;],
};">Copy</button>
          <pre><code>import { agent404 } from "@agent-404/next";

export const middleware = agent404({
  apiKey: process.env.AGENT404_PUBLIC_KEY!,
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};</code></pre>
        </div>
      </div>

      <div class="tab-panel" id="tab-panel-cf">
        <div class="code-preview">
          <button type="button" class="copy-btn" data-copy="import { agent404Worker } from &quot;@agent-404/cloudflare&quot;;

export default {
  async fetch(req, env, ctx) {
    return agent404Worker(req, env, {
      publicKey: env.AGENT404_PUBLIC_KEY,
      siteId: env.AGENT404_SITE_ID,
    });
  },
};">Copy</button>
          <pre><code>import { agent404Worker } from "@agent-404/cloudflare";

export default {
  async fetch(req, env, ctx) {
    return agent404Worker(req, env, {
      publicKey: env.AGENT404_PUBLIC_KEY,
      siteId: env.AGENT404_SITE_ID,
    });
  },
};</code></pre>
        </div>
      </div>

      <div class="tab-panel" id="tab-panel-express">
        <div class="code-preview">
          <button type="button" class="copy-btn" data-copy="import { agent404Express } from &quot;@agent-404/express&quot;;

app.use(agent404Express({
  publicKey: process.env.AGENT404_PUBLIC_KEY,
  siteId: process.env.AGENT404_SITE_ID,
}));">Copy</button>
          <pre><code>import { agent404Express } from "@agent-404/express";

app.use(agent404Express({
  publicKey: process.env.AGENT404_PUBLIC_KEY,
  siteId: process.env.AGENT404_SITE_ID,
}));</code></pre>
        </div>
      </div>

      <div class="tab-panel" id="tab-panel-script">
        <div class="code-preview">
          <button type="button" class="copy-btn" data-copy="&lt;script
  src=&quot;${CANONICAL_SCRIPT_URL}&quot;
  data-site-id=&quot;your_site_id&quot;
  data-public-key=&quot;your_public_key&quot;
  defer
&gt;&lt;/script&gt;">Copy</button>
          <pre><code>&lt;script
  src="${CANONICAL_SCRIPT_URL}"
  data-site-id="your_site_id"
  data-public-key="your_public_key"
  defer
&gt;&lt;/script&gt;</code></pre>
        </div>
      </div>
    </div>

    <!-- How it works -->
    <div class="section-title-wrap">
      <span class="section-eyebrow">Architecture</span>
      <h2 class="section-h2">4-Signal Hybrid Matching Engine</h2>
      <p class="section-desc">Designed specifically to resolve dead docs, moved API routes, and broken agent citations.</p>
    </div>

    <div class="flow-grid">
      <div class="flow-step-card">
        <div class="flow-step-num">01</div>
        <h3 class="flow-step-title">Edge Interception</h3>
        <p class="flow-step-desc">
          Middleware catches the 404 response before body flush. Fast vector cache queries your indexed sitemap in &lt;25ms.
        </p>
      </div>

      <div class="flow-step-card">
        <div class="flow-step-num">02</div>
        <h3 class="flow-step-title">4-Signal Weighted Ranking</h3>
        <p class="flow-step-desc">
          Evaluates Path Jaccard (35%), pgvector embeddings (30%), Levenshtein distance (20%), and Keyword overlap (15%).
        </p>
      </div>

      <div class="flow-step-card">
        <div class="flow-step-num">03</div>
        <h3 class="flow-step-title">Standardized Recovery</h3>
        <p class="flow-step-desc">
          Serves RFC 5988 Link headers for crawlers, schema.org JSON-LD for AI tools, and JSON negotiation for API consumers.
        </p>
      </div>
    </div>

    <!-- Built for Agent Stack -->
    <div class="section-title-wrap">
      <span class="section-eyebrow">Use Cases</span>
      <h2 class="section-h2">Built for the agent ecosystem</h2>
      <p class="section-desc">Fixes broken workflows across modern developer tooling.</p>
    </div>

    <div class="features-grid">
      <div class="feature-card">
        <span class="feature-tag">Coding Assistants</span>
        <h3 class="feature-title">Claude Code, Cursor, Copilot</h3>
        <p class="feature-desc">
          Models query docs URLs baked into their pre-training data. When endpoints move, structured JSON-LD allows assistants to self-heal instead of hallucinating deprecated code.
        </p>
      </div>

      <div class="feature-card">
        <span class="feature-tag">RAG &amp; Vector Pipelines</span>
        <h3 class="feature-title">Retrieval Crawlers &amp; Search</h3>
        <p class="feature-desc">
          Indexers hit dead links after API version bumps. Instead of returning empty context or bad citations, systems receive the current destination endpoint automatically.
        </p>
      </div>

      <div class="feature-card">
        <span class="feature-tag">Web Agents</span>
        <h3 class="feature-title">Autonomous Browser Workflows</h3>
        <p class="feature-desc">
          Browser agents navigating documentation give up when links 404. Standardized Link suggestions provide instant fallback routes to keep execution uninterrupted.
        </p>
      </div>

      <div class="feature-card">
        <span class="feature-tag">Tool Protocols</span>
        <h3 class="feature-title">Model Context Protocol (MCP)</h3>
        <p class="feature-desc">
          MCP servers requesting API references or schemas receive ranked candidates rather than unparseable generic HTML error pages.
        </p>
      </div>
    </div>

    <!-- CTA -->
    <div class="cta-card">
      <h2>Stop losing agents to dead links</h2>
      <p>Wire up the middleware in 60 seconds or run a standing audit on your live documentation.</p>
      
      <div class="cta-btn-group">
        <a href="/demo" class="btn btn-primary">Launch Live Audit &rarr;</a>
        <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbharath31%2Fagent-404&env=DATABASE_URL,EMBEDDING_API_KEY,CRON_SECRET,AUTH0_DOMAIN,AUTH0_CLIENT_ID,AUTH0_CLIENT_SECRET,AUTH0_SESSION_ENCRYPTION_KEY,BASE_URL&envDescription=DATABASE_URL%3A%20Neon%20Postgres.%20Auth0%20passwordless%20email%20OTP%20for%20the%20dashboard.&project-name=agent-404&repository-name=agent-404" class="btn btn-secondary" target="_blank" rel="noopener">
          Deploy to Vercel
        </a>
        <a href="https://github.com/bharath31/agent-404" class="btn btn-secondary" target="_blank" rel="noopener">
          GitHub
        </a>
      </div>
    </div>

    <!-- Footer -->
    <footer>
      <div>agent-404 &middot; open source under MIT</div>
      <div>
        <a href="https://github.com/bharath31/agent-404" target="_blank" rel="noopener">Source</a> &middot;
        <a href="/demo">Audit</a> &middot;
        <a href="https://bharath.sh" target="_blank" rel="noopener">Bharath Natarajan</a>
      </div>
    </footer>
  </div>

  <!-- Toast -->
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

    // Tab switching
    function switchTab(tab) {
      document.querySelectorAll('.install-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      
      event.currentTarget.classList.add('active');
      const target = document.getElementById('tab-panel-' + tab);
      if (target) target.classList.add('active');
    }

    // Copy buttons
    document.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-copy') || '';
        navigator.clipboard.writeText(text).then(() => {
          const prev = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = prev; }, 1600);
          showToast('Copied to clipboard');
        });
      });
    });

    // Hero register input -> dashboard
    const heroForm = document.getElementById('hero-register-form');
    if (heroForm) {
      heroForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const domain = document.getElementById('hero-domain-input').value.trim();
        if (!domain) return;
        const target = '/auth/login?return_to=' + encodeURIComponent('/dashboard?register=' + encodeURIComponent(domain));
        window.location.href = target;
      });
    }

    // Ticker animation
    const examples = [
      { dead: 'auth0.com/docs/customize/login-pages/acul', live: 'auth0.com/docs/customize/login-pages/advanced-customizations' },
      { dead: 'docs.stripe.com/payment/checkout', live: 'docs.stripe.com/payments/checkout' },
      { dead: 'nextjs.org/docs/app/building/deploy/static-export', live: 'nextjs.org/docs/app/guides/static-exports' },
      { dead: 'vercel.com/docs/edge-functions/overview', live: 'vercel.com/docs/functions' },
      { dead: 'supabase.com/docs/auth/overview', live: 'supabase.com/docs/guides/auth' },
      { dead: 'react.dev/reference/hooks', live: 'react.dev/reference/react/hooks' },
    ];
    let exIdx = 0;
    const tickerDead = document.getElementById('ticker-dead');
    const tickerLive = document.getElementById('ticker-live');

    function cycleTicker() {
      exIdx = (exIdx + 1) % examples.length;
      const ex = examples[exIdx];
      tickerDead.style.opacity = '0';
      tickerLive.style.opacity = '0';
      setTimeout(() => {
        tickerDead.textContent = ex.dead;
        tickerLive.textContent = ex.live;
        tickerDead.style.opacity = '1';
        tickerLive.style.opacity = '1';
      }, 300);
      setTimeout(cycleTicker, 3500);
    }
    tickerDead.style.transition = 'opacity 0.3s';
    tickerLive.style.transition = 'opacity 0.3s';
    setTimeout(cycleTicker, 3500);
  </script>
</body>
</html>`;
}
