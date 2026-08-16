const DOMAIN_REGEX =
	/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/** Strip protocol/path and validate. Returns null if invalid. */
export function normalizeDomain(raw: string): string | null {
	const domain = raw.replace(/^https?:\/\//, "").replace(/\/+$/, "").trim();
	if (!domain || domain.length > 253 || !DOMAIN_REGEX.test(domain)) {
		return null;
	}
	return domain;
}
