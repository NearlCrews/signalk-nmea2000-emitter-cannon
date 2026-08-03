import { FromPgn, pgnToActisenseSerialFormat } from "@canboat/canboatjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import createAisConversion, {
	AIS_DYNAMIC_FRESHNESS_MS,
	AIS_NAV_STATUS_BY_SIGNAL_K_STATE,
	buildAisRelevantValueIndex,
} from "../conversions/ais.js";
import type { ConversionModule, N2KMessage, SignalKApp, SignalKPlugin } from "../types/index.js";
import { withCanonicalPgnPriority } from "../utils/pgnPriorities.js";

const plugin = { id: "signalk-nmea2000-emitter-cannon" } as SignalKPlugin;

const CURRENT_SIGNAL_K_NAVIGATION_STATES = [
	["not under command", 2],
	["anchored", 1],
	["moored", 5],
	["sailing", 8],
	["motoring", 0],
	["towing < 200m", 11],
	["towing > 200m", 11],
	["pushing", 12],
	["fishing", 7],
	["fishing-hampered", 7],
	["trawling", 7],
	["trawling-shooting", 7],
	["trawling-hauling", 7],
	["pilotage", 15],
	["not-under-way", 15],
	["aground", 6],
	["restricted manouverability", 3],
	["restricted manouverability towing < 200m", 3],
	["restricted manouverability towing > 200m", 3],
	["restricted manouverability underwater operations", 3],
	["constrained by draft", 4],
	["mine clearance", 15],
	["Reserved for future amendment of Navigational Status for HSC", 9],
	["Reserved for future amendment of Navigational Status for WIG", 10],
	["Reserved for future use-11", 15],
	["Reserved for future use-12", 15],
	["Reserved for future use-13", 15],
	["Reserved for future use-14", 15],
	["not defined (example)", 15],
] as const;

const LEGACY_NAVIGATION_STATE_ALIASES = [
	["ais-sart", 14],
	["hazardous material high speed", 9],
	["hazardous material wing in ground", 10],
	["restricted maneuverability", 3],
] as const;

function appForAis(): SignalKApp {
	return {
		selfId: "urn:mrn:imo:mmsi:111222333",
		debug: Object.assign(vi.fn(), { enabled: false }),
		error: vi.fn(),
		getPath: () => ({}),
	} as unknown as SignalKApp;
}

async function invoke(conversion: ConversionModule, delta: unknown): Promise<N2KMessage[]> {
	if (!conversion.callback) throw new Error(`Missing callback for ${conversion.title}`);
	return Promise.resolve(conversion.callback(delta));
}

function decodedTimestamp(message: N2KMessage): string {
	const serial = pgnToActisenseSerialFormat(
		withCanonicalPgnPriority(message) as unknown as Parameters<
			typeof pgnToActisenseSerialFormat
		>[0],
	);
	if (!serial) throw new Error(`Canboat did not serialize PGN ${message.pgn}`);
	const parsed = new FromPgn().parseString(serial);
	if (!parsed) throw new Error(`Canboat did not decode PGN ${message.pgn}`);
	return String((parsed.fields as unknown as Record<string, unknown>).timeStamp);
}

afterEach(() => {
	vi.useRealTimers();
});

describe("AIS delta input hardening", () => {
	it.each([
		["null", null],
		["undefined", undefined],
		["a primitive", 42],
		["a missing context", {}],
		["a null context", { context: null, updates: [] }],
		[
			"an object context",
			{
				context: {
					startsWith: () => {
						throw new Error("must not be called");
					},
				},
				updates: [],
			},
		],
		["missing updates", { context: "vessels.urn:mrn:imo:mmsi:367301250" }],
		["null updates", { context: "vessels.urn:mrn:imo:mmsi:367301250", updates: null }],
		["a malformed update", { context: "vessels.urn:mrn:imo:mmsi:367301250", updates: [null] }],
	] as const)("ignores %s", async (_label, delta) => {
		const conversion = createAisConversion(appForAis(), plugin);
		expect(await invoke(conversion, delta)).toEqual([]);
	});
});

