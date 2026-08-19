import type {
	InstallProbe,
	InstallStateId,
	InstallStateView,
	InstallStepView,
} from "../types.js";

/** A probe is only meaningful evidence while it's recent. */
export const PROBE_FRESH_MS = 48 * 60 * 60 * 1000;

export interface InstallStateInput {
	verified: boolean;
	pageCount: number;
	latestProbe: Pick<InstallProbe, "probedAt" | "verdict" | "status"> | null;
	/** 404s where a suggestion was served, trailing 30 days. */
	fourOhFoursLast30d: number;
	recovery: { total: number; recovered: number; rate: number };
	now?: Date;
}

function probeAgeMs(probe: Pick<InstallProbe, "probedAt" | "status">, now: Date): number {
	return now.getTime() - new Date(probe.probedAt).getTime();
}

function fmt(n: number): string {
	return n.toLocaleString("en-US");
}

/**
 * Derive the owner-facing lifecycle state for one site.
 *
 * This is the dashboard's answer to "is this working?" — pure data in,
 * display data out, so it is unit-testable without rendering. The verdict
 * ordering matters:
 *
 * 1. Unverified sites can't index or serve — everything downstream is moot.
 * 2. Verified sites with no pages are mid-onboarding (sitemap crawl).
 * 3. A *fresh* probe is the strongest evidence we have about the install
 *    itself (it's a live HTTP exchange, not telemetry) — it wins over the
 *    404/recovery stats, which only exist once traffic arrives.
 * 4. Without a fresh probe, the 404 + recovery stats tell the story, and
 *    "install untested" is the honest state when we have no evidence at all.
 */
export function deriveInstallState(input: InstallStateInput): InstallStateView {
	const now = input.now ?? new Date();
	const { verified, pageCount, latestProbe, fourOhFoursLast30d, recovery } = input;
	const probeFresh =
		latestProbe !== null && probeAgeMs(latestProbe, now) <= PROBE_FRESH_MS;
	const probe = probeFresh ? latestProbe : null;

	let stateId: InstallStateId;
	let badge: string;
	let badgeTone: InstallStateView["badgeTone"];
	let statusLine: string;

	if (!verified) {
		stateId = "unverified";
		badge = "Verify domain";
		badgeTone = "warning";
		statusLine =
			"Verify domain ownership to start indexing — until then agent-404 can't crawl your sitemap or serve suggestions.";
	} else if (pageCount === 0) {
		stateId = "indexing";
		badge = "Indexing";
		badgeTone = "neutral";
		statusLine =
			"Domain verified. We're indexing pages from your sitemap — until pages are indexed there's nothing to recommend on a 404.";
	} else if (probe && probe.verdict === "recovered_404") {
		if (recovery.recovered > 0) {
			stateId = "recovering";
			badge = "Recovering agents";
			badgeTone = "success";
			statusLine = `Your 404s are self-healing — ${fmt(recovery.recovered)} of ${fmt(
				recovery.total,
			)} served suggestions were followed through by the agents that hit them.`;
		} else if (fourOhFoursLast30d > 0) {
			stateId = "serving";
			badge = "Serving 404s";
			badgeTone = "success";
			statusLine = `Live check passed. ${fmt(
				fourOhFoursLast30d,
			)} 404${fourOhFoursLast30d === 1 ? "" : "s"} caught in the last 30 days — we're watching which ones agents follow through on.`;
		} else {
			stateId = "install_live";
			badge = "Install live";
			badgeTone = "success";
			statusLine =
				"Live check passed — AI crawlers receive Link headers and JSON-LD on your 404s. No 404s hit yet; most sites see their first AI-crawler 404 within days.";
		}
	} else if (probe && probe.verdict === "unrecovered_404") {
		stateId = "install_broken";
		badge = "Install not detected";
		badgeTone = "danger";
		statusLine =
			"Live check failed: a dead URL on your site returned a bare 404 to ClaudeBot — no Link headers, no JSON-LD. The HTTP-layer middleware isn't running, or it isn't intercepting 404s.";
	} else if (probe && probe.verdict === "non_404") {
		stateId = "soft_404";
		badge = "Soft-404 site";
		badgeTone = "warning";
		statusLine = `Your site returns HTTP ${probe.status} for missing paths — crawlers can't tell a dead URL from a live page, and 404 middleware can't intercept it. Return a real 404 status for missing routes.`;
	} else if (probe && probe.verdict === "error") {
		stateId = "probe_failed";
		badge = "Check failed";
		badgeTone = "warning";
		statusLine =
			"The last live check couldn't reach your site (network error or timeout). Run it again once the site is reachable.";
	} else {
		stateId = "install_unknown";
		badge = "Install untested";
		badgeTone = "warning";
		statusLine =
			"Pages are indexed, but we haven't confirmed your live 404s carry recovery. Run a live check to see what AI crawlers actually receive.";
	}

	// --- Checklist -------------------------------------------------------
	const steps: InstallStepView[] = [];

	steps.push({
		id: "verify",
		label: "Verify domain",
		done: verified,
		hint: verified ? "Done" : "DNS TXT record or well-known file",
		tone: verified ? "ok" : "pending",
	});

	steps.push({
		id: "index",
		label: "Index pages",
		done: verified && pageCount > 0,
		hint: !verified
			? "After verification"
			: pageCount > 0
				? `${fmt(pageCount)} pages`
				: "Awaiting sitemap crawl",
		tone: !verified ? "pending" : pageCount > 0 ? "ok" : "pending",
	});

	if (!probeFresh) {
		steps.push({
			id: "live_check",
			label: "Live 404 check",
			done: false,
			hint: latestProbe ? "Re-check below" : "Run below",
			tone: "pending",
		});
	} else if (latestProbe!.verdict === "recovered_404") {
		steps.push({
			id: "live_check",
			label: "Live 404 check",
			done: true,
			hint: "Recovery served",
			tone: "ok",
		});
	} else if (latestProbe!.verdict === "error") {
		steps.push({
			id: "live_check",
			label: "Live 404 check",
			done: false,
			hint: "Could not reach site",
			tone: "problem",
		});
	} else {
		steps.push({
			id: "live_check",
			label: "Live 404 check",
			done: false,
			hint:
				latestProbe!.verdict === "non_404"
					? `Site returns HTTP ${latestProbe!.status}`
					: "Bare 404 returned",
			tone: "problem",
		});
	}

	steps.push({
		id: "catch_404s",
		label: "Catch 404s",
		done: fourOhFoursLast30d > 0,
		hint:
			fourOhFoursLast30d > 0
				? `${fmt(fourOhFoursLast30d)} in 30 days`
				: "Waiting for crawler traffic",
		tone: fourOhFoursLast30d > 0 ? "ok" : "pending",
	});

	steps.push({
		id: "recovery",
		label: "Agent recovery",
		done: recovery.recovered > 0,
		hint:
			recovery.total > 0
				? `${fmt(recovery.recovered)} of ${fmt(recovery.total)} followed`
				: "No suggestions served yet",
		tone: recovery.recovered > 0 ? "ok" : "pending",
	});

	return { stateId, badge, badgeTone, statusLine, steps };
}