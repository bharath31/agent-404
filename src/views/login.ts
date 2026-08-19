/**
 * Branded sign-in page for the embedded passwordless flow.
 *
 * Reuses the site design system (dark, Inter + JetBrains Mono) so the login
 * experience matches the rest of agent404.dev instead of the Auth0 default
 * Universal Login card.
 *
 * Signature element: a mono HTTP status line (`GET /dashboard → 401`) — this
 * page only exists because the dashboard answered 401, so the card states
 * that in the product's own language instead of a generic "secure sign-in"
 * badge.
 *
 * Two states:
 *   - email: ask for the email address, send the one-time code
 *   - code:  show where the code went, collect the code
 */

export interface LoginPageOptions {
	state?: "email" | "code";
	/** Prefilled email (code state, or after an email-step error). */
	email?: string;
	/** In-page error message (escaped by the caller). */
	error?: string;
	/** Relative in-site redirect target after successful sign-in. */
	returnTo?: string;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function loginPageHtml(opts: LoginPageOptions): string {
	const { state = "email", email = "", error = "", returnTo = "/dashboard" } = opts;
	const safeEmail = escapeHtml(email);
	const safeError = escapeHtml(error);
	const safeReturnTo = escapeHtml(returnTo);

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in — agent-404</title>
  <meta name="description" content="Sign in to the agent-404 dashboard.">
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
      --accent-subtle: rgba(59, 130, 246, 0.14);
      --emerald: #10b981;
      --amber: #f59e0b;
      --amber-subtle: rgba(245, 158, 11, 0.14);
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
      background:
        radial-gradient(640px 320px at 50% -120px, rgba(16, 185, 129, 0.07), transparent 70%),
        var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      display: flex;
      flex-direction: column;
    }

    a { color: var(--text-secondary); text-decoration: none; transition: color 0.15s; }
    a:hover { color: var(--text); }