describe("AIS relevant-value indexing", () => {
	const position = { longitude: -76.39, latitude: 39.12 };
	const unrelated = Object.fromEntries(
		Array.from({ length: 5_000 }, (_, index) => [`vendor-${index}`, { nested: `unused-${index}` }]),
	);

	it("retains only bounded fields read by the generators", () => {
		const index = buildAisRelevantValueIndex([
			{
				path: "",
				value: {
					mmsi: "367301250",
					name: "N".repeat(100_000),
					navigation: {
						position: { ...position, altitude: 12, vendor: unrelated },
						vendor: unrelated,
					},
					design: {
						length: { overall: 30, name: "ignored", vendor: unrelated },
						vendor: unrelated,
					},
					vendor: unrelated,
				},
			},
			{ path: "vendor.large", value: unrelated },
			{ path: "navigation.vendor", value: unrelated },
		]);

		expect([...index.keys()].sort()).toEqual([
			"design.length",
			"mmsi",
			"name",
			"navigation.position",
		]);
		expect(index.get("navigation.position")).toEqual(position);
		expect(index.get("design.length")).toEqual({ overall: 30 });
		expect(index.get("name")).toBe("N".repeat(20));
	});

	it("preserves root merges, parent replacements, and composite-child deletions", () => {
		const baseUpdates = [
			{
				path: "",
				value: {
					mmsi: "367301250",
					navigation: {
						position,
						speedOverGround: 3.4,
						state: "motoring",
					},
					design: { length: { overall: 30 }, beam: 7 },
				},
			},
		] as const;
		const index = buildAisRelevantValueIndex([
			...baseUpdates,
			{
				path: "navigation",
				value: { position: { longitude: -75.5 } },
			},
			{ path: "navigation.position.latitude", value: 38.5 },
			{ path: "design.length.overall", value: null },
			{ path: "", value: { name: "TEST VESSEL" } },
		]);

		expect([...index.keys()].sort()).toEqual([
			"design.beam",
			"mmsi",
			"name",
			"navigation.position",
		]);
		expect(index.get("navigation.position")).toEqual({
			longitude: -75.5,
			latitude: 38.5,
		});
		expect(index.get("design.length")).toBeUndefined();
		expect(index.get("design.beam")).toBe(7);

		const parentDeleted = buildAisRelevantValueIndex([
			...baseUpdates,
			{ path: "design", value: null },
		]);
		expect(parentDeleted.has("design.length")).toBe(false);
		expect(parentDeleted.has("design.beam")).toBe(false);
		expect(parentDeleted.has("navigation.position")).toBe(true);

		const rootDeleted = buildAisRelevantValueIndex([...baseUpdates, { path: "", value: null }]);
		expect(rootDeleted.size).toBe(0);
	});

	it("produces the same messages with or without huge unrelated payloads", async () => {
		const relevantRoot = {
			mmsi: "367301250",
			sensors: { ais: { class: "A" } },
			name: "TEST VESSEL",
			navigation: { position },
			design: { length: { overall: 30 } },
		};
		const cleanConversion = createAisConversion(appForAis(), plugin);
		const noisyConversion = createAisConversion(appForAis(), plugin);
		const delta = (value: unknown) => ({
			context: "vessels.urn:mrn:imo:mmsi:367301250",
			updates: [{ values: [{ path: "", value }] }],
		});

		const cleanOutput = await invoke(cleanConversion, delta(relevantRoot));
		const noisyOutput = await invoke(
			noisyConversion,
			delta({
				...relevantRoot,
				vendor: unrelated,
				sensors: { ...relevantRoot.sensors, vendor: unrelated },
				navigation: { ...relevantRoot.navigation, vendor: unrelated },
				design: {
					length: { overall: 30, vendor: unrelated },
					vendor: unrelated,
				},
			}),
		);

		expect(noisyOutput).toEqual(cleanOutput);
		expect(noisyOutput.map(({ pgn }) => pgn)).toEqual([129038, 129794]);
	});
});

