import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
	const apiKey = process.env.NEXT_PUBLIC_AGENT404_KEY;
	if (!apiKey) return NextResponse.next();

	// In production, you can import { agent404 } from "@agent-404/next";
	// Or query the Agent 404 suggest endpoint directly for 404 paths.
	return NextResponse.next();
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
