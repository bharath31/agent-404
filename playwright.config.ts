import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./test",
	testMatch: ["browser.test.ts", "smoke-published.test.ts"],
	timeout: 30000,
	retries: 1,
	use: {
		headless: true,
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
});
