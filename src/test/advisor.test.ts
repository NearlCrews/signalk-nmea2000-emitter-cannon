import { describe, expect, it } from "vitest";
import { Advisor, type AdvisorDeps } from "../advisor/advisor.js";
import { buildLiveInventory, mergeHistoric } from "../advisor/inventory.js";
import { fetchHistoricPaths, QuestDBClient } from "../advisor/questdb.js";
import type { ConversionMetadata } from "../api/types.js";
import { DEFAULT_ADVISOR_CONFIG } from "../config/enums.js";
import {
	classifySourceOrigin,
	isN2KSource,
	SOURCE_ORIGIN,
	sourceMatchesFilter,
} from "../recommendation/busSource.js";
import { recommend } from "../recommendation/recommender.js";
import type { ApplyDecision } from "../recommendation/types.js";
import type { SignalKApp } from "../types/index.js";

describe("isN2KSource", () => {
	const sourceMetadata = {
		can0: { type: "NMEA2000" },
		"n2k-on-ve.can-socket": { type: "NMEA2000" },
		ttyUSB0: { type: "NMEA2000" },
		actisense: { type: "NMEA2000" },
		"n2k-1": { type: "NMEA2000" },
	};

	it("flags numeric-address and CAN-name refs with NMEA 2000 source metadata", () => {
		expect(isN2KSource("can0.123", sourceMetadata)).toBe(true);
		expect(isN2KSource("can0.0123456789abcdef", sourceMetadata)).toBe(true);
		expect(isN2KSource("n2k-on-ve.can-socket.45", sourceMetadata)).toBe(true);
	});
	it("uses metadata rather than the connection id spelling", () => {
		expect(isN2KSource("ttyUSB0.115", sourceMetadata)).toBe(true);
		expect(isN2KSource("actisense.15", sourceMetadata)).toBe(true);
		expect(isN2KSource("n2k-1.42", sourceMetadata)).toBe(true);
	});
	it("flags the plugin's own echo guard label", () => {
		expect(isN2KSource("NMEA2000")).toBe(true);
	});
	it("treats non-N2K sources as native", () => {
		const metadata = {
			gps1: { type: "plugin" },
			"signalk-virtual-weather-sensors": { type: "plugin" },
			ttyUSB0: { type: "NMEA0183" },
		};
		expect(isN2KSource("gps1", metadata)).toBe(false);
		expect(isN2KSource("signalk-virtual-weather-sensors", metadata)).toBe(false);
		expect(isN2KSource("ttyUSB0.GP", metadata)).toBe(false);
		expect(isN2KSource("")).toBe(false);
	});

	it("does not infer NMEA 2000 from a Venus numeric suffix", () => {
		const source = "venus.com.victronenergy.temperature.24";
		expect(classifySourceOrigin(source)).toBe(SOURCE_ORIGIN.UNKNOWN);
		expect(
			classifySourceOrigin(source, undefined, {
				"venus.com.victronenergy.temperature": { type: "plugin" },
			}),
		).toBe(SOURCE_ORIGIN.NON_NMEA2000);
		expect(isN2KSource(source)).toBe(false);
	});

	it("prefers structured delta source types over stale server metadata", () => {
		expect(
			classifySourceOrigin("can0.42", { type: "plugin" }, { can0: { type: "NMEA2000" } }),
		).toBe(SOURCE_ORIGIN.NON_NMEA2000);
	});

	it("recognizes structured NMEA 2000 identity when type is omitted", () => {
		expect(classifySourceOrigin("can0.42", { src: "42", pgn: 128267 })).toBe(
			SOURCE_ORIGIN.NMEA2000,
		);
		expect(classifySourceOrigin("can0.device", { canName: "0123456789abcdef" })).toBe(
			SOURCE_ORIGIN.NMEA2000,
		);
	});
});

