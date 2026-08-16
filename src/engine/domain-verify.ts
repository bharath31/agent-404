const TXT_NAME_PREFIX = "_agent404.";

export function verificationTxtName(domain: string): string {
	return `${TXT_NAME_PREFIX}${domain}`;
}

export function wellKnownUrl(domain: string): string {
	return `https://${domain}/.well-known/agent-404.txt`;
}

async function fetchWithTimeout(url: string, headers?: Record<string, string>): Promise<Response | null> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 8_000);
	try {
		return await fetch(url, { headers, signal: ctrl.signal, redirect: "follow" });
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

/**
 * Prove control of `domain` via DNS TXT `_agent404.<domain>` or
 * `https://<domain>/.well-known/agent-404.txt` containing the token.
 */
export async function proveDomainOwnership(domain: string, token: string): Promise<boolean> {
	if (!token) return false;
	const expected = token.trim();

	const file = await fetchWithTimeout(wellKnownUrl(domain));
	if (file?.ok) {
		const body = (await file.text()).trim();
		if (body === expected || body.split(/\s+/).includes(expected)) return true;
	}

	const dnsName = verificationTxtName(domain);
	const doh = await fetchWithTimeout(
		`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dnsName)}&type=TXT`,
		{ Accept: "application/dns-json" },
	);
	if (!doh?.ok) return false;
	try {
		const json = (await doh.json()) as { Answer?: Array<{ data?: string }> };
		for (const answer of json.Answer ?? []) {
			const data = (answer.data || "").replace(/^"|"$/g, "").trim();
			if (data === expected || data.includes(expected)) return true;
		}
	} catch {
		return false;
	}
	return false;
}
