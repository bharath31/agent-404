import { CANONICAL_SCRIPT_URL } from "../config";

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
  <title>agent-404 — Self-Healing 404s for AI Agents</title>
  <meta name="description" content="When a docs URL dies, agent-404 answers AI crawlers with an RFC Link header and JSON-LD pointing at the closest real page. Cursor, Claude, GPTBot and Perplexity recover in one hop.">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%2310b981'/%3E%3Ctext x='50' y='58' font-family='system-ui,sans-serif' font-size='48' font-weight='800' fill='white' text-anchor='middle' dominant-baseline='middle'%3E404%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0a;
      --bg-subtle: #0f0f11;
      --surface: #121214;
      --surface-elevated: #18181b;
      --surface-hover: #1e1e21;
      --border: #27272a;
      --border-subtle: #1d1d20;
      --border-focus: #52525b;
      --text: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --emerald: #34d399;
      --emerald-deep: #10b981;
      --emerald-subtle: rgba(52, 211, 153, 0.12);
      --amber: #f59e0b;
      --rose: #f43f5e;
      --rose-subtle: rgba(244, 63, 94, 0.1);
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: var(--font-sans);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    ::selection { background: rgba(52, 211, 153, 0.25); }

    a { color: var(--text); text-decoration: none; }
    a:hover { color: #fff; }

    :is(a, button, input):focus-visible {
      outline: 2px solid var(--emerald);
      outline-offset: 2px;
      border-radius: var(--radius-sm);
    }

    .container {
      max-width: 1080px;
      margin: 0 auto;
      padding: 0 1.5rem 4rem;
    }

    /* Top Navigation */
    nav {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.8rem 0;
      background: rgba(10, 10, 10, 0.8);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 0.5rem;
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
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .logo .logo-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: linear-gradient(135deg, #10b981, #059669);
      color: #04150d;
      font-size: 0.55rem;
      font-weight: 700;
      letter-spacing: 0;
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
      white-space: nowrap;
    }

    .btn-sm {
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
    }

    .btn-primary {
      background: #fafafa;
      color: #09090b;
      border-color: #fafafa;
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), inset 0 -1px 0 rgba(9, 9, 11, 0.12);
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
      position: relative;
      padding: 5.5rem 0 3.5rem;
      text-align: center;
    }

    /* Signature atmosphere: dotted grid fading into a single emerald glow */
    .hero-atmosphere {
      position: absolute;
      inset: -5rem 0 auto;
      height: 480px;
      pointer-events: none;
      overflow: hidden;
    }
    .hero-grid {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(circle, rgba(255, 255, 255, 0.14) 1px, transparent 1px);
      background-size: 24px 24px;
      mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, black 30%, transparent 75%);
      -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, black 30%, transparent 75%);
    }
    .hero-glow {
      position: absolute;
      left: 50%;
      top: -140px;
      transform: translateX(-50%);
      width: 720px;
      height: 340px;
      background: radial-gradient(ellipse at center, rgba(16, 185, 129, 0.13), transparent 65%);
    }

    .hero-inner { position: relative; }

    .hero-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.3rem 0.85rem;
      border-radius: 999px;
      background: rgba(18, 18, 20, 0.7);
      border: 1px solid var(--border);
      font-size: 0.72rem;
      font-family: var(--font-mono);
      letter-spacing: 0.03em;
      color: var(--text-secondary);
      margin-bottom: 1.75rem;
    }

    .hero-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 8px rgba(52, 211, 153, 0.8);
    }

    .hero h1 {
      font-size: clamp(2.4rem, 6vw, 3.6rem);
      font-weight: 800;
      line-height: 1.08;
      letter-spacing: -0.045em;
      margin-bottom: 1.25rem;
      text-wrap: balance;
    }

    .hero h1 .highlight { color: var(--text-muted); }

    p.hero-desc {
      font-size: 1.05rem;
      color: var(--text-secondary);
      max-width: 620px;
      margin: 0 auto 2.25rem;
      line-height: 1.65;
      text-wrap: pretty;
    }

    .hero-cta-group {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-top: 2.25rem;
    }

    /* Quick Register Bar */
    .hero-register-box {
      max-width: 520px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.35rem 0.4rem 0.35rem 0.95rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .hero-register-box:focus-within {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.04);
    }

    .hero-register-input {
      flex: 1;
      min-width: 0;
      background: none;
      border: none;
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 0.85rem;
      outline: none;
    }
    .hero-register-input::placeholder { color: var(--text-muted); }

    .hero-register-meta {
      font-size: 0.73rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
      margin-top: 0.85rem;
    }

    .form-error {
      font-size: 0.8rem;
      color: var(--rose);
      margin-top: 0.75rem;
    }

    /* Section scaffolding */
    section { position: relative; }

    .section-title-wrap { margin-bottom: 1.5rem; }
    .section-eyebrow {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      display: block;
      margin-bottom: 0.5rem;
    }
    .section-h2 {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .section-desc {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-top: 0.4rem;
      max-width: 640px;
      text-wrap: pretty;
    }

    /* Comparison Terminal (signature) */
    .comparison-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      margin: 3.5rem 0 4.5rem;
      text-align: left;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
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
      gap: 0.4rem;
    }
    .term-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #2e2e32;
    }

    .term-title {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-left: 0.5rem;
    }

    .term-badge {
      font-family: var(--font-mono);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      background: var(--emerald-subtle);
      color: var(--emerald);
      border: 1px solid rgba(52, 211, 153, 0.25);
    }

    .comparison-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    @media (max-width: 700px) {
      .comparison-grid { grid-template-columns: 1fr; }
    }

    .term-column { padding: 1.25rem 1.5rem; }
    .term-column-bad {
      border-right: 1px solid var(--border-subtle);
      background: rgba(244, 63, 94, 0.025);
    }
    @media (max-width: 700px) {
      .term-column-bad { border-right: none; border-bottom: 1px solid var(--border-subtle); }
    }
    .term-column-good { background: rgba(16, 185, 129, 0.025); }

    .term-col-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-family: var(--font-mono);
      font-size: 0.72rem;
      font-weight: 600;
      margin-bottom: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .term-col-header.bad { color: var(--rose); }
    .term-col-header.good { color: var(--emerald); }

    .term-snippet {
      font-family: var(--font-mono);
      font-size: 0.74rem;
      line-height: 1.75;
      color: var(--text-secondary);
      white-space: pre-wrap;
      overflow-x: hidden;
    }
    .t-method { color: #f43f5e; }
    .t-status { color: #f59e0b; }
    .t-status-ok { color: var(--emerald); }
    .t-header { color: #38bdf8; }
    .t-val { color: #34d399; }
    .t-dim { color: #63636b; }

    .verdict-line {
      margin-top: 0.85rem;
      padding-top: 0.85rem;
      border-top: 1px dashed var(--border);
      font-family: var(--font-mono);
      font-size: 0.72rem;
    }
    .verdict-line.bad { color: var(--rose); }
    .verdict-line.good { color: var(--emerald); }

    /* Recovery ticker strip */
    .ticker-container {
      border-top: 1px solid var(--border-subtle);
      padding: 0.8rem 1.5rem;
      background: var(--bg-subtle);
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-family: var(--font-mono);
      font-size: 0.74rem;
      overflow: hidden;
    }
    .ticker-track {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      white-space: nowrap;
      transition: opacity 0.3s ease;
    }
    .ticker-tag-dead {
      color: var(--rose);
      background: var(--rose-subtle);
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-size: 0.64rem;
      font-weight: 600;
      flex-shrink: 0;
    }
    .ticker-tag-live {
      color: var(--emerald);
      background: var(--emerald-subtle);
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-size: 0.64rem;
      font-weight: 600;
      flex-shrink: 0;
    }
    .ticker-url {
      color: var(--text-muted);
      text-decoration: line-through;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ticker-arrow { color: var(--text-muted); flex-shrink: 0; }
    .ticker-dest { color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; }

    /* Install tabs */
    .install-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      margin-bottom: 4.5rem;
    }

    .install-tabs {
      display: flex;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--border);
      padding: 0.4rem 0.75rem 0;
      gap: 0.25rem;
      overflow-x: auto;
    }

    .tab-btn {
      background: none;
      border: none;
      padding: 0.55rem 0.9rem;
      font-size: 0.76rem;
      font-family: var(--font-mono);
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 6px 6px 0 0;
      transition: all 0.15s;
      border-bottom: 2px solid transparent;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active {
      color: var(--text);
      background: var(--bg);
      border-bottom: 2px solid var(--emerald);
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
      line-height: 1.7;
      color: var(--text);
      overflow-x: auto;
    }
    .code-preview .code-file {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      color: var(--text-muted);
      margin-bottom: 0.6rem;
      display: block;
    }

    .copy-btn {
      position: absolute;
      top: 0.7rem;
      right: 0.7rem;
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--text-secondary);
      padding: 0.28rem 0.65rem;
      font-size: 0.7rem;
      font-family: var(--font-mono);
      cursor: pointer;
      transition: all 0.15s;
    }
    .copy-btn:hover { color: var(--text); border-color: var(--border-focus); }

    /* Bento feature grid */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 4.5rem;
    }
    @media (max-width: 680px) {
      .features-grid { grid-template-columns: 1fr; }
    }

    .feature-card {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1.5rem;
      overflow: hidden;
      transition: border-color 0.15s;
    }
    .feature-card:hover { border-color: var(--border-focus); }

    .feature-card.feature-wide { grid-column: 1 / -1; }
    @media (max-width: 680px) {
      .feature-card.feature-wide { grid-column: auto; }
    }

    .feature-tag {
      font-family: var(--font-mono);
      font-size: 0.63rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--text-muted);
      margin-bottom: 0.6rem;
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .feature-tag::before {
      content: "";
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--emerald);
      opacity: 0.7;
    }

    .feature-title {
      font-size: 1.02rem;
      font-weight: 600;
      margin-bottom: 0.4rem;
      letter-spacing: -0.01em;
    }

    .feature-desc {
      font-size: 0.84rem;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    .latency-chip {
      display: inline-flex;
      align-items: baseline;
      gap: 0.3rem;
      margin-top: 1rem;
      padding: 0.35rem 0.7rem;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(52, 211, 153, 0.25);
      background: var(--emerald-subtle);
    }
    .latency-chip strong {
      font-family: var(--font-mono);
      font-size: 1.05rem;
      color: var(--emerald);
      font-weight: 700;
    }
    .latency-chip span {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* How it works */
    .flow-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 4.5rem;
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
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-secondary);
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
      font-size: 0.82rem;
      color: var(--text-secondary);
      line-height: 1.55;
    }

    /* CTA */
    .cta-card {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 3.25rem 2rem;
      text-align: center;
      margin-bottom: 3rem;
      overflow: hidden;
    }
    .cta-card::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 60% 90% at 50% 115%, rgba(16, 185, 129, 0.09), transparent 70%);
      pointer-events: none;
    }
    .cta-card > * { position: relative; }

    .cta-card h2 {
      font-size: 1.7rem;
      font-weight: 700;
      letter-spacing: -0.025em;
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
      padding-top: 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.78rem;
      color: var(--text-muted);
    }
    footer .footer-brand { font-family: var(--font-mono); }
    footer .footer-links { display: flex; gap: 1.1rem; }
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
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
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

    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <div class="brand-group">
        <a href="/" class="logo"><span class="logo-mark">404</span>agent-404</a>
        <span class="brand-badge">open source &middot; MIT</span>
      </div>

      <div class="nav-links">
        <a href="/demo" class="nav-link">Live audit</a>
        <a href="https://github.com/bharath31/agent-404" class="nav-link" target="_blank" rel="noopener">GitHub</a>
        ${navAuth}
      </div>
    </nav>

    <!-- Hero -->
    <section class="hero">
      <div class="hero-atmosphere" aria-hidden="true">
        <div class="hero-glow"></div>
        <div class="hero-grid"></div>
      </div>

      <div class="hero-inner">
        <div class="hero-eyebrow">
          <span class="hero-dot"></span>
          <span>Built for ClaudeBot, GPTBot, PerplexityBot &amp; coding agents</span>
        </div>

        <h1>Your docs move.<br><span class="highlight">Agent traffic shouldn't break.</span></h1>

        <p class="hero-desc">
          agent-404 watches every 404 your site returns, then answers AI crawlers with
          RFC&nbsp;Link headers and JSON-LD pointing at the closest real page &mdash; so
          Cursor, Claude, ChatGPT and Perplexity recover in a single hop instead of
          citing a dead end.
        </p>

        <form class="hero-register-box" id="hero-register-form">
          <input
            type="text"
            id="hero-domain-input"
            class="hero-register-input"
            placeholder="docs.yourcompany.com"
            autocomplete="off"
            spellcheck="false"
            aria-label="Your domain"
            required
          />
          <button type="submit" class="btn btn-primary btn-sm">Get free key &rarr;</button>
        </form>
        <p id="hero-register-error" class="form-error" role="alert" hidden style="max-width:520px;margin-left:auto;margin-right:auto"></p>
        <div class="hero-register-meta">Free tier &middot; 60-second setup &middot; automatic sitemap sync</div>

        <div class="hero-cta-group">
          <a href="/demo" class="btn btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            Audit your live site
          </a>
          <a href="https://github.com/bharath31/agent-404" class="btn btn-secondary" target="_blank" rel="noopener">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            Star on GitHub
          </a>
        </div>
      </div>
    </section>

    <!-- HTTP exchange comparison -->
    <section>
      <div class="comparison-card">
        <div class="terminal-top-bar">
          <div class="term-dots-group">
            <span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span>
            <span class="term-title">What an AI crawler receives</span>
          </div>
          <span class="term-badge">One-hop recovery</span>
        </div>

        <div class="comparison-grid">
          <div class="term-column term-column-bad">
            <div class="term-col-header bad">Without agent-404</div>
            <div class="term-snippet"><span class="t-method">GET</span> /docs/v1/authentication