describe("AIS cached-data freshness", () => {
	it("does not revive an AtoN from stale position when static data changes", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));
		const conversion = createAisConversion(appForAis(), plugin);
		const context = "atons.urn:mrn:imo:mmsi:993672085";
		const position = { longitude: -76.4313882, latitude: 38.5783333 };

		expect(
			await invoke(conversion, {
				context,
				updates: [
					{
						values: [
							{ path: "", value: { mmsi: "993672085", name: "AtoN" } },
							{ path: "atonType", value: { id: 14 } },
							{ path: "navigation.position", value: position },
						],
					},
				],
			}),
		).toHaveLength(1);

		vi.advanceTimersByTime(AIS_DYNAMIC_FRESHNESS_MS + 1);
		expect(
			await invoke(conversion, {
				context,
				updates: [
					{
						timestamp: new Date().toISOString(),
						values: [{ path: "name", value: "Renamed AtoN" }],
					},
				],
			}),
		).toEqual([]);

		// A position carried by the current delta is an explicit new report and
		// always triggers, even when its source timestamp says the fix is old.
		expect(
			await invoke(conversion, {
				context,
				updates: [
					{
						timestamp: "2026-07-31T12:00:00.000Z",
						values: [{ path: "navigation.position", value: position }],
					},
				],
			}),
		).toMatchObject([{ pgn: 129041, fields: { longitude: position.longitude } }]);
	});

	it("omits stale vessel kinematics from a current position report", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));
		const conversion = createAisConversion(appForAis(), plugin);
		const context = "vessels.urn:mrn:imo:mmsi:367301250";

		expect(
			await invoke(conversion, {
				context,
				updates: [
					{
						timestamp: new Date().toISOString(),
						values: [
							{ path: "", value: { mmsi: "367301250" } },
							{ path: "sensors.ais.class", value: "A" },
							{ path: "navigation.courseOverGroundTrue", value: 1.2 },
							{ path: "navigation.speedOverGround", value: 3.4 },
							{ path: "navigation.headingTrue", value: 1.1 },
							{ path: "navigation.rateOfTurn", value: 0.01 },
							{ path: "navigation.state", value: "towing < 200m" },
						],
					},
				],
			}),
		).toEqual([]);

		vi.advanceTimersByTime(AIS_DYNAMIC_FRESHNESS_MS + 1);
		const output = await invoke(conversion, {
			context,
			updates: [
				{
					// Current-delta position is authoritative for triggering even when
					// the producer supplies an old, but otherwise valid, timestamp.
					timestamp: "2026-07-31T12:00:00.000Z",
					values: [
						{
							path: "navigation.position",
							value: { longitude: -76.39, latitude: 39.12 },
						},
					],
				},
			],
		});

		expect(output).toHaveLength(1);
		expect(output[0]?.fields).toMatchObject({
			longitude: -76.39,
			latitude: 39.12,
			timeStamp: 0,
			navStatus: 15,
		});
		expect(output[0]?.fields.cog).toBeUndefined();
		expect(output[0]?.fields.sog).toBeUndefined();
		expect(output[0]?.fields.heading).toBeUndefined();
		expect(output[0]?.fields.rateOfTurn).toBeUndefined();
	});
});

describe("AIS report timestamps", () => {
	it.each([
		["known", "2026-07-31T12:34:56.789Z", 56, "56"],
		["missing", undefined, 60, "Not available"],
		["invalid", "not-a-timestamp", 60, "Not available"],
		["non-UTC", "2026-07-31T08:35:00.000-04:00", 60, "Not available"],
		["untrustworthy future", "2099-01-01T00:00:42.000Z", 60, "Not available"],
	] as const)("encodes a %s update timestamp", async (_label, timestamp, raw, decoded) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-31T12:35:00.000Z"));
		const conversion = createAisConversion(appForAis(), plugin);
		const output = await invoke(conversion, {
			context: "vessels.urn:mrn:imo:mmsi:367301250",
			updates: [
				{
					...(timestamp === undefined ? {} : { timestamp }),
					values: [
						{ path: "", value: { mmsi: "367301250" } },
						{ path: "sensors.ais.class", value: "A" },
						{
							path: "navigation.position",
							value: { longitude: -76.39, latitude: 39.12 },
						},
					],
				},
			],
		});
		const message = output[0];
		if (!message) throw new Error("Missing AIS position message");
		expect(message.fields.timeStamp).toBe(raw);
		expect(decodedTimestamp(message)).toBe(decoded);
	});
});

describe("Signal K navigation.state to Canboat NAV_STATUS", () => {
	it.each(CURRENT_SIGNAL_K_NAVIGATION_STATES)("maps schema value %s to %i", (state, expected) => {
		expect(AIS_NAV_STATUS_BY_SIGNAL_K_STATE[state]).toBe(expected);
	});

	it.each(LEGACY_NAVIGATION_STATE_ALIASES)(
		"maps compatibility alias %s to %i",
		(state, expected) => {
			expect(AIS_NAV_STATUS_BY_SIGNAL_K_STATE[state]).toBe(expected);
		},
	);

	it("documents every schema value and only the explicit compatibility aliases", () => {
		expect(Object.keys(AIS_NAV_STATUS_BY_SIGNAL_K_STATE)).toEqual([
			...CURRENT_SIGNAL_K_NAVIGATION_STATES.map(([state]) => state),
			...LEGACY_NAVIGATION_STATE_ALIASES.map(([state]) => state),
		]);
	});

	it.each([
		["towing < 200m", 11],
		["pushing", 12],
		["Reserved for future amendment of Navigational Status for HSC", 9],
		["Reserved for future amendment of Navigational Status for WIG", 10],
		["vendor-specific future state", 15],
	] as const)("emits %s as NAV_STATUS %i", async (state, expected) => {
		const conversion = createAisConversion(appForAis(), plugin);
		const output = await invoke(conversion, {
			context: "vessels.urn:mrn:imo:mmsi:367301250",
			updates: [
				{
					values: [
						{ path: "", value: { mmsi: "367301250" } },
						{ path: "sensors.ais.class", value: "A" },
						{ path: "navigation.state", value: state },
						{
							path: "navigation.position",
							value: { longitude: -76.39, latitude: 39.12 },
						},
					],
				},
			],
		});
		expect(output[0]?.fields.navStatus).toBe(expected);
	});
});