describe("sourceMatchesFilter", () => {
	it("matches exact sources and dot-boundary prefixes", () => {
		expect(sourceMatchesFilter("gps1", "gps1")).toBe(true);
		expect(sourceMatchesFilter("gps1.0", "gps1")).toBe(true);
		expect(sourceMatchesFilter("gps1.device.0", "gps1")).toBe(true);
	});

	it("does not match partial labels or empty filters", () => {
		expect(sourceMatchesFilter("gps10.0", "gps1")).toBe(false);
		expect(sourceMatchesFilter("gps1", "gps1.0")).toBe(false);
		expect(sourceMatchesFilter("gps1", "")).toBe(false);
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
			p === "navigation.depth.belowTransducer" ? { $source: "depth.0" } : { $source: "can0.35" },
		getPath: (p: string) =>
			p === "sources" ? { depth: { type: "plugin" }, can0: { type: "NMEA2000" } } : undefined,
	} as unknown as SignalKApp;
}

describe("buildLiveInventory", () => {
	it("returns one entry per active path with its live sources", () => {
		const inv = buildLiveInventory(inventoryApp());
		expect(inv).toHaveLength(2);
		const depth = inv.find((e) => e.path === "navigation.depth.belowTransducer");
		expect(depth?.live).toBe(true);
		expect(depth?.liveSources).toEqual(["depth.0"]);
		expect(depth).toMatchObject({
			sourceOrigins: { "depth.0": SOURCE_ORIGIN.NON_NMEA2000 },
		});
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
		canResend: true,
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
					liveSources: ["depthSounder"],
					sourceOrigins: { depthSounder: SOURCE_ORIGIN.NON_NMEA2000 },
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
				{
					path: "navigation.position",
					live: true,
					liveSources: ["can0.35"],
					sourceOrigins: { "can0.35": SOURCE_ORIGIN.NMEA2000 },
				},
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
					liveSources: ["depthSounder"],
					sourceOrigins: { depthSounder: SOURCE_ORIGIN.NON_NMEA2000 },
				},
			],
			metadata: [meta("DEPTH", ["navigation.depth.belowTransducer"])],
			currentConfig: {
				DEPTH: { enabled: true, resend: 0, sources: {}, extras: {} },
			},
		});
		expect(recs.find((r) => r.optionKey === "DEPTH")?.action).toBe("keep");
	});

	it("never auto-enables a disabled legacy compatibility conversion", () => {
		const legacy = {
			...meta("SEA_TEMP", ["environment.water.temperature"]),
			legacy: {
				supersededBy: "PGN 130316",
				note: "For older receivers only.",
			},
		};
		const recs = recommend({
			inventory: [
				{
					path: "environment.water.temperature",
					live: true,
					liveSources: ["waterSensor"],
					sourceOrigins: { waterSensor: SOURCE_ORIGIN.NON_NMEA2000 },
				},
			],
			metadata: [legacy],
			currentConfig: {},
		});

		expect(recs).toEqual([
			expect.objectContaining({
				optionKey: "SEA_TEMP",
				action: "keep",
				currentlyEnabled: false,
			}),
		]);
		expect(recs[0]?.reason).toContain("Enable this legacy PGN manually");
		expect(recs[0]?.reason).toContain("requires it");
		expect(recs[0]?.reason).toContain("prefer PGN 130316 otherwise");
	});

	it("skips conversions with no declared paths and unmatched conversions", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.depth.belowTransducer",
					live: true,
					liveSources: ["depthSounder"],
				},
			],
			metadata: [meta("BATTERY", []), meta("WIND", ["environment.wind.speedApparent"])],
			currentConfig: {},
		});
		expect(recs).toEqual([]);
	});

	it("flags an enabled conversion whose source pin no longer matches a live source", () => {
		const recs = recommend({
			inventory: [
				{
					path: "environment.outside.pressure",
					live: true,
					liveSources: ["vws-merged"],
				},
			],
			metadata: [meta("PRESSURE", ["environment.outside.pressure"])],
			currentConfig: {
				PRESSURE: {
					enabled: true,
					resend: 0,
					sources: { "environment.outside.pressure": "open-meteo" },
					extras: {},
				},
			},
		});
		const r = recs.find((x) => x.optionKey === "PRESSURE");
		expect(r?.action).toBe("clear-source");
		expect(r?.staleSources).toEqual([
			{
				path: "environment.outside.pressure",
				pinned: "open-meteo",
				liveSources: ["vws-merged"],
			},
		]);
	});

	it("keeps an enabled conversion whose source pin still matches a live source", () => {
		const recs = recommend({
			inventory: [
				{
					path: "environment.outside.pressure",
					live: true,
					liveSources: ["vws-merged"],
				},
			],
			metadata: [meta("PRESSURE", ["environment.outside.pressure"])],
			currentConfig: {
				PRESSURE: {
					enabled: true,
					resend: 0,
					sources: { "environment.outside.pressure": "vws-merged" },
					extras: {},
				},
			},
		});
		expect(recs.find((x) => x.optionKey === "PRESSURE")?.action).toBe("keep");
	});

	it("keeps a source pin that matches a dot-boundary publisher prefix", () => {
		const recs = recommend({
			inventory: [
				{
					path: "environment.outside.pressure",
					live: true,
					liveSources: ["vws.0"],
					sourceOrigins: { "vws.0": SOURCE_ORIGIN.NON_NMEA2000 },
				},
			],
			metadata: [meta("PRESSURE", ["environment.outside.pressure"])],
			currentConfig: {
				PRESSURE: {
					enabled: true,
					resend: 0,
					sources: { "environment.outside.pressure": "vws" },
					extras: {},
				},
			},
		});
		expect(recs.find((x) => x.optionKey === "PRESSURE")?.action).toBe("keep");
	});

	it("flags a partial-label source pin as stale", () => {
		const recs = recommend({
			inventory: [
				{
					path: "environment.outside.pressure",
					live: true,
					liveSources: ["gps10.0"],
					sourceOrigins: { "gps10.0": SOURCE_ORIGIN.NON_NMEA2000 },
				},
			],
			metadata: [meta("PRESSURE", ["environment.outside.pressure"])],
			currentConfig: {
				PRESSURE: {
					enabled: true,
					resend: 0,
					sources: { "environment.outside.pressure": "gps1" },
					extras: {},
				},
			},
		});
		expect(recs.find((x) => x.optionKey === "PRESSURE")?.action).toBe("clear-source");
	});

	it("flags a dead-but-historic source pin as a low-confidence stale-source fix", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.speedThroughWater",
					live: false,
					liveSources: [],
					historic: { samples: 5, lastSeen: "2026-06-20T00:00:00Z" },
				},
			],
			metadata: [meta("SPEED", ["navigation.speedThroughWater"])],
			currentConfig: {
				SPEED: {
					enabled: true,
					resend: 0,
					sources: { "navigation.speedThroughWater": "ghost" },
					extras: {},
				},
			},
		});
		const r = recs.find((x) => x.optionKey === "SPEED");
		expect(r?.action).toBe("clear-source");
		expect(r?.confidence).toBe("low");
		expect(r?.origin).toBe("historic");
		expect(r?.staleSources).toEqual([
			{
				path: "navigation.speedThroughWater",
				pinned: "ghost",
				liveSources: [],
			},
		]);
		expect(r?.reason).toContain("last seen 2026-06-20T00:00:00Z");
	});

	it("does not flag a dead source pin without QuestDB history", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.speedThroughWater",
					live: false,
					liveSources: [],
				},
			],
			metadata: [meta("SPEED", ["navigation.speedThroughWater"])],
			currentConfig: {
				SPEED: {
					enabled: true,
					resend: 0,
					sources: { "navigation.speedThroughWater": "ghost" },
					extras: {},
				},
			},
		});
		expect(recs.find((x) => x.optionKey === "SPEED")?.action).toBe("keep");
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
				liveSources: ["depthSounder"],
				sourceOrigins: { depthSounder: SOURCE_ORIGIN.NON_NMEA2000 },
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
		expect(saved.conversions.DEPTH?.enabled).toBe(true);
	});

	it("parks a disable as pending and does not write it", async () => {
		const deps = advisorDeps({
			buildInventory: () => [
				{
					path: "navigation.position",
					live: true,
					liveSources: ["can0.9"],
					sourceOrigins: { "can0.9": SOURCE_ORIGIN.NMEA2000 },
				},
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

	it("parks enables as pending and writes nothing when autoApply is off", async () => {
		const deps = advisorDeps({
			readConfig: () => ({ advisor: { autoApply: false }, conversions: {} }),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.autoApplied).toEqual([]);
		expect(result.pending.map((r) => r.optionKey)).toEqual(["DEPTH"]);
		expect(deps.getSaved()).toBeNull();
	});

	it("parks a stale-source fix as pending and never auto-applies it", async () => {
		const deps = advisorDeps({
			buildInventory: () => [
				{
					path: "environment.outside.pressure",
					live: true,
					liveSources: ["vws-merged"],
				},
			],
			getMetadata: () => [meta("PRESSURE", ["environment.outside.pressure"])],
			readConfig: () => ({
				conversions: {
					PRESSURE: {
						enabled: true,
						resend: 0,
						sources: { "environment.outside.pressure": "open-meteo" },
						extras: {},
					},
				},
			}),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.autoApplied).toEqual([]);
		expect(result.pending.map((r) => r.optionKey)).toEqual(["PRESSURE"]);
		expect(result.pending[0]?.action).toBe("clear-source");
		expect(deps.getSaved()).toBeNull();
	});
});

describe("Advisor.applyReview", () => {
	it("applies approved disables and ignores rejected ones", async () => {
		const deps = advisorDeps({
			// applyReview allow-lists optionKey against getMetadata(), so the
			// acted-on conversions must be present in the loaded metadata.
			getMetadata: () => [
				meta("GPS", ["navigation.position"]),
				meta("AIS", ["navigation.position"]),
			],
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
		expect(saved.conversions.GPS?.enabled).toBe(false);
		expect(saved.conversions.AIS?.enabled).toBe(true);
	});

	it("clears the named source pins on an approved clear-source decision", async () => {
		const deps = advisorDeps({
			getMetadata: () => [
				meta("SEA_TEMP", ["environment.water.temperature", "environment.outside.temperature"]),
			],
			readConfig: () => ({
				conversions: {
					SEA_TEMP: {
						enabled: true,
						resend: 0,
						sources: {
							"environment.water.temperature": "stale-id",
							"environment.outside.temperature": "open-meteo",
						},
						extras: {},
					},
				},
			}),
		});
		await new Advisor(deps).applyReview([
			{
				optionKey: "SEA_TEMP",
				approved: true,
				action: "clear-source",
				clearSourcePaths: ["environment.water.temperature", "environment.outside.temperature"],
			},
		]);
		const saved = deps.getSaved() as {
			conversions: Record<string, { sources: Record<string, string> }>;
		};
		expect(saved.conversions.SEA_TEMP?.sources).toEqual({});
	});

	it("clears only the named path pins on a clear-source decision, leaving others", async () => {
		const deps = advisorDeps({
			getMetadata: () => [
				meta("SEA_TEMP", ["environment.water.temperature", "environment.outside.temperature"]),
			],
			readConfig: () => ({
				conversions: {
					SEA_TEMP: {
						enabled: true,
						resend: 0,
						sources: {
							"environment.water.temperature": "keep-me",
							"environment.outside.temperature": "open-meteo",
						},
						extras: {},
					},
				},
			}),
		});
		await new Advisor(deps).applyReview([
			{
				optionKey: "SEA_TEMP",
				approved: true,
				action: "clear-source",
				clearSourcePaths: ["environment.outside.temperature"],
			},
		]);
		const saved = deps.getSaved() as {
			conversions: Record<string, { sources: Record<string, string> }>;
		};
		expect(saved.conversions.SEA_TEMP?.sources).toEqual({
			"environment.water.temperature": "keep-me",
		});
	});

	it("applies an approved enable when the decision carries action enable", async () => {
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {
					DEPTH: { enabled: false, resend: 0, sources: {}, extras: {} },
				},
			}),
		});
		await new Advisor(deps).applyReview([{ optionKey: "DEPTH", approved: true, action: "enable" }]);
		const saved = deps.getSaved() as {
			conversions: Record<string, { enabled: boolean }>;
		};
		expect(saved.conversions.DEPTH?.enabled).toBe(true);
	});

	it("drops an approved decision whose optionKey is not a loaded conversion", async () => {
		// applyReview allow-lists optionKey against getMetadata(); a key naming
		// no loaded conversion is filtered out so it cannot inject a junk entry
		// into the saved config. With nothing applicable, config is never written.
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {
					DEPTH: { enabled: false, resend: 0, sources: {}, extras: {} },
				},
			}),
		});
		await new Advisor(deps).applyReview([
			{ optionKey: "TOTALLY_BOGUS", approved: true, action: "enable" },
		]);
		expect(deps.getSaved()).toBeNull();
	});

	it("tolerates null and unkeyed decision elements without throwing", async () => {
		// The apply route forwards untrusted JSON, so a null or optionKey-less
		// element must be skipped rather than crash or write an "undefined" key.
		// The one well-formed decision still applies.
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {
					DEPTH: { enabled: false, resend: 0, sources: {}, extras: {} },
				},
			}),
		});
		await expect(
			new Advisor(deps).applyReview([
				null as unknown as ApplyDecision,
				{ approved: true } as unknown as ApplyDecision,
				{ optionKey: "DEPTH", approved: true, action: "enable" },
			]),
		).resolves.toBeUndefined();
		const saved = deps.getSaved() as {
			conversions: Record<string, { enabled: boolean }>;
		};
		expect(saved.conversions.DEPTH?.enabled).toBe(true);
		expect(Object.keys(saved.conversions)).toEqual(["DEPTH"]);
	});
});