<span class="t-status">HTTP/1.1 404 Not Found</span>
<span class="t-header">Content-Type:</span> text/html

<span class="t-dim">&lt;!-- Client-side SPA shell. --&gt;
&lt;!-- Crawlers do not execute JS. --&gt;
&lt;!-- The agent assumes the feature --&gt;
&lt;!-- no longer exists. --&gt;</span></div>
            <div class="verdict-line bad">&#10007; Agent gives up &mdash; or invents an API that doesn't exist</div>
          </div>

          <div class="term-column term-column-good">
            <div class="term-col-header good">With agent-404</div>
            <div class="term-snippet"><span class="t-method">GET</span> /docs/v1/authentication
<span class="t-status-ok">HTTP/1.1 404 Not Found</span>
<span class="t-header">Link:</span> <span class="t-val">&lt;/docs/v2/auth&gt;; rel="alternate"</span>
<span class="t-header">X-Agent-404:</span> <span class="t-val">match_found; confidence=96%</span>

<span class="t-dim">&lt;script type="application/ld+json"&gt;
{ "@type": "ItemList", "name": "/docs/v2/auth" }
&lt;/script&gt;</span></div>
            <div class="verdict-line good">&#10003; Agent follows the alternate route in one hop</div>
          </div>
        </div>

        <div class="ticker-container">
          <span class="ticker-tag-dead">404</span>
          <div class="ticker-track">
            <span class="ticker-url" id="ticker-dead">auth0.com/docs/customize/login-pages/acul</span>
            <span class="ticker-arrow">&rarr;</span>
            <span class="ticker-tag-live">recovered</span>
            <span class="ticker-dest" id="ticker-live">auth0.com/docs/customize/login-pages/advanced-customizations</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Framework integration -->
    <section>
      <div class="section-title-wrap">
        <span class="section-eyebrow">Install</span>
        <h2 class="section-h2">Three lines at the edge</h2>
        <p class="section-desc">Drop the middleware in. agent404.dev crawls your sitemap, builds vector embeddings, and serves sub-25&nbsp;ms suggestions from cache.</p>
      </div>

      <div class="install-box">
        <div class="install-tabs" role="tablist">
          <button type="button" class="tab-btn active" onclick="switchTab('next')">Next.js</button>
          <button type="button" class="tab-btn" onclick="switchTab('cf')">Cloudflare Worker</button>
          <button type="button" class="tab-btn" onclick="switchTab('express')">Express</button>
          <button type="button" class="tab-btn" onclick="switchTab('script')">Script tag</button>
        </div>

        <div class="tab-panel active" id="tab-panel-next">
          <div class="code-preview">
            <span class="code-file">middleware.ts</span>
            <button type="button" class="copy-btn" data-copy="import { agent404 } from &quot;@agent404/next&quot;;

