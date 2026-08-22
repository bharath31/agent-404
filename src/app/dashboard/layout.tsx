import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDashboardContext } from "@/components/dashboard/server-context";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
	const context = await getDashboardContext();
	return <DashboardShell
		sites={context.sites.map((site) => ({ id: site.id, domain: site.domain, state: site.status }))}
		viewerEmail={context.owner.email ?? null}
	>{children}</DashboardShell>;
}
