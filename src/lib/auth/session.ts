import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { readAuth0Config } from "../../auth/config";
import { readSessionCookie } from "../../auth/otp";

export type OwnerSession = {
	sub: string;
	email?: string;
	name?: string;
};

/** Read the app-owned OTP session in a Server Component or Server Action. */
export async function getOwnerSession(): Promise<OwnerSession | null> {
	const config = readAuth0Config();
	if (!config) return null;
	const cookieStore = await cookies();
	const parsed = readSessionCookie(cookieStore, config.sessionSecret);
	if (!parsed) return null;
	return {
		sub: parsed.claims.sub,
		email: parsed.claims.email,
		name: parsed.claims.name,
	};
}

/** Require an owner for an RSC. The login route owns controlled config errors. */
export async function requireOwner(): Promise<OwnerSession> {
	const session = await getOwnerSession();
	if (session) return session;
	const requestHeaders = await headers();
	const pathname = requestHeaders.get("x-next-pathname") || "/dashboard";
	redirect(`/auth/login?return_to=${encodeURIComponent(pathname)}`);
}
