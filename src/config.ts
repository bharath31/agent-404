/** Canonical hosted origin. Apex (agent404.dev) 307-redirects to www; CORS
 *  preflights cannot follow redirects, so every public URL must use www. */
export const CANONICAL_ORIGIN = "https://www.agent404.dev";
export const CANONICAL_SCRIPT_URL = `${CANONICAL_ORIGIN}/agent-404.min.js`;

export interface AppConfig {
	databaseUrl: string;
	cronSecret?: string;
	embeddingApiKey?: string;
	embeddingApiUrl: string;
	embeddingModel: string;
	canonicalOrigin: string;
}

export function getEnvValue(
	key: string,
	env?: Record<string, unknown>,
): string {
	const fromEnv = env?.[key];
	if (typeof fromEnv === "string" && fromEnv.trim()) {
		return fromEnv.trim();
	}
	const fromProcess = typeof process !== "undefined" ? process.env?.[key] : undefined;
	if (typeof fromProcess === "string" && fromProcess.trim()) {
		return fromProcess.trim();
	}
	return "";
}

export function getDatabaseUrl(env?: Record<string, unknown>): string {
	return (
		getEnvValue("DATABASE_URL", env) ||
		getEnvValue("POSTGRES_URL", env) ||
		""
	);
}

export function getCronSecret(env?: Record<string, unknown>): string | undefined {
	const secret = getEnvValue("CRON_SECRET", env);
	return secret || undefined;
}

export function getCloudflareEmbeddingConfig(env?: Record<string, unknown>): {
	accountId: string;
	apiToken: string | undefined;
} {
	const accountId = getEnvValue("CLOUDFLARE_ACCOUNT_ID", env);
	const apiToken = getEnvValue("CLOUDFLARE_API_TOKEN", env) || undefined;
	return { accountId, apiToken };
}

export function getEmbeddingConfig(env?: Record<string, unknown>): {
	url: string;
	model: string;
	apiKey: string | undefined;
} {
	const url = getEnvValue("EMBEDDING_API_URL", env) || "https://openrouter.ai/api/v1/embeddings";
	const model = getEnvValue("EMBEDDING_MODEL", env) || "openai/text-embedding-3-small";
	const apiKey =
		getEnvValue("EMBEDDING_API_KEY", env) ||
		getEnvValue("AI_GATEWAY_API_KEY", env) ||
		getEnvValue("VERCEL_OIDC_TOKEN", env) ||
		getEnvValue("OPENAI_API_KEY", env) ||
		undefined;
	return { url, model, apiKey };
}
