/** Hostnames and IPs that must never be fetched as ownership-proof targets. */

const BLOCKED_HOST_EXACT = new Set(["localhost", "localhost.localdomain", "0.0.0.0", "metadata.google.internal"]);

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".arpa", ".invalid"];

export function isBlockedInternalHost(hostname: string): boolean {
	const lower = hostname.toLowerCase().replace(/\.$/, "");
	if (!lower) return true;
	if (BLOCKED_HOST_EXACT.has(lower)) return true;
	if (BLOCKED_HOST_SUFFIXES.some((s) => lower.endsWith(s))) return true;
	if (lower.startsWith("[")) return true;
	return isPrivateOrReservedIp(lower);
}

export function isPrivateOrReservedIp(ip: string): boolean {
	const raw = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
	const mapped = raw.startsWith("::ffff:") ? raw.slice(7) : raw;

	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mapped)) {
		const parts = mapped.split(".").map((n) => Number(n));
		if (parts.some((n) => n > 255)) return true;
		const [a, b] = parts;
		if (a === 0 || a === 10 || a === 127) return true;
		if (a === 169 && b === 254) return true;
		if (a === 192 && b === 168) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 100 && b >= 64 && b <= 127) return true;
		if (a === 198 && (b === 18 || b === 19)) return true;
		if (a >= 224) return true;
		return false;
	}

	if (raw.includes(":")) {
		if (raw === "::1" || raw === "::" || raw === "0:0:0:0:0:0:0:1") return true;
		if (raw.startsWith("fe80:") || raw.startsWith("fc") || raw.startsWith("fd")) return true;
	}
	return false;
}

export function ipsFromDnsJson(json: { Answer?: Array<{ data?: string; type?: number }> }): string[] {
	const ips: string[] = [];
	for (const answer of json.Answer ?? []) {
		const data = (answer.data || "").trim();
		if (!data) continue;
		if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(data) || data.includes(":")) ips.push(data);
	}
	return ips;
}
