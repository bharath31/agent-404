import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = [
	"src/app/page.tsx",
	"src/app/demo/page.tsx",
	"src/components/dashboard/site-switcher.tsx",
	"src/components/dashboard/installation-controls.tsx",
	"src/components/dashboard/settings-controls.tsx",
];

describe("served UI has no native dialogs", () => {
	for (const file of files) {
		it(`${file} does not call alert/confirm/prompt`, () => {
			const src = readFileSync(file, "utf8");
			expect(src).not.toMatch(/\balert\s*\(/);
			expect(src).not.toMatch(/\bconfirm\s*\(/);
			expect(src).not.toMatch(/\bprompt\s*\(/);
		});
	}

	it("landing does not tell people to contact support", () => {
		const src = readFileSync("src/app/page.tsx", "utf8");
		expect(src.toLowerCase()).not.toContain("contact support");
		expect(src.toLowerCase()).not.toContain("already registered");
	});
});