describe("QuestDBClient", () => {
	function fakeFetch(status: number, body: unknown): typeof fetch {
		return (async () =>
			({
				ok: status >= 200 && status < 300,
				status,
				json: async () => body,
			}) as Response) as typeof fetch;
	}

	it("probe returns true on a well-formed response", async () => {
		const c = new QuestDBClient({ url: "http://h:9000" }, fakeFetch(200, { dataset: [[1]] }));
		expect(await c.probe()).toBe(true);
	});

	it("probe returns false on a non-OK response", async () => {
		const c = new QuestDBClient({ url: "http://h:9000" }, fakeFetch(503, {}));
		expect(await c.probe()).toBe(false);
	});

	it("probe returns false when fetch throws", async () => {
		const throwing = (async () => {
			throw new Error("ECONNREFUSED");
		}) as typeof fetch;
		const c = new QuestDBClient({ url: "http://h:9000" }, throwing);
		expect(await c.probe()).toBe(false);
	});

	it("query returns columns and dataset", async () => {
		const c = new QuestDBClient(
			{ url: "http://h:9000" },
			fakeFetch(200, {
				columns: [{ name: "path", type: "SYMBOL" }],
				dataset: [["navigation.speedThroughWater"]],
			}),
		);
		const r = await c.query("SELECT 1");
		expect(r.dataset).toEqual([["navigation.speedThroughWater"]]);
	});

	it("query throws on a non-OK response", async () => {
		const c = new QuestDBClient({ url: "http://h:9000" }, fakeFetch(400, {}));
		await expect(c.query("bad")).rejects.toThrow("HTTP 400");
	});
});

