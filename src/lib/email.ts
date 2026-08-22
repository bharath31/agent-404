/**
 * App-owned OTP email delivery via Resend.
 *
 * The tenant's Auth0 email provider/templates are NEVER involved: this app
 * generates its own one-time codes and sends them through its own Resend
 * account, so nothing in the shared Auth0 tenant changes.
 *
 * Env vars:
 *   RESEND_API_KEY  — Resend API key (sending access, domain-restricted)
 *   RESEND_FROM     — sender, e.g. "agent-404 <noreply@newsletter.bharath.sh>"
 */

import { OtpFlowError } from "../auth/otp";

export interface ResendConfig {
	apiKey: string;
	from: string;
}

export function readResendConfig(
	env: Record<string, string | undefined> | undefined,
): ResendConfig | null {
	const apiKey = (env?.RESEND_API_KEY || process.env.RESEND_API_KEY || "").trim();
	const from = (env?.RESEND_FROM || process.env.RESEND_FROM || "").trim();
	if (!apiKey || !from) return null;
	return { apiKey, from };
}

export function otpEmailHtml(code: string): string {
	return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;">
  <tr><td style="padding:40px 40px 24px 40px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:#10b981;border-radius:10px;width:44px;height:44px;text-align:center;vertical-align:middle;">
          <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:15px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">404</span>
        </td>
        <td style="padding-left:12px;vertical-align:middle;">
          <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:16px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">agent-404</span>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 40px 0 40px;">
    <h1 style="margin:0 0 10px 0;font-size:22px;line-height:1.3;color:#18181b;font-weight:700;">Here&rsquo;s your sign-in code</h1>
    <p style="margin:0;font-size:15px;line-height:1.55;color:#52525b;">Use this code to sign in to your agent-404 dashboard.</p>
  </td></tr>
  <tr><td style="padding:26px 40px 8px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;border:1px solid #e4e4e7;border-radius:12px;">
      <tr><td align="center" style="padding:22px 0;">
        <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#18181b;">${code}</span>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:14px 40px 0 40px;text-align:center;">
    <p style="margin:0;font-size:13px;color:#71717a;">This code expires in 5 minutes.</p>
  </td></tr>
  <tr><td style="padding:28px 40px 0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #e4e4e7;font-size:0;line-height:0;">&nbsp;</td></tr></table>
  </td></tr>
  <tr><td style="padding:22px 40px 40px 40px;">
    <p style="margin:0;font-size:13px;line-height:1.55;color:#71717a;">If you didn&rsquo;t request this code, you can safely ignore this email &mdash; your account stays secure.</p>
    <p style="margin:16px 0 0 0;font-size:12px;color:#a1a1aa;font-family:'SF Mono',Menlo,Consolas,monospace;">agent404.dev &middot; sent by agent-404</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function otpEmailText(code: string): string {
	return `Your agent-404 sign-in code

Use this code to sign in to your agent-404 dashboard:

  ${code}

This code expires in 5 minutes.

If you didn't request this code, you can safely ignore this email — your account stays secure.

— agent-404 (agent404.dev)`;
}

/** Send the one-time code email via Resend. Throws OtpFlowError on failure. */
export async function sendOtpEmail(
	cfg: ResendConfig,
	to: string,
	code: string,
	fetchImpl: typeof fetch = fetch,
): Promise<void> {
	let res: Response;
	try {
		res = await fetchImpl("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${cfg.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: cfg.from,
				to: [to],
				subject: "Your agent-404 sign-in code",
				html: otpEmailHtml(code),
				text: otpEmailText(code),
			}),
			signal: AbortSignal.timeout(15_000),
		});
	} catch (err) {
		console.error("[email] resend network error:", err);
		throw new OtpFlowError(
			"We couldn't email your code. Try again in a moment.",
			502,
		);
	}
	if (res.ok) return;

	const body = (await res.json().catch(() => null)) as
		| { message?: string; name?: string }
		| null;
	console.error(
		`[email] resend failed (${res.status}):`,
		body?.message || body?.name || `HTTP ${res.status}`,
	);
	throw new OtpFlowError("We couldn't email your code. Try again.", 502);
}