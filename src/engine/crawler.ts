import { isBlockedInternalHost } from "../lib/ssrf-guard.js";

export const DEFAULT_USER_AGENT =
	"Mozilla/5.0 (compatible; agent-404-bot/1.0; +https://agent-404.vercel.app)";
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

export interface SafeFetchOptions {
	timeoutMs?: number;
	maxBytes?: number;
	userAgent?: string;
	accept?: string;
	redirect?: RequestRedirect;
	signal?: AbortSignal;
}

export interface SafeFetchResult {
	ok: boolean;
	status: number;
	text: string | null;
	finalUrl: string;
	contentType: string;
	blockedReason?: string;
}

/**
 * Read response body up to maxBytes. Returns null if body exceeds limit.
 * Streams data when ReadableStream is available to avoid buffering large payloads in memory.
 */
export async function readBodyCapped(resp: Response, maxBytes: number): Promise<string | null> {
	if (resp.body && typeof resp.body.getReader === "function") {
		const reader = resp.body.getReader();
		const chunks: Uint8Array[] = [];
		let totalSize = 0;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				totalSize += value.byteLength;
				if (totalSize > maxBytes) {
					reader.cancel();
					return null;
				}
				chunks.push(value);
			}
		} catch {
			return null;
		}
		const decoder = new TextDecoder();
		return chunks.map((c) => decoder.decode(c, { stream: true })).join("") + decoder.decode();
	}
	const text = await resp.text();
	return text.length > maxBytes ? null : text;
}

/**
 * Perform a safe HTTP fetch protected against SSRF, hanging connections, and oversized responses.
 */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
	const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
	const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		return {
			ok: false,
			status: 0,
			text: null,
			finalUrl: url,
			contentType: "",
			blockedReason: "Invalid URL",
		};
	}

	if (isBlockedInternalHost(parsedUrl.hostname)) {
		return {
			ok: false,
			status: 0,
			text: null,
			finalUrl: url,
			contentType: "",
			blockedReason: "Blocked internal host (SSRF protection)",
		};
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const resp = await fetch(url, {
			headers: {
				"User-Agent": opts.userAgent ?? DEFAULT_USER_AGENT,
				...(opts.accept ? { Accept: opts.accept } : {}),
			},
			signal: opts.signal ?? controller.signal,
			redirect: opts.redirect ?? "follow",
		});

		const finalUrl = resp.url || url;
		const contentType = resp.headers.get("content-type") || "";
		const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);

		if (contentLength > maxBytes) {
			return { ok: false, status: resp.status, text: null, finalUrl, contentType };
		}

		const text = await readBodyCapped(resp, maxBytes);
		return {
			ok: resp.ok,
			status: resp.status,
			text,
			finalUrl,
			contentType,
		};
	} catch (err: any) {
		return {
			ok: false,
			status: 0,
			text: null,
			finalUrl: url,
			contentType: "",
			blockedReason: err?.message || "Network error",
		};
	} finally {
		clearTimeout(timeout);
	}
}