describe("fetchHistoricPaths", () => {
	it("merges signalk, signalk_str, and signalk_position rows", async () => {
		const responses: Record<string, unknown> = {
			signalk: {
				columns: [],
				dataset: [["navigation.speedThroughWater", 1200, "2026-05-16T09:00:00.000000Z"]],
			},
			signalk_str: {
				columns: [],
				dataset: [["navigation.gnss.methodQuality", 30, "2026-05-16T08:00:00.000000Z"]],
			},
			signalk_position: {
				columns: [],
				dataset: [[900, "2026-05-16T09:30:00.000000Z"]],
			},
		};
		const fetchImpl = (async (url: string) => {
			const table = url.includes("signalk_position")
				? "signalk_position"
				: url.includes("signalk_str")
					? "signalk_str"
					: "signalk";
			return {
				ok: true,
				status: 200,
				json: async () => responses[table],
			} as Response;
		}) as typeof fetch;

		const client = new QuestDBClient({ url: "http://h:9000" }, fetchImpl);
		const paths = await fetchHistoricPaths(client, 7);
		expect(paths.get("navigation.speedThroughWater")?.samples).toBe(1200);
		expect(paths.get("navigation.gnss.methodQuality")?.samples).toBe(30);
		expect(paths.get("navigation.position")?.samples).toBe(900);
	});

	it("omits navigation.position when signalk_position has no rows", async () => {
		const fetchImpl = (async (url: string) => ({
			ok: true,
			status: 200,
			json: async () =>
				url.includes("signalk_position") ? { dataset: [[0, null]] } : { dataset: [] },
		})) as typeof fetch;
		const client = new QuestDBClient({ url: "http://h:9000" }, fetchImpl);
		const paths = await fetchHistoricPaths(client, 7);
		expect(paths.has("navigation.position")).toBe(false);
	});
});