    /* Top bar */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.1rem 1.5rem;
    }
    .logo {
      font-family: var(--font-mono);
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .logo span { color: var(--emerald); }
    .back-link {
      font-size: 0.8rem;
      font-family: var(--font-mono);
    }

    /* Centered card */
    main {
      flex: 1;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 4rem 1.25rem 3rem;
    }
    .card {
      width: 100%;
      max-width: 400px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 2.25rem 2.25rem 2rem;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }
    @media (min-width: 640px) {
      .card { margin-top: 1.5rem; }
    }

    /* Signature: the HTTP status line that made this page necessary */
    .status-line {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-family: var(--font-mono);
      font-size: 0.72rem;
      letter-spacing: 0.01em;
      color: var(--text-muted);
      margin-bottom: 1.9rem;
      flex-wrap: wrap;
    }
    .status-line .method { color: var(--text-secondary); font-weight: 600; }
    .status-line .path { color: var(--text-secondary); }
    .status-code {
      font-weight: 600;
      color: var(--amber);
      background: var(--amber-subtle);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 4px;
      padding: 0.05rem 0.4rem;
    }
    .status-note { color: var(--text-muted); }

    h1 {
      font-size: 1.55rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      margin-bottom: 0.45rem;
    }
    .lede {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-bottom: 1.6rem;
      line-height: 1.55;
    }
    .lede code {
      font-family: var(--font-mono);
      font-size: 0.82em;
      color: var(--text);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.05em 0.35em;
      overflow-wrap: anywhere;
    }

    label {
      display: block;
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 0.4rem;
    }

    input[type="email"],
    input[type="text"] {
      width: 100%;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text);
      font-family: inherit;
      font-size: 0.95rem;
      padding: 0.7rem 0.9rem;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    input::placeholder { color: var(--text-muted); }
    input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--accent-subtle);
    }

    .code-input {
      font-family: var(--font-mono);
      font-size: 1.3rem;
      font-weight: 600;
      letter-spacing: 0.45em;
      text-indent: 0.45em;
      text-align: center;
      padding: 0.8rem 0.5rem;
    }
    @media (max-width: 380px) {
      .code-input { letter-spacing: 0.28em; text-indent: 0.28em; font-size: 1.15rem; }
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      margin-top: 1.15rem;
      padding: 0.72rem 1.15rem;
      border-radius: var(--radius-sm);
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid transparent;
      font-family: inherit;
    }
    .btn-primary {
      background: #f4f4f5;
      color: #09090b;
      border-color: #f4f4f5;
    }
    .btn-primary:hover {
      background: #ffffff;
      border-color: #ffffff;
    }
    .btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }

    .field-error {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      background: var(--rose-subtle);
      border: 1px solid rgba(244, 63, 94, 0.25);
      border-radius: var(--radius-sm);
      color: #fda4af;
      font-size: 0.8rem;
      line-height: 1.45;
      padding: 0.6rem 0.75rem;
      margin-bottom: 1rem;
    }
    .field-error::before {
      content: "!";
      flex: none;
      width: 1.05em;
      height: 1.05em;
      border-radius: 50%;
      background: rgba(244, 63, 94, 0.25);
      color: #fecdd3;
      font-family: var(--font-mono);
      font-size: 0.7rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 0.1em;
    }

    .meta {
      margin-top: 1.4rem;
      font-size: 0.78rem;
      color: var(--text-muted);
      text-align: center;
    }

    .divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 1.4rem 0 0.8rem;
      font-size: 0.68rem;
      font-family: var(--font-mono);
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .divider::before,
    .divider::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--border-subtle);
    }
    .switch-form { text-align: center; }
    .switch-form button {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 0.8rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-sm);
    }
    .switch-form button:hover { color: var(--text); background: var(--surface-elevated); }
    .switch-form a { font-size: 0.8rem; }

    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; }
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <a href="/" class="logo">agent<span>-</span>404</a>
    <a href="/" class="back-link">&larr; back to site</a>
  </div>

  <main>
    <div class="card">
      <div class="status-line">
        <span class="method">GET</span>
        <span class="path">/dashboard</span>
        <span class="status-code">401</span>
        <span class="status-note">${state === "email" ? "sign-in required" : "code required"}</span>
      </div>

      ${
		state === "email"
			? `
      <h1>Welcome back</h1>
      <p class="lede">Sign in to your dashboard with a one-time code sent to your email.</p>
      ${error ? `<div class="field-error" role="alert">${safeError}</div>` : ""}
      <form method="POST" action="/auth/login/code">
        <input type="hidden" name="return_to" value="${safeReturnTo}">
        <label for="email">Email address</label>
        <input type="email" id="email" name="email" value="${safeEmail}" placeholder="you@example.com" autocomplete="email" required autofocus>
        <button type="submit" class="btn btn-primary">Send code</button>
      </form>
      <p class="meta">First time here? We&rsquo;ll create your account automatically.</p>`
			: `
      <h1>Enter your code</h1>
      <p class="lede">We sent a one-time code to <code>${safeEmail}</code>. It expires in 5 minutes.</p>
      ${error ? `<div class="field-error" role="alert">${safeError}</div>` : ""}
      <form method="POST" action="/auth/login/verify">
        <input type="hidden" name="email" value="${safeEmail}">
        <input type="hidden" name="return_to" value="${safeReturnTo}">
        <label for="code">One-time code</label>
        <input type="text" id="code" name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" autocapitalize="off" placeholder="000000" maxlength="8" pattern="[0-9\\s-]*" required autofocus>
        <button type="submit" class="btn btn-primary">Sign in</button>
      </form>
      <div class="divider">didn&rsquo;t get it?</div>
      <form method="POST" action="/auth/login/resend" class="switch-form">
        <input type="hidden" name="email" value="${safeEmail}">
        <input type="hidden" name="return_to" value="${safeReturnTo}">
        <button type="submit" id="resend-btn">Resend code</button>
        <span style="color:var(--text-muted);font-size:0.72rem"> &middot; or </span>
        <a href="/auth/login?return_to=${encodeURIComponent(returnTo)}">use a different email</a>
      </form>`
      }
    </div>
  </main>

  <script>
    (function () {
      var resend = document.getElementById("resend-btn");
      if (resend) {
        resend.disabled = true;
        var seconds = 30;
        var timer = setInterval(function () {
          seconds -= 1;
          if (seconds <= 0) {
            clearInterval(timer);
            resend.disabled = false;
            resend.textContent = "Resend code";
          } else {
            resend.textContent = "Resend code (" + seconds + "s)";
          }
        }, 1000);
      }
    })();
  </script>
</body>
</html>`;
}