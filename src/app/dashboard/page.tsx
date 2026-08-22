import { AddSiteButton } from "@/components/dashboard/site-switcher";
import { SitesPortfolio } from "@/components/dashboard/sites-portfolio";
import { getDashboardContext } from "@/components/dashboard/server-context";
import { DashboardUnavailable, PageIntro } from "@/components/dashboard/ui";

export default async function DashboardPage() {
	const context = await getDashboardContext();
	if (context.unavailable) return <DashboardUnavailable />;

	return <>
		<PageIntro eyebrow="Account portfolio" title="All Sites" description="One recovery surface for every domain you operate." actions={<AddSiteButton />} />
		<SitesPortfolio sites={context.sites} />
	</>;
}
