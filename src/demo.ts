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

    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 0;
      border-bottom: 1px solid var(--border);
    }
    .logo { font-family: var(--mono); font-size: 1rem; font-weight: 700; color: var(--text); }
    .logo span { color: var(--text-secondary); }
    nav .links { display: flex; gap: 1.5rem; font-size: 0.875rem; }
    nav .links a { color: var(--text-secondary); }
    nav .links a:hover { color: var(--text); text-decoration: none; }

    .hero {
      padding: 2.5rem 0 0.5rem;
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
      max-width: 540px;
      margin: 0 auto;
    }
    .hero .sub {
      font-size: 0.8rem;
      color: #52525b;
      margin-top: 0.25rem;
    }

    /* Scenario cards */
    .scenarios {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 1.75rem auto;
      max-width: 640px;
    }
    .scenario {
      flex: 1 1 auto;
      min-width: 140px;
      padding: 0.7rem 0.85rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .scenario:hover { border-color: var(--text-secondary); }
    .scenario.active { border-color: var(--accent); background: rgba(59,130,246,0.05); }
    .scenario .sc-label {
      font-family: var(--mono);
      font-size: 0.6rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-secondary);
      margin-bottom: 0.25rem;
    }
    .scenario .sc-dead {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: var(--red);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-decoration: line-through;
      text-decoration-color: rgba(239,68,68,0.4);
    }

    /* Input */
    .input-area {
      margin: 0 auto 1.5rem;
      max-width: 640px;
    }
    .or-divider {
      text-align: center;
      font-size: 0.7rem;
      font-family: var(--mono);
      color: #52525b;
      margin: 0.75rem 0;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .input-wrapper {
      display: flex;
      gap: 0.5rem;
      align-items: stretch;
    }
    .url-input {
      flex: 1;
      padding: 0.65rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      font-family: var(--mono);
      font-size: 0.8rem;
      outline: none;
      transition: border-color 0.15s;
    }
    .url-input:focus { border-color: var(--accent); }
    .url-input::placeholder { color: #52525b; }
    .suggest-btn {
      padding: 0.65rem 1.25rem;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .suggest-btn:hover { background: var(--accent-dim); }

    /* Dead URL bar */
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
    .dead-url-bar a.url:hover {
      color: var(--text);
    }
    .dead-url-bar .context {
      margin-left: auto;
      font-size: 0.65rem;
      color: #52525b;
      flex-shrink: 0;
      white-space: nowrap;
    }

    /* Results */
    .results-area {
      margin: 1rem auto 0;
      max-width: 640px;
    }
    .results-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }
    .results-header h2 {
      font-size: 0.75rem;
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
      margin-bottom: 0.4rem;
    }
    .match-badge {
      font-family: var(--mono);
      font-size: 0.6rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .match-badge.moved { background: var(--orange-dim); color: var(--orange); }
    .match-badge.similar { background: var(--green-dim); color: var(--green); }
    .match-badge.related { background: var(--yellow-dim); color: var(--yellow); }
    .result-url {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--green);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .result-url:hover { text-decoration: underline; }
    .result-score {
      margin-left: auto;
      font-family: var(--mono);
      font-size: 0.7rem;
      color: var(--text-secondary);
      flex-shrink: 0;
    }
    .result-title {
      font-size: 0.85rem;
      font-weight: 500;
      margin-bottom: 0.1rem;
    }
    .result-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .signals {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
      flex-wrap: wrap;
    }
    .signal {
      font-family: var(--mono);
      font-size: 0.6rem;
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

    /* JSON-LD */
    .jsonld-section {
      margin-top: 1.25rem;
      max-width: 640px;
      margin-left: auto;
      margin-right: auto;
    }
    .jsonld-toggle {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: var(--text-secondary);
      background: none;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.35rem 0.65rem;
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
      font-size: 0.7rem;
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
    .empty-state p { font-size: 0.85rem; }

    /* CTA */
    .cta {
      text-align: center;
      margin: 3rem auto 0;
      max-width: 640px;
      padding: 2rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
    }
    .cta h3 {
      font-size: 1.1rem;
      font-weight: 700;
      margin-bottom: 0.35rem;
    }
    .cta p {
      font-size: 0.85rem;
      color: var(--text-secondary);
      margin-bottom: 1rem;
    }
    .cta .btn-group { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 500;
      transition: all 0.15s;
    }
    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover { background: var(--accent-dim); text-decoration: none; }
    .btn-secondary { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { border-color: var(--text-secondary); text-decoration: none; }

    footer {
      padding: 2rem 0;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 0.8rem;
      color: #52525b;
      margin-top: 2rem;
    }
    footer a { color: #52525b; }
    footer a:hover { color: var(--text-secondary); }

    @media (max-width: 600px) {
      .hero h1 { font-size: 1.5rem; }
      .scenarios { flex-direction: column; }
      .input-wrapper { flex-direction: column; }
      .result-top { flex-wrap: wrap; }
    }
  </style>
  <script defer src="/_vercel/insights/script.js"></script>
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
      <h1>See it <span class="highlight">in action</span></h1>
      <p>An AI agent follows a stale link and gets a 404. Here's what agent-404 does next.</p>
      <p class="sub">Same matching algorithm as production. Try any website — we'll fetch its sitemap live.</p>
    </div>

    <div class="scenarios" id="scenarios">
      <div class="scenario active" onclick="runScenario(0)">
        <div class="sc-label">Agent hallucination</div>
        <div class="sc-dead">auth0.com/docs/customize/login-pages/acul</div>
      </div>
      <div class="scenario" onclick="runScenario(1)">
        <div class="sc-label">Typo</div>
        <div class="sc-dead">docs.stripe.com/payment/checkout</div>
      </div>
      <div class="scenario" onclick="runScenario(2)">
        <div class="sc-label">Docs restructure</div>
        <div class="sc-dead">nextjs.org/docs/…/static-html-export</div>
      </div>
      <div class="scenario" onclick="runScenario(3)">
        <div class="sc-label">Path rename</div>
        <div class="sc-dead">vercel.com/docs/edge-functions/overview</div>
      </div>
      <div class="scenario" onclick="runScenario(4)">
        <div class="sc-label">Path restructure</div>
        <div class="sc-dead">supabase.com/docs/auth/overview</div>
      </div>
      <div class="scenario" onclick="runScenario(5)">
        <div class="sc-label">Missing segment</div>
        <div class="sc-dead">react.dev/reference/hooks</div>
      </div>
    </div>

    <div class="or-divider">or type your own</div>

    <div class="input-area">
      <div class="input-wrapper">
        <input type="text" class="url-input" id="url-input" placeholder="Paste any URL — try your own site..." autocomplete="off" spellcheck="false">
        <button class="suggest-btn" onclick="runMatch()">Find matches</button>
      </div>
    </div>

    <div class="dead-url-bar" id="dead-url-bar">
      <span class="label">404</span>
      <a class="url" id="dead-url-display" target="_blank" rel="noopener"></a>
      <span class="context" id="dead-url-context"></span>
    </div>

    <div class="results-area" id="results-area">
      <div class="empty-state" id="empty-state">
        <p>Click a scenario above to see agent-404 in action</p>
      </div>
      <div id="results-container" style="display:none">
        <div class="results-header">
          <h2>Suggestions returned to the agent</h2>
          <span class="results-count" id="results-count"></span>
        </div>
        <div id="results-list"></div>
      </div>
    </div>

    <div class="jsonld-section" id="jsonld-section" style="display:none">
      <button class="jsonld-toggle" id="jsonld-toggle" onclick="toggleJsonLd()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>
        View JSON-LD (what agents parse from the page)
      </button>
      <pre class="jsonld-pre" id="jsonld-pre"></pre>
    </div>

    <div class="cta">
      <h3>Add this to your site in 30 seconds</h3>
      <p>One script tag. Your 404 pages start returning structured suggestions to every AI agent that visits.</p>
      <div class="btn-group">
        <a href="/" class="btn btn-primary">Get your script tag</a>
        <a href="https://github.com/bharath31/agent-404" class="btn btn-secondary">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          View source
        </a>
      </div>
    </div>

    <footer>
      <a href="/">agent-404</a> &middot; <a href="https://github.com/bharath31/agent-404">Source</a> &middot; Built with ❤️ by <a href="https://bharath.sh">Bharath Natarajan</a>
    </footer>
  </div>

  <script>
    // ==========================================
    // Pages grouped by site — matches production behavior
    // where each site only has its own pages indexed.
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
      nextjs: {
        domains: ['nextjs.org'],
        pages: [
          { url: 'https://nextjs.org/docs/app/api-reference/functions', title: 'Functions', description: 'Next.js API reference for functions', headings: '["cookies","headers","redirect","NextRequest","NextResponse"]' },
          { url: 'https://nextjs.org/docs/app/building-your-application/routing', title: 'Routing', description: 'File-system based routing in Next.js App Router', headings: '["Layouts","Pages","Loading","Error Handling","Route Groups"]' },
          { url: 'https://nextjs.org/docs/app/getting-started/fetching-data', title: 'Fetching Data', description: 'Data fetching patterns in Next.js', headings: '["Server Components","Client Components","Streaming"]' },
          { url: 'https://nextjs.org/docs/app/guides/authentication', title: 'Authentication', description: 'Add authentication to your Next.js app', headings: '["Sign In","Sign Up","Session Management"]' },
          { url: 'https://nextjs.org/docs/app/getting-started/project-structure', title: 'Project Structure', description: 'Next.js project folder and file conventions', headings: '["app Directory","Top-level Files","Routing Files"]' },
          { url: 'https://nextjs.org/docs/app/building-your-application/routing/route-handlers', title: 'Route Handlers', description: 'Create API endpoints using Route Handlers', headings: '["GET","POST","Dynamic Routes","Cookies","Headers"]' },
          { url: 'https://nextjs.org/docs/app/guides/static-exports', title: 'Static Exports', description: 'Create a static export of your Next.js application', headings: '["Configuration","Server Components","Client Components","Image Optimization","Deploying"]' },
        ],
      },
      vercel: {
        domains: ['vercel.com'],
        pages: [
          { url: 'https://vercel.com/docs/functions', title: 'Vercel Functions', description: 'Deploy serverless and edge functions on Vercel', headings: '["Serverless Functions","Edge Functions","Streaming","Fluid Compute"]' },
          { url: 'https://vercel.com/docs/frameworks/nextjs', title: 'Next.js on Vercel', description: 'Deploy Next.js applications on Vercel', headings: '["App Router","Pages Router","ISR","Middleware"]' },
          { url: 'https://vercel.com/docs/getting-started-with-vercel', title: 'Getting Started', description: 'Get started with Vercel', headings: '["Create a Project","Deploy","Custom Domains"]' },
          { url: 'https://vercel.com/docs/deployments/environments', title: 'Environments', description: 'Manage deployment environments', headings: '["Production","Preview","Development","Custom"]' },
          { url: 'https://vercel.com/docs/routing-middleware', title: 'Routing Middleware', description: 'Run code before a request is processed', headings: '["Matching Paths","Rewriting","Redirecting"]' },
          { url: 'https://vercel.com/docs/image-optimization', title: 'Image Optimization', description: 'Optimize images for the web', headings: '["Formats","Sizes","Caching","CDN"]' },
        ],
      },
      supabase: {
        domains: ['supabase.com', 'supabase.io'],
        pages: [
          { url: 'https://supabase.com/docs/guides/auth', title: 'Auth', description: 'Add authentication and authorization to your Supabase project', headings: '["Email Login","OAuth Providers","Row Level Security","SSO"]' },
          { url: 'https://supabase.com/docs/guides/database/overview', title: 'Database', description: 'Use Postgres with Supabase', headings: '["Tables","Functions","Triggers","Extensions"]' },
          { url: 'https://supabase.com/docs/guides/storage', title: 'Storage', description: 'Store and serve files with Supabase Storage', headings: '["Buckets","Upload","Download","Access Control"]' },
          { url: 'https://supabase.com/docs/guides/realtime', title: 'Realtime', description: 'Listen to database changes in real time', headings: '["Broadcast","Presence","Postgres Changes"]' },
          { url: 'https://supabase.com/docs/guides/functions', title: 'Edge Functions', description: 'Server-side TypeScript functions', headings: '["Quickstart","Deploy","Secrets","CORS"]' },
          { url: 'https://supabase.com/docs/guides/getting-started', title: 'Getting Started', description: 'Get started with Supabase', headings: '["Create a Project","Connect","Insert Data"]' },
        ],
      },
      stripe: {
        domains: ['docs.stripe.com', 'stripe.com'],
        pages: [
          { url: 'https://docs.stripe.com/payments/payment-intents', title: 'Payment Intents', description: 'Use the Payment Intents API to accept payments', headings: '["Create","Confirm","Capture","Cancel"]' },
          { url: 'https://docs.stripe.com/payments/checkout', title: 'Checkout', description: 'Prebuilt payment page hosted by Stripe', headings: '["Quickstart","Custom Domains","Subscriptions"]' },
          { url: 'https://docs.stripe.com/payments/elements', title: 'Payment Elements', description: 'Embed a payment form on your site', headings: '["Setup","Appearance","Payment Methods"]' },
          { url: 'https://docs.stripe.com/api/authentication', title: 'Authentication', description: 'Authenticate your API requests with Stripe API keys', headings: '["API Keys","Restricted Keys","Bearer Auth"]' },
          { url: 'https://docs.stripe.com/billing/subscriptions/change', title: 'Change Subscriptions', description: 'Upgrade, downgrade, or change subscriptions', headings: '["Proration","Immediate Changes","Scheduled Changes"]' },
          { url: 'https://docs.stripe.com/connect/marketplace', title: 'Marketplace Payments', description: 'Build a marketplace with Stripe Connect', headings: '["Onboarding","Payments","Payouts","Fees"]' },
        ],
      },
      auth0: {
        domains: ['auth0.com'],
        pages: [
          { url: 'https://auth0.com/docs/customize/login-pages/advanced-customizations', title: 'Advanced Customizations for Universal Login', description: 'Extend Universal Login with ACUL for multi-branding and custom logic', headings: '["Multi-branding","Custom Login","Analytics Integration","ACUL SDK"]' },
          { url: 'https://auth0.com/docs/customize/login-pages', title: 'Login Pages', description: 'Customize the look and feel of your login experience', headings: '["Universal Login","Classic Login","Page Templates"]' },
          { url: 'https://auth0.com/docs/customize/actions', title: 'Actions', description: 'Customize Auth0 with serverless functions triggered during the auth pipeline', headings: '["Triggers","Flows","Secrets","Testing"]' },
          { url: 'https://auth0.com/docs/customize', title: 'Customize', description: 'Customize every aspect of the Auth0 experience', headings: '["Branding","Actions","Login Pages","Email Templates"]' },
          { url: 'https://auth0.com/docs/authenticate', title: 'Authenticate', description: 'Add login to your application with Auth0', headings: '["Database Connections","Social Login","Enterprise SSO","Passwordless"]' },
          { url: 'https://auth0.com/docs/manage-users', title: 'Manage Users', description: 'User management and profiles in Auth0', headings: '["User Profiles","Roles","Permissions","Organizations"]' },
          { url: 'https://auth0.com/docs/secure', title: 'Secure', description: 'Security features and best practices', headings: '["Attack Protection","Tokens","Multi-factor Authentication"]' },
          { url: 'https://auth0.com/docs/get-started/authentication-and-authorization-flow', title: 'Auth Flows', description: 'Authentication and authorization flows', headings: '["Authorization Code","PKCE","Client Credentials","Device Auth"]' },
          { url: 'https://auth0.com/docs/get-started/auth0-for-ai-agents', title: 'Auth0 for AI Agents', description: 'Authenticate and authorize AI agents with Auth0', headings: '["Agent Authentication","Token Scoping","MCP Integration"]' },
        ],
      },
    };

    // Scenarios — real migration stories with context
    const SCENARIOS = [
      {
        dead: 'https://auth0.com/docs/customize/login-pages/acul',
        context: 'Agent hallucinated "acul" instead of "advanced-customizations"',
      },
      {
        dead: 'https://docs.stripe.com/payment/checkout',
        context: 'Agent used singular "payment" instead of "payments"',
      },
      {
        dead: 'https://nextjs.org/docs/app/building-your-application/deploying/static-html-export',
        context: 'Page moved to /docs/app/guides/static-exports',
      },
      {
        dead: 'https://vercel.com/docs/edge-functions/overview',
        context: 'Edge Functions restructured under /docs/functions',
      },
      {
        dead: 'https://supabase.com/docs/auth/overview',
        context: 'Auth docs moved from /docs/auth/ to /docs/guides/auth',
      },
      {
        dead: 'https://react.dev/reference/hooks',
        context: 'Agent dropped /react/ segment from the path',
      },
    ];

    // ==========================================
    // Domain → site lookup (with live sitemap fetch for unknown domains)
    // ==========================================
    const sitemapCache = {}; // domain → { pages, ts }

    function getKnownSitePages(deadUrl) {
      let hostname = '';
      try { hostname = new URL(deadUrl).hostname; } catch { return null; }
      for (const site of Object.values(SITES)) {
        if (site.domains.some(d => hostname === d || hostname.endsWith('.' + d))) {
          return site.pages;
        }
      }
      return null;
    }


    async function fetchSitemapPages(domain, deadPath) {
      // Cache key includes path so different paths can prioritize different sitemaps
      const cacheKey = domain + ':' + (deadPath || '');
      const entry = sitemapCache[cacheKey];
      if (entry && (Date.now() - entry.ts) < 5 * 60 * 1000) return entry;
      try {
        let url = '/api/demo/sitemap?domain=' + encodeURIComponent(domain);
        if (deadPath) url += '&path=' + encodeURIComponent(deadPath);
        const resp = await fetch(url);
        const data = await resp.json();
        const pages = (data.pages || []).map(p => ({
          url: p.url, title: p.title || '', description: p.description || '', headings: '[]'
        }));
        const result = { pages, source: data.source || 'none', error: data.error || null, ts: Date.now() };
        sitemapCache[cacheKey] = result;
        return result;
      } catch {
        const result = { pages: [], source: 'none', error: null, ts: Date.now() };
        sitemapCache[cacheKey] = result;
        return result;
      }
    }

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
    function isPrefixMatch(a, b) {
      if (a.length < 3 || b.length < 3) return false;
      return a.startsWith(b) || b.startsWith(a);
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
          else {
            const pm = b.find(bs => !used.has(bs) && isPrefixMatch(seg, bs));
            if (pm) { matches += 0.7; used.add(pm); }
          }
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
      for (const w of a) {
        if (b.has(w)) { inter++; }
        else {
          for (const bw of b) { if (isPrefixMatch(w, bw)) { inter += 0.7; break; } }
        }
      }
      return inter / new Set([...a, ...b]).size;
    }
    function findSuggestions(deadUrl, pages) {
      const deadPath = normalizePath(deadUrl);
      const deadSegs = pathSegments(deadPath);
      const deadKw = extractKeywords(deadPath);
      const scored = [];
      for (const page of pages) {
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

    function runScenario(idx) {
      document.querySelectorAll('.scenario').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
      });
      const s = SCENARIOS[idx];
      urlInput.value = s.dead;
      runWithPages(s.dead, s.context);
    }

    function runMatch() {
      let url = urlInput.value.trim();
      if (!url) { urlInput.focus(); return; }
      if (!url.startsWith('http')) url = 'https://' + url;
      document.querySelectorAll('.scenario').forEach(el => el.classList.remove('active'));
      runWithPages(url, '');
    }

    async function runWithPages(deadUrl, context) {
      const knownPages = getKnownSitePages(deadUrl);
      if (knownPages) {
        // Check if known pages produce good matches; if not, try live discovery
        const knownResults = findSuggestions(deadUrl, knownPages);
        if (knownResults.length > 0 && knownResults[0].score > 0.40) {
          showResults(deadUrl, context, knownPages);
          return;
        }
        // Known pages didn't match well — fall through to live discovery
      }

      // Unknown domain — fetch sitemap
      let hostname = '';
      try { hostname = new URL(deadUrl).hostname; } catch { return; }

      // Show loading state
      const bar = document.getElementById('dead-url-bar');
      bar.style.display = 'flex';
      const deadDisplay = document.getElementById('dead-url-display');
      deadDisplay.href = deadUrl;
      deadDisplay.textContent = deadUrl;
      document.getElementById('dead-url-context').textContent = 'Discovering pages on ' + hostname + '...';
      document.getElementById('empty-state').style.display = 'none';
      const container = document.getElementById('results-container');
      container.style.display = 'block';
      document.getElementById('results-count').textContent = 'loading...';
      document.getElementById('results-list').innerHTML =
        '<div style="text-align:center;padding:2rem;color:#52525b;font-size:0.85rem;">Checking llms.txt, sitemap, robots.txt, and page links on ' + hostname + '...</div>';
      document.getElementById('jsonld-section').style.display = 'none';

      let deadPath = '';
      try { deadPath = new URL(deadUrl).pathname; } catch {}
      const result = await fetchSitemapPages(hostname, deadPath);
      if (result.pages.length === 0) {
        const sourceLabel = result.source !== 'none' ? ' via ' + result.source : '';
        document.getElementById('dead-url-context').textContent = 'No pages discovered' + sourceLabel;
        document.getElementById('results-count').textContent = '0 matches';
        const errorMsg = result.error
          ? result.error
          : 'Could not discover pages on ' + hostname + '. The site may have no sitemap, llms.txt, or discoverable links.';
        document.getElementById('results-list').innerHTML =
          '<div style="text-align:center;padding:2rem;color:#52525b;font-size:0.85rem;">' + escapeHtml(errorMsg) + '</div>';
        return;
      }
      const sourceLabel = result.source !== 'none' ? ' via ' + result.source : '';
      document.getElementById('dead-url-context').textContent = result.pages.length + ' pages discovered' + sourceLabel;
      showResults(deadUrl, '', result.pages);
    }

    function showResults(deadUrl, context, pages) {
      const results = findSuggestions(deadUrl, pages);

      // Dead URL bar
      const bar = document.getElementById('dead-url-bar');
      bar.style.display = 'flex';
      const deadDisplay = document.getElementById('dead-url-display');
      deadDisplay.href = deadUrl;
      deadDisplay.textContent = deadUrl;
      document.getElementById('dead-url-context').textContent = context;

      // Results
      document.getElementById('empty-state').style.display = 'none';
      const container = document.getElementById('results-container');
      container.style.display = 'block';
      document.getElementById('results-count').textContent = results.length + ' match' + (results.length !== 1 ? 'es' : '');

      const list = document.getElementById('results-list');
      list.innerHTML = '';

      if (results.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:2rem;color:#52525b;font-size:0.85rem;">No matches found. In production, semantic embeddings would catch more.</div>';
        document.getElementById('jsonld-section').style.display = 'none';
        return;
      }

      results.forEach((r, i) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.style.animationDelay = (i * 0.08) + 's';
        card.innerHTML =
          '<div class="result-top">' +
            '<span class="match-badge ' + escapeHtml(r.matchType) + '">' + escapeHtml(r.matchType) + '</span>' +
            '<a class="result-url" href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener">' + escapeHtml(r.url) + '</a>' +
            '<span class="result-score">' + r.score + '</span>' +
          '</div>' +
          '<div class="result-title">' + escapeHtml(r.title) + '</div>' +
          '<div class="result-desc">' + escapeHtml(r.description) + '</div>' +
          '<div class="signals">' +
            '<span class="signal">path <span class="signal-bar"><span class="signal-fill path" style="width:' + Math.round(r._signals.path * 100) + '%"></span></span> ' + r._signals.path.toFixed(2) + '</span>' +
            '<span class="signal">lev <span class="signal-bar"><span class="signal-fill lev" style="width:' + Math.round(r._signals.lev * 100) + '%"></span></span> ' + r._signals.lev.toFixed(2) + '</span>' +
            '<span class="signal">text <span class="signal-bar"><span class="signal-fill text" style="width:' + Math.round(r._signals.text * 100) + '%"></span></span> ' + r._signals.text.toFixed(2) + '</span>' +
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
      document.getElementById('jsonld-pre').innerHTML = syntaxHighlight(JSON.stringify(jsonld, null, 2));
    }

    function escapeHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

    // Auto-run first scenario on load
    setTimeout(() => runScenario(0), 300);
  </script>
</body>
</html>
`;
