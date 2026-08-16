import { describe, expect, it } from "vitest";
import { isBlockedInternalHost, isPrivateOrReservedIp } from "../src/lib/ssrf-guard.js";

describe("ssrf-guard", () => {
	it("blocks localhost and internal suffixes", () => {
		expect(isBlockedInternalHost("localhost")).toBe(true);
		expect(isBlockedInternalHost("foo.internal")).toBe(true);
		expect(isBlockedInternalHost("metadata.google.internal")).toBe(true);
	});

	it("does not treat public hostnames as blocked", () => {
		expect(isBlockedInternalHost("facebook.com")).toBe(false);
		expect(isBlockedInternalHost("example.com")).toBe(false);
	});

	it("blocks private and link-local IPs", () => {
		expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
		expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
		expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
		expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
		expect(isPrivateOrReservedIp("::1")).toBe(true);
		expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false);
	});
});
