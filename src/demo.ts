export const demoPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Demo — agent-404</title>
  <meta name="description" content="Try agent-404 live. Type a dead URL and see how the fuzzy matcher finds the best replacement.">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%233b82f6'/%3E%3Ctext x='50' y='58' font-family='system-ui,sans-serif' font-size='48' font-weight='800' fill='white' text-anchor='middle' dominant-baseline='middle'%3E404%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0b;
      --surface: #141416;
      --border: #27272a;
      --text: #fafafa;
      --text-secondary: #a1a1aa;
      --accent: #3b82f6;
      --accent-dim: #1d4ed8;
      --green: #22c55e;
      --green-dim: rgba(34,197,94,0.1);
      --orange: #f97316;
      --orange-dim: rgba(249,115,22,0.1);
      --red: #ef4444;
      --red-dim: rgba(239,68,68,0.1);
      --yellow: #eab308;
      --yellow-dim: rgba(234,179,8,0.1);
      --mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .container { max-width: 800px; margin: 0 auto; padding: 0 1.5rem; }

    /* Nav */
    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 0;
      border-bottom: 1px solid var(--border);
    }
    .logo {
      font-family: var(--mono);
      font-size: 1rem;
      font-weight: 700;
      color: var(--text);
    }
    .logo span { color: var(--text-secondary); }
    nav .links { display: flex; gap: 1.5rem; font-size: 0.875rem; }
    nav .links a { color: var(--text-secondary); }
    nav .links a:hover { color: var(--text); text-decoration: none; }

    /* Hero */
    .hero {
      padding: 2.5rem 0 1rem;
      text-align: center;
    }
    .hero h1 {
      font-size: 2rem;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.03em;
      margin-bottom: 0.5rem;
    }
    .hero h1 .highlight { color: var(--accent); }
    .hero p {
      font-size: 0.95rem;
      color: var(--text-secondary);
      max-width: 520px;
      margin: 0 auto;
    }

    /* Input area */
    .input-area {
      margin: 2rem auto;
      max-width: 640px;
    }
    .input-wrapper {
      display: flex;
      gap: 0.5rem;
      align-items: stretch;
    }
    .url-input {
      flex: 1;
      padding: 0.75rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      font-family: var(--mono);
      font-size: 0.85rem;
      outline: none;
      transition: border-color 0.15s;
    }
    .url-input:focus { border-color: var(--accent); }
    .url-input::placeholder { color: #52525b; }
    .suggest-btn {
      padding: 0.75rem 1.5rem;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .suggest-btn:hover { background: var(--accent-dim); }

    /* Example pills */
    .examples {
      margin-top: 0.75rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      justify-content: center;
    }
    .example-pill {
      font-family: var(--mono);
      font-size: 0.7rem;
      padding: 0.3rem 0.6rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }
    .example-pill:hover {
      border-color: var(--accent);
      color: var(--text);
    }

    /* Results */
    .results-area {
      margin: 2rem auto;
      max-width: 640px;
    }
    .results-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .results-header h2 {
      font-size: 0.8rem;
      font-family: var(--mono);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-secondary);
    }
    .results-count {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: #52525b;
    }

    .result-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-bottom: 0.5rem;
      opacity: 0;
      transform: translateY(8px);
      animation: fadeUp 0.3s ease forwards;
    }
    @keyframes fadeUp {
      to { opacity: 1; transform: translateY(0); }
    }
    .result-top {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }
    .match-badge {
      font-family: var(--mono);
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .match-badge.moved {
      background: var(--orange-dim);
      color: var(--orange);
    }
    .match-badge.similar {
      background: var(--green-dim);
      color: var(--green);
    }
    .match-badge.related {
      background: var(--yellow-dim);
      color: var(--yellow);
    }
    .result-url {
      font-family: var(--mono);
      font-size: 0.8rem;
      color: var(--green);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .result-score {
      margin-left: auto;
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--text-secondary);
      flex-shrink: 0;
    }
    .result-title {
      font-size: 0.85rem;
      font-weight: 500;
      margin-bottom: 0.15rem;
    }
    .result-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    /* Signal breakdown */
    .signals {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.6rem;
      flex-wrap: wrap;
    }
    .signal {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: #52525b;
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    .signal-bar {
      width: 40px;
      height: 3px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
    }
    .signal-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.4s ease;
    }
    .signal-fill.path { background: var(--accent); }
    .signal-fill.lev { background: var(--orange); }
    .signal-fill.text { background: var(--green); }

    /* JSON-LD preview */
    .jsonld-section {
      margin-top: 1.5rem;
      max-width: 640px;
      margin-left: auto;
      margin-right: auto;
    }
    .jsonld-toggle {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--text-secondary);
      background: none;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.4rem 0.75rem;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .jsonld-toggle:hover { border-color: var(--text-secondary); color: var(--text); }
    .jsonld-pre {
      margin-top: 0.5rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem;
      font-family: var(--mono);
      font-size: 0.75rem;
      line-height: 1.6;
      color: var(--text-secondary);
      overflow-x: auto;
      display: none;
    }
    .jsonld-pre .key { color: var(--accent); }
    .jsonld-pre .str { color: var(--green); }
    .jsonld-pre .num { color: var(--orange); }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 3rem 0;
      color: #52525b;
    }
    .empty-state .icon { font-size: 2rem; margin-bottom: 0.75rem; }
    .empty-state p { font-size: 0.85rem; }

    /* Dead URL display */
    .dead-url-bar {
      max-width: 640px;
      margin: 0 auto 0.5rem;
      display: none;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1rem;
      background: var(--red-dim);
      border: 1px solid rgba(239,68,68,0.2);
      border-radius: 8px;
      font-family: var(--mono);
      font-size: 0.8rem;
    }
    .dead-url-bar .label {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--red);
      flex-shrink: 0;
    }
    .dead-url-bar .url {
      color: var(--text-secondary);
      text-decoration: line-through;
      text-decoration-color: #52525b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Footer */
    footer {
      padding: 2rem 0;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 0.8rem;
      color: #52525b;
      margin-top: 3rem;
    }
    footer a { color: #52525b; }
    footer a:hover { color: var(--text-secondary); }

    @media (max-width: 600px) {
      .hero h1 { font-size: 1.5rem; }
      .input-wrapper { flex-direction: column; }
      .result-top { flex-wrap: wrap; }
    }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <a href="/" style="text-decoration:none"><div class="logo">agent<span>-</span>404</div></a>
      <div class="links">
        <a href="/">Home</a>
        <a href="https://github.com/bharath31/agent-404">GitHub</a>
      </div>
    </nav>

    <div class="hero">
      <h1>Try it <span class="highlight">live</span></h1>
      <p>Type a dead URL and see how agent-404 finds the best matching page. All matching runs client-side — same algorithm as production.</p>
    </div>

    <div class="input-area">
      <div class="input-wrapper">
        <input type="text" class="url-input" id="url-input" placeholder="https://stripe.com/docs/v2/authentication" autocomplete="off" spellcheck="false">
        <button class="suggest-btn" id="suggest-btn" onclick="runMatch()">Find matches</button>
      </div>
      <div class="examples">
        <span class="example-pill" onclick="tryExample(this)">stripe.com/docs/v2/authentication</span>
        <span class="example-pill" onclick="tryExample(this)">vercel.com/docs/deploy/serverless</span>
        <span class="example-pill" onclick="tryExample(this)">supabase.com/dashboard/billing/invoices</span>
        <span class="example-pill" onclick="tryExample(this)">openai.com/blog/ai-agents-overview</span>
        <span class="example-pill" onclick="tryExample(this)">nextjs.org/docs/api-routes</span>
        <span class="example-pill" onclick="tryExample(this)">github.com/settings/applications</span>
      </div>
    </div>

    <div class="dead-url-bar" id="dead-url-bar">
      <span class="label">404</span>
      <span class="url" id="dead-url-display"></span>
    </div>

    <div class="results-area" id="results-area">
      <div class="empty-state" id="empty-state">
        <div class="icon">&#8593;</div>
        <p>Enter a dead URL or click an example above</p>
      </div>
      <div id="results-container" style="display:none">
        <div class="results-header">
          <h2>Suggestions</h2>
          <span class="results-count" id="results-count"></span>
        </div>
        <div id="results-list"></div>
      </div>
    </div>

    <div class="jsonld-section" id="jsonld-section" style="display:none">
      <button class="jsonld-toggle" id="jsonld-toggle" onclick="toggleJsonLd()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>
        View JSON-LD output (what agents see)
      </button>
      <pre class="jsonld-pre" id="jsonld-pre"></pre>
    </div>

    <footer>
      <a href="/">agent-404</a> &middot; <a href="https://github.com/bharath31/agent-404">Source</a> &middot; Built by <a href="https://github.com/bharath31">bharath31</a>
    </footer>
  </div>

  <script>
    // ==========================================
    // Demo page data — realistic pages from well-known sites
    // ==========================================
    const PAGES = [
      // Stripe
      { url: 'https://stripe.com/docs/v3/authentication', title: 'Authentication Guide', description: 'Learn how to authenticate API requests with Stripe', headings: '["API Keys","OAuth 2.0","Restricted Keys"]' },
      { url: 'https://stripe.com/docs/v3/payments', title: 'Payments API', description: 'Accept payments online with Stripe', headings: '["Payment Intents","Charges","Payment Methods"]' },
      { url: 'https://stripe.com/docs/v3/billing', title: 'Billing & Subscriptions', description: 'Manage recurring payments', headings: '["Subscriptions","Invoices","Metered Billing"]' },
      { url: 'https://stripe.com/docs/v3/webhooks', title: 'Webhooks', description: 'Receive event notifications', headings: '["Event Types","Webhook Signatures","Retry Logic"]' },
      { url: 'https://stripe.com/docs/v3/testing', title: 'Testing', description: 'Test your Stripe integration', headings: '["Test Cards","Test Clocks","Mock Webhooks"]' },
      { url: 'https://stripe.com/docs/v3/connect', title: 'Connect Platform', description: 'Build a marketplace or platform', headings: '["Account Types","Onboarding","Payouts"]' },
      // Vercel
      { url: 'https://vercel.com/docs/deployment/edge', title: 'Edge Functions', description: 'Deploy to the edge with Vercel', headings: '["Runtime API","Middleware","Streaming"]' },
      { url: 'https://vercel.com/docs/deployment/builds', title: 'Build Configuration', description: 'Configure your build settings', headings: '["Build Command","Output Directory","Environment Variables"]' },
      { url: 'https://vercel.com/docs/storage/postgres', title: 'Vercel Postgres', description: 'Serverless PostgreSQL database', headings: '["Connection","Queries","Edge Compatibility"]' },
      { url: 'https://vercel.com/docs/frameworks/nextjs', title: 'Next.js on Vercel', description: 'Deploy Next.js applications', headings: '["App Router","Pages Router","ISR"]' },
      { url: 'https://vercel.com/docs/domains', title: 'Custom Domains', description: 'Add custom domains to your project', headings: '["DNS Configuration","SSL Certificates","Redirects"]' },
      // Supabase
      { url: 'https://supabase.com/settings/billing', title: 'Billing & Usage', description: 'Manage your billing and subscription', headings: '["Plans","Payment Methods","Usage"]' },
      { url: 'https://supabase.com/docs/guides/auth', title: 'Authentication', description: 'Add auth to your Supabase project', headings: '["Email Login","OAuth Providers","Row Level Security"]' },
      { url: 'https://supabase.com/docs/guides/database', title: 'Database', description: 'Use Postgres with Supabase', headings: '["Tables","Functions","Triggers"]' },
      { url: 'https://supabase.com/docs/guides/storage', title: 'Storage', description: 'Store and serve files', headings: '["Buckets","Upload","Access Control"]' },
      // OpenAI
      { url: 'https://openai.com/changelog/ai-agents', title: 'AI Agents Update', description: 'Latest updates to AI agent capabilities', headings: '["Function Calling","Tool Use","Agent Framework"]' },
      { url: 'https://openai.com/docs/api-reference', title: 'API Reference', description: 'Complete API documentation', headings: '["Chat Completions","Embeddings","Fine-tuning"]' },
      { url: 'https://openai.com/docs/models', title: 'Models', description: 'Available models and capabilities', headings: '["GPT-4","GPT-3.5","DALL-E"]' },
      // Next.js
      { url: 'https://nextjs.org/docs/app/api-reference/functions/next-request', title: 'Route Handlers', description: 'API route handlers in App Router', headings: '["GET","POST","Dynamic Routes"]' },
      { url: 'https://nextjs.org/docs/app/building-your-application/routing', title: 'Routing', description: 'File-system based routing in Next.js', headings: '["Layouts","Pages","Loading States"]' },
      { url: 'https://nextjs.org/docs/app/building-your-application/data-fetching', title: 'Data Fetching', description: 'Fetch data in server components', headings: '["Server Components","Client Components","Caching"]' },
      // GitHub
      { url: 'https://github.com/settings/developer', title: 'Developer Settings', description: 'Manage OAuth apps and tokens', headings: '["OAuth Apps","Personal Access Tokens","GitHub Apps"]' },
      { url: 'https://github.com/settings/security', title: 'Security Settings', description: 'Account security and authentication', headings: '["Two-Factor Auth","Sessions","SSH Keys"]' },
      { url: 'https://github.com/settings/notifications', title: 'Notification Settings', description: 'Configure email and web notifications', headings: '["Email Preferences","Watching","Custom Routing"]' },
      // Cloudflare
      { url: 'https://cloudflare.com/contact/sales', title: 'Contact Sales', description: 'Get in touch for enterprise pricing', headings: '["Enterprise Plans","Custom Solutions","Support"]' },
      { url: 'https://cloudflare.com/products/workers', title: 'Cloudflare Workers', description: 'Serverless execution environment', headings: '["KV Storage","Durable Objects","Cron Triggers"]' },
    ];

    // ==========================================
    // Matcher — same algorithm as production
    // ==========================================
    const SCORE_THRESHOLD = 0.2;
    const MAX_RESULTS = 5;
    const W_PATH = 0.50, W_LEV = 0.30, W_TEXT = 0.20;

    function normalizePath(url) {
      try { return new URL(url).pathname.replace(/\\/+$/, '').toLowerCase(); }
      catch { return url.replace(/\\/+$/, '').toLowerCase(); }
    }

    function pathSegments(p) { return p.split('/').filter(Boolean); }

    function extractKeywords(p) {
      return new Set(p.split(/[\\/_\\-.\\/@]+/).filter(w => w.length > 2).map(w => w.toLowerCase()));
    }

    function safeParseArray(j) {
      try { const a = JSON.parse(j); return Array.isArray(a) ? a : []; } catch { return []; }
    }

    const VERSION_RE = /^(v|ver|version)?(\\d+)$/;
    function isVersionVariant(a, b) {
      const ma = VERSION_RE.exec(a), mb = VERSION_RE.exec(b);
      if (!ma || !mb) return false;
      return ma[1] === mb[1] && ma[2] !== mb[2];
    }

    function jaccardVersionTolerant(a, b) {
      if (!a.length && !b.length) return 1;
      if (!a.length || !b.length) return 0;
      let matches = 0;
      const bSet = new Set(b), used = new Set();
      for (const seg of a) {
        if (bSet.has(seg)) { matches += 1; used.add(seg); }
        else {
          const vm = b.find(bs => !used.has(bs) && isVersionVariant(seg, bs));
          if (vm) { matches += 0.5; used.add(vm); }
        }
      }
      return matches / new Set([...a, ...b]).size;
    }

    function levenshtein(a, b) {
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++) {
          const cost = a[i-1] === b[j-1] ? 0 : 1;
          dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
        }
      return dp[m][n];
    }

    function keywordOverlap(a, b) {
      if (!a.size || !b.size) return 0;
      let inter = 0;
      for (const w of a) if (b.has(w)) inter++;
      return inter / new Set([...a, ...b]).size;
    }

    function findSuggestions(deadUrl) {
      const deadPath = normalizePath(deadUrl);
      const deadSegs = pathSegments(deadPath);
      const deadKw = extractKeywords(deadPath);
      const scored = [];

      for (const page of PAGES) {
        const pagePath = normalizePath(page.url);
        const pageSegs = pathSegments(pagePath);
        const pathScore = jaccardVersionTolerant(deadSegs, pageSegs);
        const levScore = 1 - levenshtein(deadPath, pagePath) / Math.max(deadPath.length, pagePath.length, 1);
        const pageKw = extractKeywords(pagePath);
        const headings = safeParseArray(page.headings);
        const textPool = [page.title, page.description, ...headings].join(' ').toLowerCase();
        const textKw = new Set([...textPool.split(/\\W+/).filter(w => w.length > 2), ...pageKw]);
        const textScore = keywordOverlap(deadKw, textKw);

        const score = W_PATH * pathScore + W_LEV * levScore + W_TEXT * textScore;

        if (score >= SCORE_THRESHOLD) {
          let hasVer = false;
          for (const s of deadSegs) for (const bs of pageSegs) if (isVersionVariant(s, bs)) hasVer = true;
          let matchType;
          if (hasVer && score > 0.6) matchType = 'moved';
          else if (score > 0.6) matchType = 'similar';
          else matchType = 'related';

          scored.push({
            url: page.url, title: page.title, description: page.description,
            score: Math.round(score * 1000) / 1000, matchType,
            _signals: { path: pathScore, lev: levScore, text: textScore }
          });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, MAX_RESULTS);
    }

    // ==========================================
    // UI
    // ==========================================
    const urlInput = document.getElementById('url-input');
    urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') runMatch(); });

    function tryExample(el) {
      urlInput.value = 'https://' + el.textContent;
      runMatch();
    }

    function runMatch() {
      let url = urlInput.value.trim();
      if (!url) { urlInput.focus(); return; }
      if (!url.startsWith('http')) url = 'https://' + url;

      const results = findSuggestions(url);

      // Show dead URL bar
      const bar = document.getElementById('dead-url-bar');
      bar.style.display = 'flex';
      document.getElementById('dead-url-display').textContent = url;

      // Show results
      document.getElementById('empty-state').style.display = 'none';
      const container = document.getElementById('results-container');
      container.style.display = 'block';
      document.getElementById('results-count').textContent = results.length + ' match' + (results.length !== 1 ? 'es' : '');

      const list = document.getElementById('results-list');
      list.innerHTML = '';

      if (results.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:2rem;color:#52525b;font-size:0.85rem;">No matches found. In production, semantic embeddings would catch more matches.</div>';
        document.getElementById('jsonld-section').style.display = 'none';
        return;
      }

      results.forEach((r, i) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.style.animationDelay = (i * 0.08) + 's';
        card.innerHTML =
          '<div class="result-top">' +
            '<span class="match-badge ' + r.matchType + '">' + r.matchType + '</span>' +
            '<span class="result-url">' + r.url + '</span>' +
            '<span class="result-score">' + r.score + '</span>' +
          '</div>' +
          '<div class="result-title">' + r.title + '</div>' +
          '<div class="result-desc">' + r.description + '</div>' +
          '<div class="signals">' +
            '<span class="signal">path <span class="signal-bar"><span class="signal-fill path" style="width:' + Math.round(r._signals.path * 100) + '%"></span></span> ' + (r._signals.path).toFixed(2) + '</span>' +
            '<span class="signal">lev <span class="signal-bar"><span class="signal-fill lev" style="width:' + Math.round(r._signals.lev * 100) + '%"></span></span> ' + (r._signals.lev).toFixed(2) + '</span>' +
            '<span class="signal">text <span class="signal-bar"><span class="signal-fill text" style="width:' + Math.round(r._signals.text * 100) + '%"></span></span> ' + (r._signals.text).toFixed(2) + '</span>' +
          '</div>';
        list.appendChild(card);
      });

      // JSON-LD
      const jsonldSection = document.getElementById('jsonld-section');
      jsonldSection.style.display = 'block';
      const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Page Not Found',
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: results.map((s, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: s.url,
            name: s.title,
            description: s.matchType
          }))
        }
      };
      const pre = document.getElementById('jsonld-pre');
      pre.innerHTML = syntaxHighlight(JSON.stringify(jsonld, null, 2));
    }

    function syntaxHighlight(json) {
      return json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"(@?[\\w]+)"\\s*:/g, '"<span class="key">\$1</span>":')
        .replace(/: "([^"]*)"/g, ': "<span class="str">\$1</span>"')
        .replace(/: (\\d+)/g, ': <span class="num">\$1</span>');
    }

    let jsonldOpen = false;
    function toggleJsonLd() {
      jsonldOpen = !jsonldOpen;
      document.getElementById('jsonld-pre').style.display = jsonldOpen ? 'block' : 'none';
    }
  </script>
</body>
</html>
`;
