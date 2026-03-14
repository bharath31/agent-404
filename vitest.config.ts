import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/matcher.test.ts"],
	},
});
