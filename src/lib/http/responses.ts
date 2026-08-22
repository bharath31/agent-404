const SECURITY_HEADERS = {
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
} as const;

export function apiHeaders(request: Request, init?: HeadersInit): Headers {
	const headers = new Headers(init);
	const origin = request.headers.get("origin") || "*";
	headers.set("Access-Control-Allow-Origin", origin);
	headers.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Content-Type,x-api-key,Authorization");
	headers.set("Access-Control-Max-Age", "86400");
	if (origin !== "*") headers.append("Vary", "Origin");
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
	return headers;
}

export function json(
	request: Request,
	body: unknown,
	status = 200,
	init?: HeadersInit,
): Response {
	const headers = apiHeaders(request, init);
	headers.set("Content-Type", "application/json; charset=utf-8");
	return new Response(JSON.stringify(body), { status, headers });
}

export function text(
	request: Request,
	body: string,
	status = 200,
	contentType = "text/plain; charset=utf-8",
	init?: HeadersInit,
): Response {
	const headers = apiHeaders(request, init);
	headers.set("Content-Type", contentType);
	return new Response(body, { status, headers });
}

export function empty(request: Request, status = 204, init?: HeadersInit): Response {
	return new Response(null, { status, headers: apiHeaders(request, init) });
}

export function options(request: Request): Response {
	return empty(request, 204);
}

export function appendVary(headers: Headers, values: string): void {
	const current = headers.get("Vary");
	const merged = new Set(
		[...(current || "").split(","), ...values.split(",")]
			.map((value) => value.trim())
			.filter(Boolean),
	);
	headers.set("Vary", [...merged].join(", "));
}

export function internalError(request: Request, error: unknown): Response {
	console.error("Unhandled route error:", error instanceof Error ? error.message : error);
	return json(request, { error: "Internal server error" }, 500);
}
