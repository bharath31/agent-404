import React from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";

export type LoginViewOptions = {
	state?: "email" | "code";
	email?: string;
	error?: string;
	returnTo?: string;
	unavailable?: boolean;
};

const styles = String.raw`
*{box-sizing:border-box}html{color-scheme:light dark}body{margin:0;min-height:100vh;background:#fafafa;color:#111;font-family:Geist,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.shell{min-height:100vh;display:grid;grid-template-rows:auto 1fr}.top{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;border-bottom:1px solid #eaeaea;background:#fff}.brand{color:inherit;text-decoration:none;font:600 14px/1 Geist Mono,ui-monospace,monospace;letter-spacing:-.03em}.brand b{color:#1fa971}.back{color:#666;text-decoration:none;font-size:13px}.back:hover{color:#111}.main{display:grid;place-items:start center;padding:clamp(48px,10vh,112px) 20px}.card{width:min(100%,420px);border:1px solid #eaeaea;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.025)}.trace{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #eaeaea}.trace span{height:3px;background:#eaeaea}.trace span:first-child,.trace span:nth-child(2){background:#1fa971}.content{padding:34px}.eyebrow{margin:0 0 16px;color:#1fa971;font:600 11px/1 Geist Mono,ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}h1{margin:0;color:#111;font-size:24px;line-height:1.25;letter-spacing:-.035em}p{margin:8px 0 0;color:#666;font-size:14px;line-height:1.6}.destination{overflow-wrap:anywhere;font-family:Geist Mono,ui-monospace,monospace;color:#111}.form{display:grid;gap:14px;margin-top:26px}.field{display:grid;gap:7px}label{color:#333;font-size:13px;font-weight:500}input{width:100%;height:42px;border:1px solid #d9d9d9;border-radius:7px;background:#fff;color:#111;padding:0 12px;font:400 14px/1.2 inherit;outline:0}input::placeholder{color:#8f8f8f}input:focus-visible{border-color:#111;box-shadow:0 0 0 3px rgba(31,169,113,.16)}.code{font-family:Geist Mono,ui-monospace,monospace;font-size:20px;letter-spacing:.3em;text-align:center;font-variant-numeric:tabular-nums}.button{height:42px;border:1px solid #111;border-radius:7px;background:#111;color:#fff;font:550 14px/1 inherit;cursor:pointer}.button:hover{background:#333}.button:focus-visible,.linkButton:focus-visible,a:focus-visible{outline:2px solid #1fa971;outline-offset:3px}.error{margin:18px 0 0;border:1px solid #f1b9b9;border-radius:7px;background:#fff8f8;color:#b42318;padding:10px 12px;font-size:13px;line-height:1.45}.secondary{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:18px;padding-top:18px;border-top:1px solid #eaeaea}.linkButton{border:0;background:transparent;color:#666;padding:0;font:500 13px/1 inherit;cursor:pointer}.linkButton:hover{color:#111}.security{color:#8f8f8f;font:400 11px/1.5 Geist Mono,ui-monospace,monospace}.hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:520px){.top{padding:0 16px}.main{padding:28px 14px}.content{padding:26px 22px}.secondary{align-items:flex-start;flex-direction:column}}@media(prefers-reduced-motion:no-preference){.button,.back,.linkButton{transition:background-color .15s,color .15s}}@media(prefers-color-scheme:dark){body{background:#000;color:#ededed}.top,.card{background:#0a0a0a;border-color:#2a2a2a}.brand,h1,.destination{color:#ededed}.back,p{color:#8f8f8f}.back:hover{color:#ededed}.trace{border-color:#2a2a2a}.trace span{background:#2a2a2a}.trace span:first-child,.trace span:nth-child(2){background:#45d699}.eyebrow{color:#45d699}label{color:#cfcfcf}input{border-color:#2a2a2a;background:#000;color:#ededed}input:focus-visible{border-color:#8f8f8f;box-shadow:0 0 0 3px rgba(69,214,153,.16)}.button{border-color:#ededed;background:#ededed;color:#111}.button:hover{background:#fff}.error{border-color:#632b2b;background:#1c1010;color:#ffb4ab}.secondary{border-color:#2a2a2a}.linkButton{color:#8f8f8f}.linkButton:hover{color:#ededed}.button:focus-visible,.linkButton:focus-visible,a:focus-visible{outline-color:#45d699}}
`;

function LoginDocument({ state = "email", email = "", error = "", returnTo = "/dashboard", unavailable = false }: LoginViewOptions) {
	const codeState = state === "code";
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="color-scheme" content="light dark" />
				<title>Sign in — agent-404</title>
				<meta name="description" content="Sign in to the agent-404 dashboard." />
				<style>{styles}</style>
			</head>
			<body>
				<div className="shell">
					<header className="top">
						<a className="brand" href="/" aria-label="agent-404 home">agent-<b>404</b></a>
						<a className="back" href="/">Back to home</a>
					</header>
					<main className="main">
						<section className="card" aria-labelledby="login-title">
							<div className="trace" aria-hidden="true"><span /><span /><span /><span /></div>
							<div className="content">
								<p className="eyebrow">Owner authentication</p>
								<h1 id="login-title">{unavailable ? "Sign-in unavailable" : codeState ? "Check your inbox" : "Sign in to your dashboard"}</h1>
								<p>{unavailable
									? "Authentication is not configured for this deployment."
									: codeState
										? <>Enter the one-time code sent to <span className="destination">{email}</span>.</>
										: "We’ll email a short-lived code. No password required."}</p>
								{error ? <div className="error" role="alert">{error}</div> : null}
								{!unavailable && !codeState ? (
									<form className="form" method="post" action="/auth/login/code">
										<input type="hidden" name="return_to" defaultValue={returnTo} />
										<div className="field">
											<label htmlFor="email">Email address</label>
											<input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={email || undefined} placeholder="you@company.com" required autoFocus />
										</div>
										<button className="button" type="submit">Send sign-in code</button>
									</form>
								) : null}
								{!unavailable && codeState ? (
									<>
										<form className="form" method="post" action="/auth/login/verify">
											<input type="hidden" name="email" defaultValue={email} />
											<input type="hidden" name="return_to" defaultValue={returnTo} />
											<div className="field">
												<label htmlFor="code">One-time code</label>
												<input className="code" id="code" name="code" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]{4,10}" maxLength={8} required autoFocus aria-describedby="code-help" />
												<span className="hidden" id="code-help">Enter the digits from your sign-in email.</span>
											</div>
											<button className="button" type="submit">Continue</button>
										</form>
										<div className="secondary">
											<form method="post" action="/auth/login/resend">
												<input type="hidden" name="email" defaultValue={email} />
												<input type="hidden" name="return_to" defaultValue={returnTo} />
												<button className="linkButton" type="submit">Send another code</button>
											</form>
											<a className="linkButton" href={`/auth/login?return_to=${encodeURIComponent(returnTo)}`}>Use another email</a>
										</div>
									</>
								) : null}
								<p className="security">14-day idle session · 30-day absolute limit</p>
							</div>
						</section>
					</main>
				</div>
			</body>
		</html>
	);
}

export function renderLoginPage(options: LoginViewOptions): string {
	return `<!doctype html>${renderToStaticMarkup(<LoginDocument {...options} />)}`;
}
