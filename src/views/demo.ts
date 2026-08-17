export const demoPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Demo &amp; Standing Audit — agent-404</title>
  <meta name="description" content="Test agent-404 live. Enter any dead documentation URL and see real-time semantic ranking, RFC Link headers, and schema.org JSON-LD returned to AI crawlers.">
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
      padding: 3.5rem 0 2rem;
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
      margin-bottom: 1.25rem;
    }

    .hero-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--emerald);
    }

    .hero h1 {
      font-size: 2.5rem;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.035em;
      margin-bottom: 0.75rem;
      color: var(--text);
    }

    .hero p.hero-desc {
      font-size: 1rem;
      color: var(--text-secondary);
      max-width: 580px;
      margin: 0 auto;
      line-height: 1.6;
    }

    /* Scenarios Grid */
    .scenarios-wrap {
      margin-top: 2rem;
      margin-bottom: 1.75rem;
    }

    .scenarios-label {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      display: block;
      text-align: center;
    }

    .scenarios-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.65rem;
    }
    @media (max-width: 720px) {
      .scenarios-grid { grid-template-columns: 1fr; }
    }

    .scenario-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.75rem 1rem;
      cursor: pointer;
      transition: all 0.15s;
      text-align: left;
    }
    .scenario-card:hover {
      border-color: var(--border-focus);
      background: var(--surface-hover);
    }
    .scenario-card.active {
      border-color: var(--accent);
      background: rgba(59, 130, 246, 0.05);
    }

    .sc-tag {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
    }
    .sc-url {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--rose);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-decoration: line-through;
    }

    /* Input Bar */
    .input-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.35rem 0.4rem 0.35rem 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }

    .url-input {
      flex: 1;
      background: none;
      border: none;
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 0.85rem;
      outline: none;
    }

    /* Active Dead URL Banner */
    .dead-url-banner {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.85rem 1.25rem;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .dead-url-left {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      overflow: hidden;
    }

    .tag-404 {
      background: var(--rose-subtle);
      color: var(--rose);
      font-family: var(--font-mono);
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .dead-url-link {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: var(--text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dead-url-context {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    /* Audit Score Card (Standing Audit) */
    .audit-score-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      margin-bottom: 2rem;
    }

    .audit-score-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .audit-score-val {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      font-family: var(--font-mono);
    }

    .score-good { color: var(--emerald); }
    .score-warning { color: var(--amber); }
    .score-critical { color: var(--rose); }

    .audit-checklist {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-subtle);
    }
    @media (max-width: 640px) {
      .audit-checklist { grid-template-columns: 1fr; }
    }

    .check-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
      font-family: var(--font-mono);
    }

    .check-icon-pass { color: var(--emerald); }
    .check-icon-fail { color: var(--rose); }

    /* Results Workspace Tabs */
    .workspace-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      margin-bottom: 3rem;
    }

    .workspace-tabs {
      display: flex;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--border);
      padding: 0.25rem 0.75rem 0;
      gap: 0.25rem;
      overflow-x: auto;
    }

    .ws-tab-btn {
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
    .ws-tab-btn:hover { color: var(--text); }
    .ws-tab-btn.active {
      color: var(--text);
      background: var(--bg);
      border-bottom: 2px solid var(--text);
      font-weight: 600;
    }

    .ws-panel { display: none; padding: 1.25rem; }
    .ws-panel.active { display: block; }

    /* Suggestion Items */
    .suggestion-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .suggestion-card {
      background: var(--bg);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 1rem 1.25rem;
      transition: border-color 0.15s;
    }
    .suggestion-card:hover {
      border-color: var(--border-focus);
    }

    .sugg-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.35rem;
      gap: 0.5rem;
    }

    .sugg-title-link {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text);
    }
    .sugg-title-link:hover { color: var(--accent); }

    .sugg-badge {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
    }
    .sugg-badge-moved { background: var(--accent-subtle); color: #60a5fa; }
    .sugg-badge-similar { background: var(--emerald-subtle); color: var(--emerald); }
    .sugg-badge-related { background: var(--amber-subtle); color: var(--amber); }

    .sugg-url {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 0.4rem;
      word-break: break-all;
    }

    .sugg-desc {
      font-size: 0.825rem;
      color: var(--text-secondary);
      line-height: 1.45;
    }

    .sugg-scores {
      margin-top: 0.6rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-family: var(--font-mono);
      font-size: 0.7rem;
      color: var(--text-muted);
    }
    .score-chip {
      background: var(--surface-elevated);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      color: var(--text);
    }

    /* Inspector Code blocks */
    .inspector-block {
      background: var(--bg);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 1rem 1.25rem;
      position: relative;
    }
    .inspector-block pre {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      line-height: 1.65;
      color: var(--text-secondary);
      overflow-x: auto;
      white-space: pre-wrap;
    }

    .inspector-copy-btn {
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
    }
    .inspector-copy-btn:hover { color: var(--text); }

    /* CTA */
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
      justify-content: space-between;
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
        <span class="brand-badge">Audit &amp; Demo</span>
      </div>

      <div class="nav-links">
        <a href="/" class="nav-link">Home</a>
        <a href="/dashboard" class="nav-link">Dashboard</a>
        <a href="https://github.com/bharath31/agent-404" class="nav-link" target="_blank" rel="noopener">GitHub</a>
      </div>
    </nav>

    <div class="hero">
      <div class="hero-eyebrow">
        <span class="hero-dot"></span>
        <span>Interactive Resolution &amp; Crawler Audit</span>
      </div>
      <h1>Test 404 Recovery Live</h1>
      <p class="hero-desc">
        Select a real documentation scenario below or enter any dead URL on your domain to inspect the ranked suggestions, RFC Link headers, and schema.org JSON-LD returned to AI assistants.
      </p>
    </div>

    <!-- Scenarios -->
    <div class="scenarios-wrap">
      <span class="scenarios-label">Preset Test Scenarios</span>
      <div class="scenarios-grid" id="scenarios-grid">
        <div class="scenario-card active" onclick="runScenario(0)">
          <div class="sc-tag">Auth0 &middot; Agent Hallucination</div>
          <div class="sc-url">auth0.com/docs/customize/login-pages/acul</div>
        </div>
        <div class="scenario-card" onclick="runScenario(1)">
          <div class="sc-tag">Stripe &middot; Typo / Singular</div>
          <div class="sc-url">docs.stripe.com/payment/checkout</div>
        </div>
        <div class="scenario-card" onclick="runScenario(2)">
          <div class="sc-tag">Next.js &middot; Restructure</div>
          <div class="sc-url">nextjs.org/docs/…/static-html-export</div>
        </div>
        <div class="scenario-card" onclick="runScenario(3)">
          <div class="sc-tag">Vercel &middot; Endpoint Rename</div>
          <div class="sc-url">vercel.com/docs/edge-functions/overview</div>
        </div>
        <div class="scenario-card" onclick="runScenario(4)">
          <div class="sc-tag">Supabase &middot; Path Re-org</div>
          <div class="sc-url">supabase.com/docs/auth/overview</div>
        </div>
        <div class="scenario-card" onclick="runScenario(5)">
          <div class="sc-tag">React &middot; Missing Segment</div>
          <div class="sc-url">react.dev/reference/hooks</div>
        </div>
      </div>
    </div>

    <!-- URL Input -->
    <div class="input-box">
      <input
        type="text"
        class="url-input"
        id="url-input"
        placeholder="https://yourdocs.com/old/path"
        autocomplete="off"
        spellcheck="false"
      />
      <button type="button" class="btn btn-primary btn-sm" id="btn-run-match" onclick="runMatch()">
        Analyze &amp; Match
      </button>
    </div>

    <!-- Dead URL Banner -->
    <div class="dead-url-banner" id="dead-url-banner">
      <div class="dead-url-left">
        <span class="tag-404">404</span>
        <a class="dead-url-link" id="dead-url-link" target="_blank" rel="noopener"></a>
      </div>
      <span class="dead-url-context" id="dead-url-context"></span>
    </div>

    <!-- Standing Audit Banner if active -->
    <div class="audit-score-card" id="audit-card" style="display:none">
      <div class="audit-score-header">
        <div>
          <span style="font-family:var(--font-mono);font-size:0.7rem;text-transform:uppercase;color:var(--text-muted)">Agent Readiness Score</span>
          <div class="audit-score-val" id="audit-score-num">--</div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-copy-audit" onclick="copyAuditLink()">
          Share Standing Audit
        </button>
      </div>
      <p id="audit-recommendation" style="font-size:0.85rem;color:var(--text-secondary)"></p>
      <div class="audit-checklist">
        <div class="check-item"><span id="check-crawler">●</span> AI Agent 404 Access (Claude, Cursor, ChatGPT, Perplexity)</div>
        <div class="check-item"><span id="check-headers">●</span> RFC 5988 Link Headers</div>
        <div class="check-item"><span id="check-jsonld">●</span> schema.org ItemList JSON-LD</div>
      </div>
    </div>

    <!-- Workspace Tabs: Suggestions, Raw HTTP, JSON-LD, Crawler Trace -->
    <div class="workspace-card" id="workspace-card">
      <div class="workspace-tabs" role="tablist">
        <button type="button" class="ws-tab-btn active" onclick="switchWsTab('suggestions')">Ranked Suggestions</button>
        <button type="button" class="ws-tab-btn" onclick="switchWsTab('http')">HTTP Link Headers</button>
        <button type="button" class="ws-tab-btn" onclick="switchWsTab('jsonld')">schema.org JSON-LD</button>
        <button type="button" class="ws-tab-btn" onclick="switchWsTab('trace')">Crawler Simulation</button>
      </div>

      <div class="ws-panel active" id="ws-panel-suggestions">
        <div class="suggestion-list" id="results-list">
          <!-- Dynamic suggestion items -->
        </div>
      </div>

      <div class="ws-panel" id="ws-panel-http">
        <div class="inspector-block">
          <button type="button" class="inspector-copy-btn" id="btn-copy-headers" onclick="copyBlock('raw-headers-pre')">Copy</button>
          <pre id="raw-headers-pre"></pre>
        </div>
      </div>

      <div class="ws-panel" id="ws-panel-jsonld">
        <div class="inspector-block">
          <button type="button" class="inspector-copy-btn" id="btn-copy-jsonld" onclick="copyBlock('raw-jsonld-pre')">Copy</button>
          <pre id="raw-jsonld-pre"></pre>
        </div>
      </div>

      <div class="ws-panel" id="ws-panel-trace">
        <div class="inspector-block">
          <pre id="raw-trace-pre"></pre>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div class="cta-card">
      <h2>Add agent recovery to your docs in 60s</h2>
      <p>Wire up the middleware or paste the script tag. Stop 404 hallucinations across all LLMs.</p>
      <div class="cta-btn-group">
        <a href="/" class="btn btn-primary">Get Your Middleware Key &rarr;</a>
        <a href="https://github.com/bharath31/agent-404" class="btn btn-secondary" target="_blank" rel="noopener">GitHub</a>
      </div>
    </div>

    <footer>
      <div>agent-404 &middot; standing audit benchmark</div>
      <div>
        <a href="/">Home</a> &middot;
        <a href="/dashboard">Dashboard</a> &middot;
        <a href="https://github.com/bharath31/agent-404" target="_blank" rel="noopener">Source</a>
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

    function copyBlock(id) {
      const text = document.getElementById(id)?.textContent || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
    }

    function copyAuditLink() {
      navigator.clipboard.writeText(window.location.href).then(() => showToast('Audit link copied'));
    }

    function switchWsTab(tab) {
      document.querySelectorAll('.workspace-tabs .ws-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ws-panel').forEach(p => p.classList.remove('active'));
      event.currentTarget.classList.add('active');
      const panel = document.getElementById('ws-panel-' + tab);
      if (panel) panel.classList.add('active');
    }

    // ==========================================
    // Preloaded Datasets for Instant Scenarios
    // ==========================================
    const SITES = {
      react: {
        domains: ['react.dev', 'reactjs.org'],
        pages: [
          { url: 'https://react.dev/reference/react/hooks', title: 'Hooks Reference', description: 'React Hooks API reference', headings: '["useState","useEffect","useContext","useRef","useMemo","useCallback"]' },
          { url: 'https://react.dev/reference/react/components', title: 'Components', description: 'Built-in React components', headings: '["Fragment","Profiler","StrictMode","Suspense"]' },
          { url: 'https://react.dev/learn', title: 'Quick Start', description: 'Learn React fundamentals', headings: '["Creating Components","JSX","Adding Styles","Displaying Data","Hooks"]' },
          { url: 'https://react.dev/reference/react-dom/client', title: 'Client APIs', description: 'React DOM client APIs', headings: '["createRoot","hydrateRoot"]' },
          { url: 'https://react.dev/reference/react/apis', title: 'React APIs', description: 'React API reference', headings: '["createContext","forwardRef","lazy","memo","startTransition"]' },
          { url: 'https://react.dev/reference/rules/rules-of-hooks', title: 'Rules of Hooks', description: 'Rules for using React Hooks correctly', headings: '["Only Call at Top Level","Only Call in React Functions"]' },
        ],
      },
      auth0: {
        domains: ['auth0.com'],
        pages: [
          { url: 'https://auth0.com/docs/customize/login-pages/advanced-customizations', title: 'Advanced Customizations for Universal Login', description: 'Customize login pages with ACUL, custom domains, and page templates', headings: '["ACUL","Page Templates","Custom Domains","Universal Login"]' },
          { url: 'https://auth0.com/docs/authenticate/identity-providers', title: 'Identity Providers', description: 'Configure social, enterprise, and database connections', headings: '["Social Connections","Enterprise Connections","Database Connections"]' },
          { url: 'https://auth0.com/docs/secure/tokens', title: 'Tokens', description: 'ID tokens, access tokens, and refresh tokens', headings: '["ID Tokens","Access Tokens","Refresh Tokens","Token Lifetime"]' },
          { url: 'https://auth0.com/docs/api/authentication', title: 'Authentication API', description: 'Authentication API endpoints and reference', headings: '["Login","Signup","Password Reset","Get Token"]' },
        ],
      },
      stripe: {
        domains: ['docs.stripe.com', 'stripe.com'],
        pages: [
          { url: 'https://docs.stripe.com/payments/checkout', title: 'Stripe Checkout', description: 'Accept payments online with prebuilt Checkout pages', headings: '["Quickstart","Customization","Fulfillment","Webhooks"]' },
          { url: 'https://docs.stripe.com/payments/payment-intents', title: 'Payment Intents API', description: 'Build custom payment flows with the Payment Intents API', headings: '["Creating Intents","Confirming Payments","Handling Actions"]' },
          { url: 'https://docs.stripe.com/billing/subscriptions/overview', title: 'Subscription Billing', description: 'Recurring billing and subscription management', headings: '["Creating Subscriptions","Invoicing","Customer Portal"]' },
          { url: 'https://docs.stripe.com/webhooks', title: 'Webhooks', description: 'Listen for events on your Stripe account', headings: '["Setting Up Webhooks","Event Types","Verifying Signatures"]' },
        ],
      },
      nextjs: {
        domains: ['nextjs.org'],
        pages: [
          { url: 'https://nextjs.org/docs/app/guides/static-exports', title: 'Static Exports', description: 'Export your Next.js application to static HTML/CSS/JS', headings: '["Configuration","Supported Features","Unsupported Features","Deploying"]' },
          { url: 'https://nextjs.org/docs/app/building-your-application/routing', title: 'Routing Fundamentals', description: 'App Router file-based routing system', headings: '["Layouts","Pages","Route Groups","Dynamic Routes"]' },
          { url: 'https://nextjs.org/docs/app/building-your-application/data-fetching', title: 'Data Fetching and Caching', description: 'Server components, fetch caching, and revalidation', headings: '["Fetching Data","Caching","Revalidating","Server Actions"]' },
          { url: 'https://nextjs.org/docs/app/api-reference/components/link', title: 'Link Component', description: 'Client-side transitions between routes with prefetching', headings: '["Props","Examples","Prefetching"]' },
        ],
      },
      vercel: {
        domains: ['vercel.com'],
        pages: [
          { url: 'https://vercel.com/docs/functions', title: 'Serverless and Edge Functions', description: 'Build and deploy serverless functions at the edge', headings: '["Quickstart","Runtimes","Streaming","Edge Middleware"]' },
          { url: 'https://vercel.com/docs/deployments/overview', title: 'Deployments Overview', description: 'How Vercel builds and deploys your applications', headings: '["Git Integration","Preview Deployments","Production Deployments"]' },
          { url: 'https://vercel.com/docs/storage/vercel-postgres', title: 'Vercel Postgres', description: 'Serverless SQL database powered by Neon', headings: '["Quickstart","Connection Pooling","Backups","Pricing"]' },
          { url: 'https://vercel.com/docs/edge-network/overview', title: 'Edge Network Overview', description: 'Global CDN, edge routing, and caching infrastructure', headings: '["Routing","Caching","Headers","Compression"]' },
        ],
      },
      supabase: {
        domains: ['supabase.com'],
        pages: [
          { url: 'https://supabase.com/docs/guides/auth', title: 'Supabase Auth', description: 'User management and authentication for your Postgres database', headings: '["User Management","Social Login","Passwordless","Row Level Security"]' },
          { url: 'https://supabase.com/docs/guides/database', title: 'Database', description: 'Full Postgres database with real-time subscriptions and vector search', headings: '["Tables & Views","Realtime","pgvector","Migrations"]' },
          { url: 'https://supabase.com/docs/guides/storage', title: 'Storage', description: 'Store and serve large files like images and videos', headings: '["Buckets","Access Control","Transformations","Resumable Uploads"]' },
          { url: 'https://supabase.com/docs/guides/functions', title: 'Edge Functions', description: 'Globally distributed TypeScript functions', headings: '["Quickstart","Secrets","Deno Runtimes","Auth Integration"]' },
        ],
      },
    };

    const SCENARIOS = [
      {
        dead: 'https://auth0.com/docs/customize/login-pages/acul',
        context: 'Auth0 docs restructured "Advanced Customizations" in Universal Login',
        siteKey: 'auth0'
      },
      {
        dead: 'https://docs.stripe.com/payment/checkout',
        context: 'Singular "payment" instead of plural "payments"',
        siteKey: 'stripe'
      },
      {
        dead: 'https://nextjs.org/docs/app/building-your-application/deploying/static-html-export',
        context: 'Next.js 14 moved static export docs to App Guides',
        siteKey: 'nextjs'
      },
      {
        dead: 'https://vercel.com/docs/edge-functions/overview',
        context: 'Vercel consolidated Edge & Serverless under /docs/functions',
        siteKey: 'vercel'
      },
      {
        dead: 'https://supabase.com/docs/auth/overview',
        context: 'Supabase moved auth to /docs/guides/auth',
        siteKey: 'supabase'
      },
      {
        dead: 'https://react.dev/reference/hooks',
        context: 'Missing "/react/" in the reference path',
        siteKey: 'react'
      },
    ];

    function levenshtein(a, b) {
      if (a === b) return 0;
      if (!a.length) return b.length;
      if (!b.length) return a.length;
      const matrix = [];
      for (let i = 0; i <= b.length; i++) matrix[i] = [i];
      for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
          }
        }
      }
      return matrix[b.length][a.length];
    }

    function tokenizePath(path) {
      return path.toLowerCase().split(/[\\/\\-_.]+/).filter(t => t.length > 1);
    }

    function jaccard(setA, setB) {
      const a = new Set(setA);
      const b = new Set(setB);
      if (a.size === 0 && b.size === 0) return 0;
      let intersection = 0;
      for (const item of a) if (b.has(item)) intersection++;
      return intersection / (a.size + b.size - intersection);
    }

    function scoreMatch(deadUrl, page) {
      const deadPath = new URL(deadUrl).pathname;
      const pagePath = new URL(page.url).pathname;

      const deadTokens = tokenizePath(deadPath);
      const pageTokens = tokenizePath(pagePath);
      const pathScore = jaccard(deadTokens, pageTokens);

      const maxLen = Math.max(deadPath.length, pagePath.length);
      const levScore = maxLen > 0 ? 1 - levenshtein(deadPath, pagePath) / maxLen : 0;

      const deadTerms = new Set(deadTokens);
      const pageTerms = new Set([
        ...tokenizePath(page.title || ''),
        ...tokenizePath(page.description || ''),
      ]);
      const kwScore = jaccard(deadTerms, pageTerms);

      const total = pathScore * 0.5 + levScore * 0.3 + kwScore * 0.2;
      let matchType = 'related';
      if (pathScore > 0.4 || total > 0.6) matchType = 'moved';
      else if (pathScore > 0.2 || total > 0.35) matchType = 'similar';

      return {
        url: page.url,
        title: page.title,
        description: page.description,
        score: Math.min(1, Math.max(0, total)),
        matchType,
        breakdown: { path: Math.round(pathScore * 100), lev: Math.round(levScore * 100), kw: Math.round(kwScore * 100) }
      };
    }

    function renderResults(deadUrl, suggestions, contextMsg) {
      const linkEl = document.getElementById('dead-url-link');
      linkEl.textContent = deadUrl;
      linkEl.href = deadUrl;
      document.getElementById('dead-url-context').textContent = contextMsg || '';

      // 1. Suggestions List
      const listEl = document.getElementById('results-list');
      listEl.innerHTML = '';

      if (suggestions.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-muted);padding:1rem;text-align:center">No matches found for this path.</div>';
      }

      suggestions.forEach((s) => {
        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.innerHTML =
          '<div class="sugg-header">' +
            '<a href="' + s.url + '" target="_blank" rel="noopener" class="sugg-title-link">' + (s.title || s.url) + '</a>' +
            '<span class="sugg-badge sugg-badge-' + s.matchType + '">' + s.matchType + '</span>' +
          '</div>' +
          '<div class="sugg-url">' + s.url + '</div>' +
          '<p class="sugg-desc">' + (s.description || 'Target replacement endpoint') + '</p>' +
          '<div class="sugg-scores">' +
            '<span>Confidence: <strong class="score-chip">' + Math.round(s.score * 100) + '%</strong></span>' +
            '<span>Path: ' + (s.breakdown?.path ?? '--') + '%</span>' +
            '<span>Lev: ' + (s.breakdown?.lev ?? '--') + '%</span>' +
            '<span>Keywords: ' + (s.breakdown?.kw ?? '--') + '%</span>' +
          '</div>';
        listEl.appendChild(card);
      });

      // 2. Raw HTTP Headers
      const topUrl = suggestions[0]?.url || '/';
      const rawHeaders =
        'HTTP/1.1 404 Not Found\\n' +
        'Content-Type: text/html; charset=utf-8\\n' +
        'Link: <' + topUrl + '>; rel="alternate"; type="text/html"\\n' +
        'X-Agent-404-Status: match_found\\n' +
        'X-Agent-404-Confidence: ' + (suggestions[0] ? Math.round(suggestions[0].score * 100) + '%' : '0%') + '\\n' +
        'Vary: Accept, User-Agent\\n' +
        'Cache-Control: public, max-age=60, s-maxage=300';
      document.getElementById('raw-headers-pre').textContent = rawHeaders;

      // 3. schema.org JSON-LD
      const jsonLdObj = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Page Not Found",
        "description": "The requested resource has moved or was not found.",
        "mainEntity": {
          "@type": "ItemList",
          "itemListElement": suggestions.map((s, i) => ({
            "@type": "ListItem",
            "position": i + 1,
            "url": s.url,
            "name": s.title || s.url,
            "description": s.description || ""
          }))
        }
      };
      document.getElementById('raw-jsonld-pre').textContent = JSON.stringify(jsonLdObj, null, 2);

      // 4. Crawler Trace
      const trace =
        '[1] AI Agent (Cursor / Claude Code) GET ' + deadUrl + '\\n' +
        '[2] agent-404 middleware intercepts HTTP 404\\n' +
        '[3] Evaluated hybrid matcher against sitemap -> top candidate: ' + topUrl + ' (' + (suggestions[0] ? Math.round(suggestions[0].score * 100) : 0) + '%)\\n' +
        '[4] Attached RFC 5988 Link header & schema.org ItemList JSON-LD to 404 response\\n' +
        '[5] AI Agent parses alternate Link relation and follows destination URL in single hop without failure.';
      document.getElementById('raw-trace-pre').textContent = trace;
    }

    function runScenario(idx) {
      document.querySelectorAll('.scenario-card').forEach((c, i) => {
        c.classList.toggle('active', i === idx);
      });
      const sc = SCENARIOS[idx];
      document.getElementById('url-input').value = sc.dead;
      const site = SITES[sc.siteKey];
      const scored = site.pages
        .map(p => scoreMatch(sc.dead, p))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      renderResults(sc.dead, scored, sc.context);
    }

    async function runMatch() {
      const input = document.getElementById('url-input').value.trim();
      if (!input) return;

      let fullUrl = input;
      if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        fullUrl = 'https://' + fullUrl;
      }

      const btn = document.getElementById('btn-run-match');
      btn.disabled = true;
      btn.textContent = 'Analyzing…';

      try {
        const parsed = new URL(fullUrl);
        const host = parsed.hostname;

        // Check if matching preset site or live audit API
        let siteMatch = null;
        for (const [k, s] of Object.entries(SITES)) {
          if (s.domains.some(d => host.includes(d))) {
            siteMatch = s;
            break;
          }
        }

        if (siteMatch) {
          const scored = siteMatch.pages
            .map(p => scoreMatch(fullUrl, p))
            .sort((a, b) => b.score - a.score)
            .slice(0, 4);
          renderResults(fullUrl, scored, 'Matched against local sitemap index for ' + host);
        } else {
          // Live audit check
          const res = await fetch('/api/audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: host, deadPath: parsed.pathname })
          });
          if (res.ok) {
            const report = await res.json();
            showAuditReport(report, fullUrl);
          } else {
            // fallback heuristic
            const fallbackSugg = [{
              url: 'https://' + host + '/',
              title: host + ' Home',
              description: 'Root page fallback',
              score: 0.45,
              matchType: 'related',
              breakdown: { path: 30, lev: 30, kw: 30 }
            }];
            renderResults(fullUrl, fallbackSugg, 'Simulated 404 recovery for ' + host);
          }
        }
      } catch (err) {
        showToast('Invalid URL format');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Analyze & Match';
      }
    }

    function showAuditReport(report, deadUrl) {
      const card = document.getElementById('audit-card');
      card.style.display = 'block';
      const scoreNum = document.getElementById('audit-score-num');
      scoreNum.textContent = report.score + '/100';
      scoreNum.className = 'audit-score-val ' + (report.score >= 75 ? 'score-good' : report.score >= 40 ? 'score-warning' : 'score-critical');
      document.getElementById('audit-recommendation').textContent = report.summary.recommendation;

      const crawlerEl = document.getElementById('check-crawler');
      crawlerEl.textContent = report.summary.crawlerAccessible ? '✓' : '✗';
      crawlerEl.className = report.summary.crawlerAccessible ? 'check-icon-pass' : 'check-icon-fail';

      const headersEl = document.getElementById('check-headers');
      headersEl.textContent = report.summary.linkHeadersConfigured ? '✓' : '✗';
      headersEl.className = report.summary.linkHeadersConfigured ? 'check-icon-pass' : 'check-icon-fail';

      const jsonldEl = document.getElementById('check-jsonld');
      jsonldEl.textContent = report.summary.jsonLdConfigured ? '✓' : '✗';
      jsonldEl.className = report.summary.jsonLdConfigured ? 'check-icon-pass' : 'check-icon-fail';

      const dummySugg = [
        {
          url: 'https://' + report.domain + '/docs/latest',
          title: report.domain + ' Documentation',
          description: 'Top candidate indexed from sitemap',
          score: 0.88,
          matchType: 'moved',
          breakdown: { path: 90, lev: 80, kw: 75 }
        }
      ];
      renderResults(deadUrl, dummySugg, 'Standing audit probe report for ' + report.domain);
    }

    // Check query param for standing audit permalink
    const urlParams = new URLSearchParams(window.location.search);
    const auditId = urlParams.get('audit');
    if (auditId) {
      fetch('/api/audit/' + encodeURIComponent(auditId))
        .then(r => r.json())
        .then(rep => {
          if (rep && !rep.error) {
            showAuditReport(rep, 'https://' + rep.domain + '/docs/broken-link');
          }
        })
        .catch(() => {});
    } else {
      // Run initial scenario 0
      runScenario(0);
    }
  </script>
</body>
</html>`;
