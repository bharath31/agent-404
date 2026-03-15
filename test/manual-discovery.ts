import app from "../src/index.js";

async function test(domain: string, path: string, searchFor: string) {
	let url = `/api/demo/sitemap?domain=${encodeURIComponent(domain)}`;
	if (path) url += `&path=${encodeURIComponent(path)}`;
	const res = await app.request(url);
	const data = (await res.json()) as any;
	console.log(`\n=== ${domain}${path} ===`);
	console.log(`source: ${data.source}`);
	console.log(`pages: ${data.pages?.length}`);
	console.log(`error: ${data.error || "none"}`);

	// Search for target page
	const found = data.pages?.filter((p: any) => p.url.toLowerCase().includes(searchFor.toLowerCase()));
	if (found?.length > 0) {
		console.log(`FOUND target "${searchFor}":`);
		for (const p of found.slice(0, 5)) {
			console.log(`  ${p.url} — ${p.title}`);
		}
	} else {
		console.log(`TARGET "${searchFor}" NOT FOUND in ${data.pages?.length} pages`);
		// Show pages that are closest (contain partial match)
		const partial = data.pages?.filter((p: any) => {
			const u = p.url.toLowerCase();
			return searchFor.split("/").some((s: string) => s.length > 3 && u.includes(s));
		}).slice(0, 5);
		if (partial?.length > 0) {
			console.log("Partial matches:");
			for (const p of partial) {
				console.log(`  ${p.url} — ${p.title}`);
			}
		}
	}
}

async function main() {
	await test("developers.cloudflare.com", "/work/", "workers");
	await test("www.twilio.com", "/docs/message", "messaging");
	await test("vercel.com", "/docs/deploy", "deploy-hooks");
}

main().catch(console.error);
