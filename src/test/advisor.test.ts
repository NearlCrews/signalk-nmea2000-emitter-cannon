import { describe, expect, it } from "vitest";
import { isN2KSource } from "../advisor/busSource.js";
import { buildLiveInventory } from "../advisor/inventory.js";
import type { SignalKApp } from "../types/index.js";

describe("isN2KSource", () => {
	it("flags canboatjs-style N2K source labels", () => {
		expect(isN2KSource("can0.123")).toBe(true);
		expect(isN2KSource("n2k-on-ve.can-socket.45")).toBe(true);
	});
	it("flags the plugin's own echo guard label", () => {
		expect(isN2KSource("NMEA2000")).toBe(true);
	});
	it("treats non-N2K sources as native", () => {
		expect(isN2KSource("gps1")).toBe(false);
		expect(isN2KSource("signalk-virtual-weather-sensors")).toBe(false);
		expect(isN2KSource("")).toBe(false);
	});
});

function inventoryApp(): SignalKApp {
	return {
		streambundle: {
			getAvailablePaths: () => [
				"navigation.depth.belowTransducer",
				"environment.wind.speedApparent",
			],
		},
		getSelfPath: (p: string) =>
			p === "navigation.depth.belowTransducer"
				? { $source: "depth.0" }
				: { $source: "can0.35" },
	} as unknown as SignalKApp;
}

describe("buildLiveInventory", () => {
	it("returns one entry per active path with its live sources", () => {
		const inv = buildLiveInventory(inventoryApp());
		expect(inv).toHaveLength(2);
		const depth = inv.find(
			(e) => e.path === "navigation.depth.belowTransducer",
		);
		expect(depth?.live).toBe(true);
		expect(depth?.liveSources).toEqual(["depth.0"]);
	});
	it("returns an empty inventory when no paths are active", () => {
		const empty = {
			streambundle: { getAvailablePaths: () => [] },
		} as unknown as SignalKApp;
		expect(buildLiveInventory(empty)).toEqual([]);
	});
});
