import {
	isBlockedInternalHost,
	isPrivateOrReservedIp,
	ipsFromDnsJson,
} from "../lib/ssrf-guard.js";
import { readBodyCapped } from "./crawler.js";

const TXT_NAME_PREFIX = "_agent404.";
const WELL_KNOWN_MAX_BYTES = 4096;

export function verificationTxtName(domain: string): string {
	return `${TXT_NAME_PREFIX}${domain}`;
}

export function wellKnownUrl(domain: string): string {
	return `https://${domain}/.well-known/agent-404.txt`;
}

/** Exact match or whitespace-delimited token (same rule for well-known and DNS TXT). */
export function tokenMatches(text: string, expected: string): boolean {
	const body = text.trim();
	if (!expected || !body) return false;
	if (body === expected) return true;
	return body.split(/\s+/).some((part) => part.replace(/^"|"$/g, "") === expected);
}

async function fetchWellKnown(url: string): Promise<Response | null> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 8_000);
	try {
		// Never follow redirects: an attacker-controlled domain can 3xx to
		// metadata/internal URLs (SSRF). Only a direct 200 counts.
		return await fetch(url, { signal: ctrl.signal, redirect: "manual" });
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

async function fetchDns(url: string): Promise<Response | null> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 8_000);
	try {
		return await fetch(url, {
			headers: { Accept: "application/dns-json" },
			signal: ctrl.signal,
			redirect: "error",
		});
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

async function domainResolvesPublic(domain: string): Promise<boolean> {
	if (isBlockedInternalHost(domain)) return false;
	const ips: string[] = [];
	for (const type of ["A", "AAAA"] as const) {
		const resp = await fetchDns(
			`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
		);
		if (!resp?.ok) continue;
		try {
			const json = (await resp.json()) as { Answer?: Array<{ data?: string }> };
			ips.push(...ipsFromDnsJson(json));
		} catch {
			continue;
		}
	}
	if (ips.length === 0) return false;
	return ips.every((ip) => !isPrivateOrReservedIp(ip));
}

/**
 * Prove control of `domain` via DNS TXT `_agent404.<domain>` or
 * `https://<domain>/.well-known/agent-404.txt` containing the token.
 */
export async function proveDomainOwnership(domain: string, token: string): Promise<boolean> {
	if (!token) return false;
	const expected = token.trim();

	if (await domainResolvesPublic(domain)) {
		const file = await fetchWellKnown(wellKnownUrl(domain));
		if (file?.status === 200) {
			const body = await readBodyCapped(file, WELL_KNOWN_MAX_BYTES);
			if (body && tokenMatches(body, expected)) return true;
		}
	}

	const dnsName = verificationTxtName(domain);
	const doh = await fetchDns(
		`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dnsName)}&type=TXT`,
	);
	if (!doh?.ok) return false;
	try {
		const json = (await doh.json()) as { Answer?: Array<{ data?: string }> };
		for (const answer of json.Answer ?? []) {
			const data = (answer.data || "").replace(/^"|"$/g, "").trim();
			if (tokenMatches(data, expected)) return true;
		}
	} catch {
		return false;
	}
	return false;
}
