import { cache } from "react";
import { requireOwner } from "@/lib/auth/session";
import { getStorage } from "@/lib/http/storage";

export const getDashboardContext = cache(async () => {
	const owner = await requireOwner();
	const storage = getStorage();
	if (!storage) return { owner, storage: null, sites: [], unavailable: true as const };

	try {
		const sites = await storage.listSiteSummaries(owner.sub);
		return { owner, storage, sites, unavailable: false as const };
	} catch (error) {
		console.error("Dashboard portfolio load failed", error);
		return { owner, storage: null, sites: [], unavailable: true as const };
	}
});

export function dashboardDomain(raw: string): string {
	try {
		return decodeURIComponent(raw).trim().toLowerCase();
	} catch {
		return raw.trim().toLowerCase();
	}
}
