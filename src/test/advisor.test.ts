import { describe, expect, it } from "vitest";
import { Advisor, type AdvisorDeps } from "../advisor/advisor.js";
import { isN2KSource } from "../advisor/busSource.js";
import { buildLiveInventory } from "../advisor/inventory.js";
import { recommend } from "../advisor/recommender.js";
import type { ConversionMetadata } from "../api/types.js";
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

function meta(key: string, paths: string[]): ConversionMetadata {
	return {
		key,
		title: key,
		pgns: [],
		category: "navigation",
		presets: [],
		paths,
		extras: { type: "none" },
	};
}

describe("recommend", () => {
	it("recommends enabling a disabled conversion fed by a native source", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.depth.belowTransducer",
					live: true,
					liveSources: ["depth.0"],
				},
			],
			metadata: [meta("DEPTH", ["navigation.depth.belowTransducer"])],
			currentConfig: {},
		});
		const depth = recs.find((r) => r.optionKey === "DEPTH");
		expect(depth?.action).toBe("enable");
		expect(depth?.confidence).toBe("high");
		expect(depth?.matchedPaths).toEqual(["navigation.depth.belowTransducer"]);
	});

	it("recommends disabling an enabled conversion whose data is already on the bus", () => {
		const recs = recommend({
			inventory: [
				{ path: "navigation.position", live: true, liveSources: ["can0.35"] },
			],
			metadata: [meta("GPS", ["navigation.position"])],
			currentConfig: {
				GPS: { enabled: true, resend: 0, sources: {}, extras: {} },
			},
		});
		expect(recs.find((r) => r.optionKey === "GPS")?.action).toBe("disable");
	});

	it("keeps an already-enabled conversion fed by a native source", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.depth.belowTransducer",
					live: true,
					liveSources: ["depth.0"],
				},
			],
			metadata: [meta("DEPTH", ["navigation.depth.belowTransducer"])],
			currentConfig: {
				DEPTH: { enabled: true, resend: 0, sources: {}, extras: {} },
			},
		});
		expect(recs.find((r) => r.optionKey === "DEPTH")?.action).toBe("keep");
	});

	it("skips conversions with no declared paths and unmatched conversions", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.depth.belowTransducer",
					live: true,
					liveSources: ["depth.0"],
				},
			],
			metadata: [
				meta("BATTERY", []),
				meta("WIND", ["environment.wind.speedApparent"]),
			],
			currentConfig: {},
		});
		expect(recs).toEqual([]);
	});
});

interface TestDeps extends AdvisorDeps {
	getSaved: () => Record<string, unknown> | null;
}

function advisorDeps(overrides: Partial<AdvisorDeps> = {}): TestDeps {
	let saved: Record<string, unknown> | null = null;
	const base: AdvisorDeps = {
		buildInventory: () => [
			{
				path: "navigation.depth.belowTransducer",
				live: true,
				liveSources: ["depth.0"],
			},
		],
		getMetadata: () => [meta("DEPTH", ["navigation.depth.belowTransducer"])],
		readConfig: () => ({ conversions: {} }),
		writeConfig: (cfg) => {
			saved = cfg;
		},
		now: () => new Date("2026-05-16T10:00:00Z"),
		...overrides,
	};
	return { ...base, getSaved: () => saved };
}

describe("Advisor.runReview", () => {
	it("auto-applies a confident enable and writes config", async () => {
		const deps = advisorDeps();
		const result = await new Advisor(deps).runReview();
		expect(result.autoApplied.map((r) => r.optionKey)).toEqual(["DEPTH"]);
		expect(result.pending).toEqual([]);
		const saved = deps.getSaved() as {
			conversions: Record<string, { enabled: boolean }>;
		};
		expect(saved.conversions.DEPTH.enabled).toBe(true);
	});

	it("parks a disable as pending and does not write it", async () => {
		const deps = advisorDeps({
			buildInventory: () => [
				{ path: "navigation.position", live: true, liveSources: ["can0.9"] },
			],
			getMetadata: () => [meta("GPS", ["navigation.position"])],
			readConfig: () => ({
				conversions: {
					GPS: { enabled: true, resend: 0, sources: {}, extras: {} },
				},
			}),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.pending.map((r) => r.optionKey)).toEqual(["GPS"]);
		expect(result.autoApplied).toEqual([]);
	});
});

describe("Advisor.applyReview", () => {
	it("applies approved disables and ignores rejected ones", async () => {
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {
					GPS: { enabled: true, resend: 0, sources: {}, extras: {} },
					AIS: { enabled: true, resend: 0, sources: {}, extras: {} },
				},
			}),
		});
		await new Advisor(deps).applyReview([
			{ optionKey: "GPS", approved: true },
			{ optionKey: "AIS", approved: false },
		]);
		const saved = deps.getSaved() as {
			conversions: Record<string, { enabled: boolean }>;
		};
		expect(saved.conversions.GPS.enabled).toBe(false);
		expect(saved.conversions.AIS.enabled).toBe(true);
	});
});
