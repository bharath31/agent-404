import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
	const response = NextResponse.next();

	// Check if this route is a 404 or custom condition
	// For edge rewriting, you can call Agent 404 suggest API
	const apiKey = process.env.NEXT_PUBLIC_AGENT404_KEY;
	if (!apiKey) return response;

	return response;
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except for the ones starting with:
		 * - api (API routes)
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 */
		"/((?!api|_next/static|_next/image|favicon.ico).*)",
	],
};
