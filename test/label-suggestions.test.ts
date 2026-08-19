import { describe, expect, it } from "vitest";
import { parseLabelAnswer, topSuggestedUrl } from "../scripts/label-suggestions.js";

describe("label-suggestions CLI helpers (BAT-63)", () => {
	describe("topSuggestedUrl", () => {
		it("returns the first URL from a JSON array", () => {
			expect(topSuggestedUrl('["/docs/a", "/docs/b"]')).toBe("/docs/a");
		});

		it("returns null for an empty array", () => {
			expect(topSuggestedUrl("[]")).toBeNull();
		});

		it("returns null for invalid JSON", () => {
			expect(topSuggestedUrl("not json")).toBeNull();
		});

		it("returns null for empty/undefined input", () => {
			expect(topSuggestedUrl("")).toBeNull();
		});
	});

	describe("parseLabelAnswer", () => {
		it("accepts y/yes/correct as correct", () => {
			expect(parseLabelAnswer("y")).toBe("correct");
			expect(parseLabelAnswer("Y")).toBe("correct");
			expect(parseLabelAnswer("yes")).toBe("correct");
			expect(parseLabelAnswer("correct")).toBe("correct");
		});

		it("accepts n/no/incorrect as incorrect", () => {
			expect(parseLabelAnswer("n")).toBe("incorrect");
			expect(parseLabelAnswer("no")).toBe("incorrect");
			expect(parseLabelAnswer("incorrect")).toBe("incorrect");
		});

		it("treats s/skip/empty as skip", () => {
			expect(parseLabelAnswer("s")).toBe("skip");
			expect(parseLabelAnswer("skip")).toBe("skip");
			expect(parseLabelAnswer("")).toBe("skip");
			expect(parseLabelAnswer("   ")).toBe("skip");
		});

		it("treats q/quit as quit", () => {
			expect(parseLabelAnswer("q")).toBe("quit");
			expect(parseLabelAnswer("quit")).toBe("quit");
		});

		it("returns null for unrecognized input", () => {
			expect(parseLabelAnswer("maybe")).toBeNull();
		});
	});
});
