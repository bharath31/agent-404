import type { AgentCategory, InstallProbe, InstallProbeVerdict } from "../types";

/**
 * Server-renderable dashboard DTOs. These types intentionally do not contain
 * the secret write key (or a previous key) so they are safe to pass through a
 * React Server Component payload.
 */
export type SitePortfolioStatus = "live" | "warning" | "unverified";

export interface SiteSummary {
	id: string;
	domain: string;
	status: SitePortfolioStatus;
	verified: boolean;
	pageCount: number;
	suggestions30d: number;
	recoveryRate30d: number | null;
	lastActivityAt: string | null;
	createdAt: string;
}

export interface RecoverySeriesPoint {
	date: string;
	suggestions: number;
	recovered: number;
	recoveryRate: number | null;
}

export type ActivityRange = "24h" | "7d" | "30d";
export type ActivityAgentFilter = AgentCategory | "all";
export type ActivityOutcomeFilter = "all" | "recovered" | "unrecovered";

export interface ActivityItem {
	id: string;
	deadUrl: string;
	suggestedUrls: string[];
	agentCategory: AgentCategory;
	userAgent: string;
	createdAt: string;
	recovered: boolean;
	recoveredUrl: string | null;
	recoveryLatencyMs: number | null;
}

export interface ActivityPage {
	items: ActivityItem[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface IndexedPageItem {
	id: number;
	url: string;
	title: string;
	description: string;
	lastSeenAt: string;
}

export interface IndexedPagePage {
	items: IndexedPageItem[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface SiteOverview {
	site: {
		id: string;
		domain: string;
		verified: boolean;
		createdAt: string;
	};
	status: SitePortfolioStatus;
	metrics: {
		indexedPages: number;
		suggestions30d: number;
		recovered30d: number;
		recoveryRate30d: number | null;
		medianRecoveryLatencyMs30d: number | null;
		lastActivityAt: string | null;
	};
	recoverySeries: RecoverySeriesPoint[];
	recentActivity: ActivityItem[];
	latestProbe: InstallProbe | null;
	recommendedAction: {
		id: "verify" | "index" | "probe" | "repair" | "generate-traffic" | "review";
		title: string;
		description: string;
		href: string;
	};
}

export interface SiteInstallation {
	site: {
		id: string;
		domain: string;
		verified: boolean;
		publicKey: string;
		createdAt: string;
	};
	pageCount: number;
	lastIndexedAt: string | null;
	reindexRequestedAt: string | null;
	latestProbe: InstallProbe | null;
	verification: {
		dnsTxt: { name: string; value: string };
		wellKnown: { url: string; body: string };
	};
}

export interface SiteSettings {
	site: {
		id: string;
		domain: string;
		verified: boolean;
		publicKey: string;
		createdAt: string;
	};
	rotation: {
		secretOverlapExpiresAt: string | null;
		publicOverlapExpiresAt: string | null;
	};
}

export type SiteKeyKind = "secret" | "public";

/** Returned only from the explicit key-rotation mutation. */
export interface KeyRotationResult {
	siteId: string;
	kind: SiteKeyKind;
	key: string;
	previousKeyExpiresAt: string;
	rotatedAt: string;
}

export type RotateSiteKeyOutcome =
	| { ok: true; result: KeyRotationResult }
	| { ok: false; reason: "not_found" }
	| { ok: false; reason: "overlap_active"; retryAt: string };

export interface ActivityPageOptions {
	range?: ActivityRange;
	agent?: ActivityAgentFilter;
	outcome?: ActivityOutcomeFilter;
	query?: string;
	cursor?: string | null;
	limit?: number;
}

export interface IndexedPagePageOptions {
	query?: string;
	cursor?: string | null;
	limit?: number;
}

export interface TimestampIdCursor {
	timestamp: string;
	id: number;
}

export class InvalidDashboardCursorError extends Error {
	constructor() {
		super("Invalid pagination cursor");
		this.name = "InvalidDashboardCursorError";
	}
}

export function encodeDashboardCursor(cursor: TimestampIdCursor): string {
	return Buffer.from(JSON.stringify([cursor.timestamp, cursor.id]), "utf8").toString("base64url");
}

export function decodeDashboardCursor(cursor: string): TimestampIdCursor {
	try {
		const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
		if (!Array.isArray(decoded) || decoded.length !== 2) throw new Error("shape");
		const [timestamp, id] = decoded;
		if (
			typeof timestamp !== "string" ||
			!Number.isFinite(Date.parse(timestamp)) ||
			typeof id !== "number" ||
			!Number.isSafeInteger(id) ||
			id < 0
		) {
			throw new Error("values");
		}
		return { timestamp, id };
	} catch {
		throw new InvalidDashboardCursorError();
	}
}

export function dashboardSiteStatus(input: {
	verified: boolean;
	pageCount: number;
	probeVerdict: InstallProbeVerdict | null;
}): SitePortfolioStatus {
	if (!input.verified) return "unverified";
	if (input.pageCount < 1 || input.probeVerdict !== "recovered_404") return "warning";
	return "live";
}
