import { describe, it, expect } from "vitest";
import { stemToken } from "../src/engine/stemmer.js";

describe("stemToken", () => {
	it("should strip -ing suffix", () => {
		expect(stemToken("messaging")).toBe("messag");
		expect(stemToken("running")).toBe("runn");
	});

	it("should strip -ment suffix", () => {
		expect(stemToken("deployment")).toBe("deploy");
	});

	it("should strip -ments suffix", () => {
		expect(stemToken("deployments")).toBe("deploy");
	});

	it("should strip -izations suffix", () => {
		expect(stemToken("organizations")).toBe("organize");
	});

	it("should strip -tion suffix", () => {
		expect(stemToken("configuration")).toBe("configura");
	});

	it("should strip -ers suffix", () => {
		expect(stemToken("workers")).toBe("work");
	});

	it("should strip -ies → y", () => {
		expect(stemToken("queries")).toBe("query");
	});

	it("should strip -es suffix", () => {
		expect(stemToken("classes")).toBe("class");
	});

	it("should strip -ed suffix", () => {
		expect(stemToken("deployed")).toBe("deploy");
	});

	it("should strip -er suffix", () => {
		expect(stemToken("worker")).toBe("work");
	});

	it("should strip -ly suffix", () => {
		expect(stemToken("quickly")).toBe("quick");
	});

	it("should strip -s suffix", () => {
		expect(stemToken("endpoints")).toBe("endpoint");
	});

	it("should pass through words <= 4 chars", () => {
		expect(stemToken("api")).toBe("api");
		expect(stemToken("docs")).toBe("docs");
		expect(stemToken("v3")).toBe("v3");
	});

	it("should not strip if stem would be < 3 chars", () => {
		expect(stemToken("sting")).toBe("sting");
		expect(stemToken("using")).toBe("using");
	});

	it("should handle words with no matching suffix", () => {
		expect(stemToken("deploy")).toBe("deploy");
		expect(stemToken("auth")).toBe("auth");
	});
});