export const middleware = agent404({
  apiKey: process.env.AGENT404_PUBLIC_KEY!,
});

export const config = {
  matcher: [&quot;/((?!api|_next/static|_next/image|favicon.ico).*)&quot;],
};">Copy</button>
            <pre><code>import { agent404 } from "@agent404/next";

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
            <span class="code-file">worker.ts</span>
            <button type="button" class="copy-btn" data-copy="import { agent404Worker } from &quot;@agent404/cloudflare&quot;;

export default agent404Worker({
  apiKey: &quot;pk_your_public_key&quot;,
  origin: &quot;https://docs.example.com&quot;,
});">Copy</button>
            <pre><code>import { agent404Worker } from "@agent404/cloudflare";

export default agent404Worker({
  apiKey: "pk_your_public_key",
  origin: "https://docs.example.com",
});</code></pre>
          </div>
        </div>

        <div class="tab-panel" id="tab-panel-express">
          <div class="code-preview">
            <span class="code-file">app.ts</span>
            <button type="button" class="copy-btn" data-copy="import { recoverExpress404 } from &quot;@agent404/express&quot;;

app.use(async (req, res) => {
  const recovered = await recoverExpress404(req, &quot;&lt;h1&gt;Not Found&lt;/h1&gt;&quot;, {
    apiKey: process.env.AGENT404_PUBLIC_KEY,
  });
  res.status(404);
  recovered.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(await recovered.text());
});">Copy</button>
            <pre><code>import { recoverExpress404 } from "@agent404/express";

