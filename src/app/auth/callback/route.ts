/** Legacy Auth0-hosted sessions intentionally reauthenticate through the
 * branded app-owned OTP flow after the Next.js cutover. */
export function GET(request: Request): Response {
	const returnTo = new URL(request.url).searchParams.get("returnTo") || "/dashboard";
	return Response.redirect(new URL(`/auth/login?return_to=${encodeURIComponent(returnTo)}`, request.url), 302);
}
