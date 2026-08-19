/**
 * OTP persistence for the embedded sign-in flow.
 *
 * Codes are stored SHA-256 hashed (never plaintext) with a short TTL. The
 * store is Postgres-backed so pending codes survive serverless cold starts.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../config.js";

export interface PendingOtp {
	codeHash: string;
	expiresAt: Date;
	attempts: number;
}

export interface OtpStore {
	saveOtp(email: string, codeHash: string, expiresAt: Date): Promise<void>;
	getOtp(email: string): Promise<PendingOtp | null>;
	incrementAttempts(email: string): Promise<number>;
	deleteOtp(email: string): Promise<void>;
}

type Sql = NeonQueryFunction<false, true>;

export class PostgresOtpStore implements OtpStore {
	private sql: Sql;

	constructor(databaseUrl?: string) {
		this.sql = neon(databaseUrl || getDatabaseUrl(), { fullResults: true });
	}

	async saveOtp(email: string, codeHash: string, expiresAt: Date): Promise<void> {
		await this.sql`
			INSERT INTO login_otp (email, code_hash, expires_at)
			VALUES (${email}, ${codeHash}, ${expiresAt})
			ON CONFLICT (email) DO UPDATE SET
				code_hash = EXCLUDED.code_hash,
				attempts = 0,
				expires_at = EXCLUDED.expires_at,
				created_at = now()
		`;
	}

	async getOtp(email: string): Promise<PendingOtp | null> {
		const { rows } = await this.sql`
			SELECT code_hash, expires_at, attempts
			FROM login_otp
			WHERE email = ${email}
		`;
		const row = rows[0] as
			| { code_hash: string; expires_at: Date | string; attempts: number }
			| undefined;
		if (!row) return null;
		return {
			codeHash: row.code_hash,
			expiresAt: new Date(row.expires_at),
			attempts: Number(row.attempts),
		};
	}

	async incrementAttempts(email: string): Promise<number> {
		const { rows } = await this.sql`
			UPDATE login_otp
			SET attempts = attempts + 1
			WHERE email = ${email}
			RETURNING attempts
		`;
		const row = rows[0] as { attempts: number } | undefined;
		return row ? Number(row.attempts) : 0;
	}

	async deleteOtp(email: string): Promise<void> {
		await this.sql`DELETE FROM login_otp WHERE email = ${email}`;
	}
}

/** In-memory store for tests. */
export class MemoryOtpStore implements OtpStore {
	private map = new Map<
		string,
		{ codeHash: string; expiresAt: Date; attempts: number }
	>();

	async saveOtp(email: string, codeHash: string, expiresAt: Date): Promise<void> {
		this.map.set(email, { codeHash, expiresAt, attempts: 0 });
	}
	async getOtp(email: string): Promise<PendingOtp | null> {
		const v = this.map.get(email);
		return v ? { ...v } : null;
	}
	async incrementAttempts(email: string): Promise<number> {
		const v = this.map.get(email);
		if (!v) return 0;
		v.attempts += 1;
		return v.attempts;
	}
	async deleteOtp(email: string): Promise<void> {
		this.map.delete(email);
	}
}