app.use(async (req, res) => {
  const recovered = await recoverExpress404(req, "&lt;h1&gt;Not Found&lt;/h1&gt;", {
    apiKey: process.env.AGENT404_PUBLIC_KEY,
  });
  res.status(404);
  recovered.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(await recovered.text());
});</code></pre>
          </div>
        </div>

        <div class="tab-panel" id="tab-panel-script">
          <div class="code-preview">
            <span class="code-file">index.html</span>
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
    </section>

    <!-- How it works -->
    <section>
      <div class="section-title-wrap">
        <span class="section-eyebrow">How it works</span>
        <h2 class="section-h2">Four signals decide the destination</h2>
        <p class="section-desc">Built specifically to resolve moved docs, renamed API routes, and broken agent citations.</p>
      </div>

      <div class="flow-grid">
        <div class="flow-step-card">
          <div class="flow-step-num">01</div>
          <h3 class="flow-step-title">Edge interception</h3>
          <p class="flow-step-desc">
            Middleware catches the 404 before the body flushes and queries your indexed sitemap in under 25&nbsp;ms.
          </p>
        </div>

        <div class="flow-step-card">
          <div class="flow-step-num">02</div>
          <h3 class="flow-step-title">Hybrid ranking</h3>
          <p class="flow-step-desc">
            Path overlap (35%), vector embeddings (30%), Levenshtein distance (20%) and keyword match (15%) pick the closest live page.
          </p>
        </div>

        <div class="flow-step-card">
          <div class="flow-step-num">03</div>
          <h3 class="flow-step-title">Structured recovery</h3>
          <p class="flow-step-desc">
            RFC&nbsp;5988 Link headers for crawlers, schema.org JSON-LD for assistants, JSON negotiation for API clients.
          </p>
        </div>
      </div>
    </section>

    <!-- Why hosted -->
    <section>
      <div class="section-title-wrap">
        <span class="section-eyebrow">Why the hosted service</span>
        <h2 class="section-h2">No infrastructure to babysit</h2>
        <p class="section-desc">Vector search, sitemap crawling, and cron scheduling run on agent404.dev. You ship middleware; we keep the index warm.</p>
      </div>

      <div class="features-grid">
        <div class="feature-card feature-wide">
          <span class="feature-tag">Performance</span>
          <h3 class="feature-title">Suggestions resolve before the body flushes</h3>
          <p class="feature-desc">
            Matches come from a global edge cache, not a cold database call &mdash; recovery never adds perceptible latency for humans or agents.
          </p>
          <div class="latency-chip"><strong>&lt;25 ms</strong><span>p50 cached lookup</span></div>
        </div>

        <div class="feature-card">
          <span class="feature-tag">Indexing</span>
          <h3 class="feature-title">Continuous sitemap sync</h3>
          <p class="feature-desc">
            Your pages are re-crawled and re-embedded automatically. No pgvector instance, no cron jobs, no stale index.
          </p>
        </div>

        <div class="feature-card">
          <span class="feature-tag">Compatibility</span>
          <h3 class="feature-title">Made for coding agents</h3>
          <p class="feature-desc">
            Models query docs URLs baked into their training weights. Structured recovery lets them follow the move instead of shipping deprecated code.
          </p>
        </div>

        <div class="feature-card">
          <span class="feature-tag">Observability</span>
          <h3 class="feature-title">See which agents hit what</h3>
          <p class="feature-desc">
            The dashboard tracks every dead-URL request by agent category and measures how many followed the suggested page.
          </p>
        </div>

        <div class="feature-card">
          <span class="feature-tag">Open source</span>
          <h3 class="feature-title">Self-host if you want to</h3>
          <p class="feature-desc">
            Adapters for Next.js, Cloudflare, Express and Netlify are MIT-licensed. The hosted edge is optional convenience, not lock-in.
          </p>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section>
      <div class="cta-card">
        <h2>Make your next URL change boring</h2>
        <p>Register a domain, paste three lines of middleware, and every AI crawler that mistypes a route gets the right answer.</p>

        <div class="cta-btn-group">
          <a href="/auth/login?return_to=/dashboard" class="btn btn-primary">Get started free &rarr;</a>
          <a href="/demo" class="btn btn-secondary">Run a live audit</a>
          <a href="https://github.com/bharath31/agent-404" class="btn btn-secondary" target="_blank" rel="noopener">GitHub</a>
        </div>
      </div>

      <footer>
        <div class="footer-brand">agent-404 &middot; open source under MIT</div>
        <div class="footer-links">
          <a href="https://github.com/bharath31/agent-404" target="_blank" rel="noopener">Source</a>
          <a href="/demo">Audit</a>
          <a href="https://bharath.sh" target="_blank" rel="noopener">Bharath Natarajan</a>
        </div>
      </footer>
    </section>
  </div>

  <!-- Toast -->
  <div class="toast" id="toast" role="status">
    <span class="toast-dot"></span>
    <span id="toast-text">Copied to clipboard</span>
  </div>

  <script>
    function showToast(text) {
      const el = document.getElementById('toast');
      document.getElementById('toast-text').textContent = text || 'Copied to clipboard';
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 2000);
    }

    // Install tab switching
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
        navigator.clipboard.writeText(btn.getAttribute('data-copy') || '').then(() => {
          const prev = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = prev; }, 1600);
          showToast('Copied to clipboard');
        });
      });
    });

    // Domain capture -> passwordless login carrying ?register=<domain>.
    // The install-CTA beacon keeps the audit-to-install funnel measurable
    // even for signed-out visitors (BAT-42).
    const heroForm = document.getElementById('hero-register-form');
    if (heroForm) {
      heroForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = document.getElementById('hero-domain-input').value.trim();
        if (!raw) return;
        const domain = raw.replace(/^https?:\\/\\//i, '').replace(/\\/+$/, '');
        fetch('/api/funnel/install-cta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
        }).catch(() => {});
        window.location.href = '/auth/login?return_to=' +
          encodeURIComponent('/dashboard?register=' + encodeURIComponent(domain));
      });
    }

    // Recovery examples ticker
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
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

    if (!reduceMotion && tickerDead && tickerLive) {
      setTimeout(cycleTicker, 3500);
    }
  </script>
</body>
</html>`;
}
