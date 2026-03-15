export const landingPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>agent-404 — Agent-friendly 404 pages</title>
  <meta name="description" content="Make your 404 pages useful for AI agents. One script tag. Structured suggestions. Zero config.">
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
      --orange: #f97316;
      --red: #ef4444;
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
      padding: 2.5rem 0 1.5rem;
      text-align: center;
    }
    .hero .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.75rem;
      font-family: var(--mono);
      color: var(--green);
      margin-bottom: 1rem;
      letter-spacing: 0.02em;
    }
    .hero h1 {
      font-size: 2.5rem;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.03em;
      margin-bottom: 0.75rem;
    }
    .hero h1 .highlight { color: var(--accent); }
    .hero p {
      font-size: 1.05rem;
      color: var(--text-secondary);
      max-width: 560px;
      margin: 0 auto 1.25rem;
      line-height: 1.5;
    }

    /* Code block */
    .code-block {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: left;
      margin: 0 auto 1.5rem;
      max-width: 640px;
      overflow-x: auto;
    }
    .copy-btn {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-secondary);
      padding: 0.3rem 0.5rem;
      font-size: 0.7rem;
      font-family: var(--mono);
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    .copy-btn:hover { color: var(--text); border-color: var(--text-secondary); }
    .copy-btn.copied { color: var(--green); border-color: var(--green); }
    .code-block .label {
      font-family: var(--mono);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-secondary);
      margin-bottom: 0.75rem;
    }
    .code-block pre {
      font-family: var(--mono);
      font-size: 0.85rem;
      line-height: 1.7;
      color: var(--text);
      white-space: pre;
      overflow-x: auto;
    }
    .code-block .tag { color: var(--red); }
    .code-block .attr { color: var(--orange); }
    .code-block .str { color: var(--green); }
    .code-block .comment { color: #52525b; }

    /* How it works */
    .section {
      padding: 3rem 0;
      border-top: 1px solid var(--border);
    }
    .section h2 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 2rem;
      letter-spacing: -0.02em;
    }

    .flow {
      display: flex;
      flex-direction: column;
      gap: 0;
      position: relative;
    }
    @media (max-width: 600px) {
      .hero h1 { font-size: 2rem; }
    }

    .flow-card {
      display: flex;
      gap: 1.25rem;
      padding: 1.5rem 0;
      position: relative;
    }
    .flow-card + .flow-card {
      border-top: 1px dashed var(--border);
    }
    .flow-card .step-num {
      flex-shrink: 0;
      width: 2.5rem;
      height: 2.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--accent);
      color: white;
      border-radius: 50%;
      font-family: var(--mono);
      font-size: 0.9rem;
      font-weight: 700;
    }
    .flow-card .step {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.25rem;
    }
    .flow-card h3 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    .flow-card p {
      font-size: 0.875rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* Response preview */
    .response-preview {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-top: 2rem;
    }
    .response-preview .label {
      font-family: var(--mono);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-secondary);
      margin-bottom: 0.75rem;
    }
    .response-preview pre {
      font-family: var(--mono);
      font-size: 0.8rem;
      line-height: 1.6;
      color: var(--text-secondary);
      overflow-x: auto;
    }
    .response-preview .key { color: var(--accent); }
    .response-preview .str { color: var(--green); }
    .response-preview .num { color: var(--orange); }

    /* Use cases */
    .use-cases {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    .use-case {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 1.25rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .use-case .icon {
      font-size: 1.25rem;
      flex-shrink: 0;
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      border-radius: 8px;
    }
    .use-case h3 {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .use-case p {
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    /* Stack */
    .stack-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .stack-tag {
      font-family: var(--mono);
      font-size: 0.8rem;
      padding: 0.35rem 0.75rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-secondary);
    }

    /* CTA */
    .cta {
      text-align: center;
      padding: 4rem 0;
      border-top: 1px solid var(--border);
    }
    .cta h2 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      letter-spacing: -0.02em;
    }
    .cta p {
      color: var(--text-secondary);
      margin-bottom: 1.5rem;
      font-size: 0.95rem;
    }
    .cta .btn-group { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1.25rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.15s;
    }
    .btn-primary {
      background: var(--accent);
      color: white;
    }
    .btn-primary:hover { background: var(--accent-dim); text-decoration: none; }
    .btn-secondary {
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { border-color: var(--text-secondary); text-decoration: none; }

    /* Footer */
    footer {
      padding: 2rem 0;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 0.8rem;
      color: #52525b;
    }
    footer a { color: #52525b; }
    footer a:hover { color: var(--text-secondary); }

    /* Animated demo */
    .demo {
      max-width: 540px;
      margin: 0 auto 1.5rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .demo-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1rem;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .demo-dot {
      width: 8px; height: 8px; border-radius: 50%;
    }
    .demo-dot:nth-child(1) { background: #ef4444; }
    .demo-dot:nth-child(2) { background: #f97316; }
    .demo-dot:nth-child(3) { background: #22c55e; }
    .demo-header span {
      margin-left: 0.5rem;
      font-family: var(--mono);
      font-size: 0.7rem;
      color: #52525b;
    }
    .demo-body {
      padding: 1.25rem 1.25rem;
      min-height: 88px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .demo-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-family: var(--mono);
      font-size: 0.8rem;
      line-height: 1.8;
      transition: opacity 0.3s;
    }
    .demo-label {
      flex-shrink: 0;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      width: 3rem;
      text-align: center;
    }
    .demo-label.miss {
      background: rgba(239,68,68,0.15);
      color: var(--red);
    }
    .demo-label.hit {
      background: rgba(34,197,94,0.15);
      color: var(--green);
    }
    .demo-url {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .demo-url.dead {
      color: var(--text-secondary);
      text-decoration: line-through;
      text-decoration-color: #52525b;
    }
    .demo-url.live {
      color: var(--green);
    }
    .demo-arrow {
      color: #52525b;
      flex-shrink: 0;
      margin: 0.15rem 0 0;
    }
    .demo-fade-enter { opacity: 0; transform: translateY(4px); }
    .demo-fade-active { opacity: 1; transform: translateY(0); transition: all 0.4s ease; }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <div class="logo">agent<span>-</span>404</div>
      <div class="links">
        <a href="https://github.com/bharath31/agent-404">GitHub</a>
        <a href="#get-started">Get started</a>
        <a href="/api/health">API Status</a>
      </div>
    </nav>

    <div class="hero">
      <div class="badge">open source &middot; MIT licensed</div>
      <h1>Turn dead links into<br><span class="highlight">smart redirects for AI</span></h1>
      <p>AI agents hit a broken link and give up. Add one script tag and your 404 pages start suggesting the right page — in a format agents already understand.</p>
    </div>

    <div class="demo">
      <div class="demo-header">
        <div class="demo-dot"></div>
        <div class="demo-dot"></div>
        <div class="demo-dot"></div>
        <span>agent-404</span>
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

    <div class="code-block" id="get-started-block">
      <div class="label">Get your script tag</div>
      <div id="get-started"></div>
      <div id="register-form">
        <div style="display:flex;gap:0.5rem;align-items:stretch">
          <input type="text" id="domain-input" placeholder="your-site.com"
            style="flex:1;padding:0.6rem 0.8rem;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--mono);font-size:0.85rem;outline:none"
            onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
          >
          <button id="register-btn" onclick="registerSite()"
            style="padding:0.6rem 1.25rem;background:var(--accent);color:white;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:background 0.15s"
            onmouseover="this.style.background='var(--accent-dim)'" onmouseout="this.style.background='var(--accent)'"
          >Generate</button>
        </div>
        <p style="margin-top:0.5rem;font-size:0.75rem;color:var(--text-secondary)">Enter your domain to get a ready-to-paste script tag</p>
      </div>
      <div id="snippet-result" style="display:none">
        <pre id="snippet-pre"></pre>
        <p style="margin-top:0.75rem;font-size:0.75rem;color:var(--text-secondary)">
          <span id="registered-domain" style="color:var(--green)"></span> &mdash; paste this into every page on your site
        </p>
      </div>
    </div>

    <div class="section">
      <h2>Who it's for</h2>
      <div class="use-cases">
        <div class="use-case">
          <div class="icon">📚</div>
          <div>
            <h3>"We just shipped v3 and everything broke"</h3>
            <p>You migrated your docs from v2 to v3. Now every AI agent, every Stack Overflow answer, every tutorial links to pages that don't exist anymore. <span style="white-space:nowrap">agent-404</span> notices the version shift and sends them to the right v3 page.</p>
          </div>
        </div>
        <div class="use-case">
          <div class="icon">🔗</div>
          <div>
            <h3>"We restructured our URLs last quarter"</h3>
            <p>You moved <code>/blog/</code> to <code>/articles/</code> and set up redirects for the top 20 posts. But there were 200 more you forgot about. The fuzzy matcher catches those without you maintaining a redirect map.</p>
          </div>
        </div>
        <div class="use-case">
          <div class="icon">🤖</div>
          <div>
            <h3>"Claude keeps linking to our old API docs"</h3>
            <p>LLM agents, coding assistants, and RAG pipelines follow links baked into training data. When those links go stale, they hallucinate answers. Give them a structured path to the current content instead.</p>
          </div>
        </div>
        <div class="use-case">
          <div class="icon">🔍</div>
          <div>
            <h3>"Our 404 rate is climbing in Search Console"</h3>
            <p>Search crawlers find your dead pages and index them as errors. With JSON-LD suggestions embedded in the 404, crawlers discover the right content instead of flagging another broken link.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Stack</h2>
      <p style="color: var(--text-secondary); font-size: 0.9rem;">Fully open source. Self-host or use the hosted version.</p>
      <div class="stack-list">
        <span class="stack-tag">Hono</span>
        <span class="stack-tag">Vercel Edge Functions</span>
        <span class="stack-tag">PostgreSQL</span>
        <span class="stack-tag">Vanilla JS &lt;3KB</span>
        <span class="stack-tag">schema.org JSON-LD</span>
        <span class="stack-tag">MIT License</span>
      </div>
    </div>

    <div class="cta">
      <h2>Stop losing agents to dead links</h2>
      <p>Add one script tag. Your 404 pages start working for you.</p>
      <div class="btn-group">
        <a href="https://github.com/bharath31/agent-404" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          View on GitHub
        </a>
        <a href="/api/health" class="btn btn-secondary">API Status</a>
      </div>
    </div>

    <footer>
      Built by <a href="https://github.com/bharath31">bharath31</a> &middot; <a href="https://github.com/bharath31/agent-404">Source</a>
    </footer>
  </div>
  <script>
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
    document.querySelectorAll('.code-block').forEach(addCopyBtn);

    // Animated demo
    const examples = [
      { dead: '/docs/v2/authentication',   live: '/docs/v3/authentication',   domain: 'acme.com' },
      { dead: '/blog/claude-code-dx',       live: '/writing/claude-code-dx',   domain: 'bharath.sh' },
      { dead: '/api/v1/users/list',         live: '/api/v2/users',             domain: 'stripe.dev' },
      { dead: '/writing/mcp-antipattern',   live: '/writing/mcp',              domain: 'bharath.sh' },
      { dead: '/guides/setup-guide',        live: '/docs/getting-started',     domain: 'supabase.com' },
      { dead: '/writting',                  live: '/writing',                  domain: 'bharath.sh' },
      { dead: '/docs/deploy/serverless',    live: '/docs/deployment/edge',     domain: 'vercel.com' },
    ];
    let demoIdx = 0;
    const demoDead = document.getElementById('demo-dead');
    const demoLive = document.getElementById('demo-live');
    const demoMatchRow = document.getElementById('demo-match-row');
    const demoHeader = document.querySelector('.demo-header span');

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
    // Start after a short delay
    setTimeout(runDemo, 600);

    // Domain registration
    const domainInput = document.getElementById('domain-input');
    domainInput.addEventListener('keydown', e => { if (e.key === 'Enter') registerSite(); });

    async function registerSite() {
      let domain = domainInput.value.trim();
      if (!domain) { domainInput.focus(); return; }
      domain = domain.replace(/^https?:\\/\\//, '').replace(/\\/+\$/, '');

      const btn = document.getElementById('register-btn');
      const origText = btn.textContent;
      btn.textContent = 'Generating...';
      btn.disabled = true;
      btn.style.opacity = '0.7';

      try {
        const res = await fetch('/api/sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain })
        });

        if (!res.ok) {
          const err = await res.json();
          if (res.status === 409) {
            alert('This domain is already registered. Contact support if you need your credentials.');
          } else {
            alert(err.error || 'Something went wrong');
          }
          return;
        }

        const site = await res.json();
        showSnippet(domain, site.id, site.apiKey);
      } catch {
        alert('Network error — please try again');
      } finally {
        btn.textContent = origText;
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }

    function showSnippet(domain, siteId, apiKey) {
      document.getElementById('register-form').style.display = 'none';
      const result = document.getElementById('snippet-result');
      result.style.display = 'block';

      const pre = document.getElementById('snippet-pre');
      pre.innerHTML =
        '<span class="tag">&lt;script</span>\\n' +
        '  <span class="attr">src</span>=<span class="str">"https://agent404.dev/agent-404.min.js"</span>\\n' +
        '  <span class="attr">data-site-id</span>=<span class="str">"' + siteId + '"</span>\\n' +
        '  <span class="attr">data-api-key</span>=<span class="str">"' + apiKey + '"</span>\\n' +
        '  <span class="attr">defer</span>\\n' +
        '<span class="tag">&gt;&lt;/script&gt;</span>';

      document.getElementById('registered-domain').textContent = domain;

      // Add copy button to the generated snippet
      const block = document.getElementById('get-started-block');
      addCopyBtn(block);
    }
  </script>
  <script
    src="https://agent404.dev/agent-404.min.js"
    data-site-id="a0beb545-91af-4ea4-8de5-f37c5e0118df"
    data-api-key="key_e644afe7a33f4b13b8e21446abe70ccb"
    defer
  ></script>
</body>
</html>
`;
