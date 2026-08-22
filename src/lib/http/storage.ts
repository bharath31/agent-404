import { getDatabaseUrl } from "../../config";
import { PostgresStorage } from "../../storage/postgres";

/** Per-request storage factory. Returns null so callers can render a controlled
 * 503 without leaking connection/configuration details. */
export function getStorage(): PostgresStorage | null {
	const databaseUrl = getDatabaseUrl();
	return databaseUrl ? new PostgresStorage(databaseUrl) : null;
}