describe("mergeHistoric", () => {
	it("annotates a live path and adds a historic-only path", () => {
		const live = [
			{
				path: "environment.wind.speedApparent",
				live: true,
				liveSources: ["wind.5"],
			},
		];
		const historic = new Map([
			["environment.wind.speedApparent", { samples: 100, lastSeen: "t1" }],
			["navigation.speedThroughWater", { samples: 50, lastSeen: "t2" }],
		]);
		const merged = mergeHistoric(live, historic);
		const wind = merged.find((e) => e.path === "environment.wind.speedApparent");
		expect(wind?.historic?.samples).toBe(100);
		const stw = merged.find((e) => e.path === "navigation.speedThroughWater");
		expect(stw?.live).toBe(false);
		expect(stw?.liveSources).toEqual([]);
		expect(stw?.historic?.samples).toBe(50);
	});
});

describe("recommend with historic paths", () => {
	it("leaves a historic-only match unchanged when its source origin is unknown", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.speedThroughWater",
					live: false,
					liveSources: [],
					historic: { samples: 50, lastSeen: "t" },
				},
			],
			metadata: [meta("SPEED", ["navigation.speedThroughWater"])],
			currentConfig: {},
		});
		const speed = recs.find((r) => r.optionKey === "SPEED");
		expect(speed?.action).toBe("keep");
		expect(speed?.origin).toBe("historic");
		expect(speed?.confidence).toBe("low");
	});
});

describe("Advisor.runReview with QuestDB", () => {
	it("does not auto-enable a historic path whose source origin is unknown", async () => {
		const deps = advisorDeps({
			buildInventory: () => [],
			getMetadata: () => [meta("SPEED", ["navigation.speedThroughWater"])],
			readConfig: () => ({
				conversions: {},
				advisor: {
					...DEFAULT_ADVISOR_CONFIG,
					questdb: { enabled: true, url: "http://h:9000", lookbackDays: 7 },
				},
			}),
			fetchHistoric: async () =>
				new Map([["navigation.speedThroughWater", { samples: 9, lastSeen: "t" }]]),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.autoApplied).toEqual([]);
	});

	it("notes a QuestDB failure and continues live-only", async () => {
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {},
				advisor: {
					...DEFAULT_ADVISOR_CONFIG,
					questdb: { enabled: true, url: "http://h:9000", lookbackDays: 7 },
				},
			}),
			fetchHistoric: async () => {
				throw new Error("ECONNREFUSED");
			},
		});
		const result = await new Advisor(deps).runReview();
		expect(result.notes.some((n) => n.includes("QuestDB"))).toBe(true);
	});
});
