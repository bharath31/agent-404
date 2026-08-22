import { NextRequest, NextResponse } from "next/server";
import { getDatabaseUrl } from "./config";
import { readAuth0Config } from "./auth/config";
import {
	readSessionCookie,
	rollSessionCookie,
	sessionCookieString,
} from "./auth/otp";

function databaseBacked(pathname: string): boolean {
	if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return true;
	if (pathname.startsWith("/report/")) return true;
	if (!pathname.startsWith("/api/")) return false;
	return !(
		pathname === "/api/health" ||
		pathname === "/api/demo/sitemap" ||
		pathname === "/api/funnel/install-cta"
	);
}

function unavailable(request: NextRequest): NextResponse {
	if (request.nextUrl.pathname.startsWith("/api/")) {
		const response = NextResponse.json({ error: "Service is not configured" }, { status: 503 });
		const origin = request.headers.get("origin") || "*";
		response.headers.set("Access-Control-Allow-Origin", origin);
		response.headers.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
		response.headers.set("Access-Control-Allow-Headers", "Content-Type,x-api-key,Authorization");
		response.headers.set("Access-Control-Max-Age", "86400");
		if (origin !== "*") response.headers.append("Vary", "Origin");
		return response;
	}
	return new NextResponse(
		"<!doctype html><html><head><title>Service unavailable</title></head><body><main><h1>Service unavailable</h1><p>The dashboard is temporarily unavailable. Please try again shortly.</p></main></body></html>",
		{ status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
	);
}

export function proxy(request: NextRequest): NextResponse {
	const pathname = request.nextUrl.pathname;
	// Preflights remain available even while backing services are degraded.
	if (request.method === "OPTIONS") return NextResponse.next();
	if (databaseBacked(pathname) && !getDatabaseUrl()) return unavailable(request);

	if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/")) {
		return NextResponse.next();
	}

	const config = readAuth0Config();
	if (!config) return unavailable(request);
	const parsed = readSessionCookie(request, config.sessionSecret);
	if (!parsed) {
		const loginUrl = request.nextUrl.clone();
		loginUrl.pathname = "/auth/login";
		loginUrl.search = "";
		loginUrl.searchParams.set("return_to", `${pathname}${request.nextUrl.search}`);
		return NextResponse.redirect(loginUrl, 302);
	}

	const forwardedHeaders = new Headers(request.headers);
	forwardedHeaders.set("x-next-pathname", pathname);
	const response = NextResponse.next({ request: { headers: forwardedHeaders } });
	if (parsed.roll) {
		const rolled = rollSessionCookie(parsed.claims, config.sessionSecret);
		if (rolled) response.headers.append("Set-Cookie", sessionCookieString(rolled.value, rolled.maxAge));
	}
	return response;
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
