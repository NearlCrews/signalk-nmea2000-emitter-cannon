import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SOURCE_TYPE,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	N2KMessage,
	SignalKApp,
	SignalKPlugin,
} from "../types/index.js";
import {
	AIS_CALLSIGN_CHARS,
	AIS_DESTINATION_CHARS,
	AIS_NAME_CHARS,
	ATON_NAME_CHARS,
	parseMmsi,
} from "../utils/aisUtils.js";
import { clampString, isValidNumber } from "../utils/validation.js";
import type { Position } from "./routeTypes.js";

// AIS Message 1 spec value for "Not defined". canboat NAV_STATUS lookup
// stops at 14, but the AIS bitfield is 4 bits and 15 is the spec default
// for "navigation state unknown". canboatjs accepts the numeric value.
const NAV_STATUS_NOT_DEFINED = 15;

interface AisShipType {
	id?: number;
	name?: string;
}

interface Design {
	length?: { overall?: number };
	beam?: number;
	draft?: { maximum?: number };
	aisShipType?: AisShipType;
}

interface Vessel {
	name?: string;
	mmsi?: string;
	design?: Design;
	navigation?: {
		position?: Position;
		courseOverGroundTrue?: number;
		speedOverGround?: number;
		headingTrue?: number;
		rateOfTurn?: number;
		state?: string;
		destination?: { commonName?: string };
	};
	sensors?: {
		ais?: {
			fromCenter?: number;
			fromBow?: number;
		};
	};
	communication?: {
		callsignVhf?: string;
	};
	registrations?: {
		imo?: string;
	};
	atonType?: {
		id?: number;
		name?: string;
	};
}

interface AisDelta {
	context: string;
	updates: Array<{
		values: Array<{
			path: string;
			value: unknown;
		}>;
	}>;
}

const staticKeys = [
	"name",
	"design.aisShipType",
	"design.draft",
	"design.length",
	"design.beam",
	"sensors.ais.fromCenter",
	"sensors.ais.fromBow",
	"registrations.imo",
];

const positionKeys = ["navigation.position"];

// SK navigation.state strings to canboat NAV_STATUS numeric values.
// Numeric is passed straight to canboatjs: feeding the SK string would silently
// encode as 0 ("Under way using engine") since SK labels do not match the
// NAV_STATUS LOOKUP enum exactly.
const navStatusMapping: Record<string, number> = {
	"not under command": 2,
	anchored: 1,
	moored: 5,
	sailing: 8,
	motoring: 0,
	"towing < 200m": 3,
	"towing > 200m": 3,
	pushing: 3,
	fishing: 7,
	"fishing-hampered": 7,
	trawling: 7,
	"trawling-shooting": 7,
	"trawling-hauling": 7,
	"not-under-way": 2,
	aground: 6,
	"restricted manouverability": 3,
	"restricted manouverability towing < 200m": 3,
	"restricted manouverability towing > 200m": 3,
	"restricted manouverability underwater operations": 3,
	"constrained by draft": 4,
	"ais-sart": 14,
	"hazardous material high speed": 9,
	"hazardous material wing in ground": 10,
};

export default function createAisConversion(
	app: SignalKApp,
	_plugin: SignalKPlugin,
): ConversionModule<[AisDelta]> {
	// Cached on first non-null observation. `app.selfId` is configured at
	// server boot and stable for the run, but the factory may load before
	// it is populated, so memoize lazily rather than at module-init.
	let cachedSelfContext: string | null = null;

	return {
		title: "AIS (PGNs 129038, 129041, 129794)",
		sourceType: SOURCE_TYPE.ON_DELTA,
		optionKey: "AIS",
		category: "ais",
		presets: ["full-ais"],
		callback: ((delta: AisDelta) => {
			// registerDeltaInputHandler fires on every delta server-wide.
			// Cheap prefix checks first, before allocating the delta index.
			const ctx = delta.context;
			const isVessel = ctx.startsWith("vessels.");
			const isAton = ctx.startsWith("atons.");
			if (!isVessel && !isAton) {
				return [];
			}

			// A bare "vessels.self" fallback never matches real urn-form
			// contexts, so own-vessel AIS data would silently leak as a
			// remote target. Require selfId to be resolved first.
			if (cachedSelfContext === null) {
				if (!app.selfId) return [];
				cachedSelfContext = `vessels.${app.selfId}`;
			}

			if (ctx === cachedSelfContext || isN2K(delta)) {
				return [];
			}

			const index = buildDeltaIndex(delta);

			if (isVessel) {
				const hasStatic = indexHasAnyKeys(index, staticKeys);
				const hasPosition = indexHasAnyKeys(index, positionKeys);

				if (!hasStatic && !hasPosition) {
					return [];
				}

				const vessel = app.getPath(ctx) as Vessel;
				const mmsiValue = indexedFindValue<string>(index, vessel, "mmsi");

				if (!mmsiValue || typeof mmsiValue !== "string") {
					return [];
				}

				const res: N2KMessage[] = [];
				if (hasPosition) {
					const posMsg = generatePosition(vessel, mmsiValue, index);
					if (posMsg) res.push(posMsg);
				}

				if (hasStatic) {
					const staticMsg = generateStatic(vessel, mmsiValue, index);
					if (staticMsg) res.push(staticMsg);
				}
				return res;
			}

			const vessel = app.getPath(ctx) as Vessel;
			const mmsiValue = indexedFindValue(index, vessel, "mmsi");

			if (!mmsiValue || typeof mmsiValue !== "string") {
				return [];
			}

			const atonMsg = generateAtoN(vessel, mmsiValue, index);
			return atonMsg ? [atonMsg] : [];
		}) as ConversionCallback<[AisDelta]>,
		tests: [
			{
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301250",
						updates: [
							{
								values: [
									{
										path: "navigation.position",
										value: { longitude: -76.3947165, latitude: 39.1296167 },
									},
									{ path: "navigation.courseOverGroundTrue", value: 1.501 },
									{ path: "navigation.speedOverGround", value: 0.05 },
									{ path: "navigation.headingTrue", value: 5.6199 },
									{ path: "navigation.rateOfTurn", value: 0 },
									{ path: "navigation.state", value: "motoring" },
									{
										path: "navigation.destination.commonName",
										value: "BALTIMORE",
									},
									{ path: "sensors.ais.fromBow", value: 9 },
									{ path: "sensors.ais.fromCenter", value: 0 },
									{ path: "design.draft", value: { maximum: 4.2 } },
									{ path: "design.length", value: { overall: 30 } },
									{
										path: "design.aisShipType",
										value: { id: 52, name: "Tug" },
									},
									{ path: "design.beam", value: 7 },
									{ path: "", value: { mmsi: "367301250" } },
									{ path: "", value: { name: "SOME BOAT" } },
								],
							},
						],
					},
				],
				expected: [
					{
						prio: 2,
						pgn: 129038,
						dst: 255,
						fields: {
							messageId: "Scheduled Class A position report",
							repeatIndicator: "Initial",
							userId: 367301250,
							longitude: -76.3947165,
							latitude: 39.1296167,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "0",
							cog: 1.501,
							sog: 0.05,
							aisTransceiverInformation: "Channel A VDL reception",
							heading: 5.6199,
							rateOfTurn: 0,
							navStatus: "Under way using engine",
						},
					},
					{
						prio: 2,
						pgn: 129794,
						dst: 255,
						fields: {
							messageId: "Static and voyage related data",
							userId: 367301250,
							name: "SOME BOAT",
							typeOfShip: "Tug",
							length: 30,
							beam: 7,
							positionReferenceFromBow: 9,
							positionReferenceFromStarboard: 3.5,
							draft: 4.2,
							destination: "BALTIMORE",
							aisVersionIndicator: "ITU-R M.1371-1",
							dte: "Available",
							reserved: 1,
							aisTransceiverInformation: "Channel A VDL reception",
						},
					},
				],
			},
			{
				input: [
					{
						context: "atons.urn:mrn:imo:mmsi:993672085",
						updates: [
							{
								values: [
									{ path: "", value: { name: "78A" } },
									{
										path: "navigation.position",
										value: {
											longitude: -76.4313882,
											latitude: 38.5783333,
										},
									},
									{
										path: "atonType",
										value: {
											id: 14,
											name: "Beacon, Starboard Hand",
										},
									},
									{
										path: "",
										value: {
											mmsi: "993672085",
										},
									},
									{
										path: "sensors.ais.class",
										value: "ATON",
									},
								],
							},
						],
					},
				],
				expected: [
					{
						prio: 2,
						pgn: 129041,
						dst: 255,
						fields: {
							messageId: "ATON report",
							repeatIndicator: "Initial",
							userId: 993672085,
							longitude: -76.4313882,
							latitude: 38.5783333,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "0",
							atonType: "Fixed beacon: starboard hand",
							offPositionIndicator: "No",
							virtualAtonFlag: "No",
							assignedModeFlag: "Autonomous and continuous",
							spare: 1,
							atonName: "78A",
						},
					},
				],
			},
			{
				// Regression: 129041 atonType must derive from vessel.atonType.id.
				// id=24 is canboat ATON_TYPE "Floating AtoN: port hand mark"; if
				// the conversion silently reverts to a hardcoded type the round-
				// trip will decode something else and this test will catch it.
				input: [
					{
						context: "atons.urn:mrn:imo:mmsi:993672085",
						updates: [
							{
								values: [
									{ path: "", value: { name: "RED-1" } },
									{
										path: "navigation.position",
										value: {
											longitude: -76.5,
											latitude: 38.6,
										},
									},
									{
										path: "atonType",
										value: { id: 24, name: "Port hand mark" },
									},
									{
										path: "",
										value: { mmsi: "993672085" },
									},
									{ path: "sensors.ais.class", value: "ATON" },
								],
							},
						],
					},
				],
				expected: [
					{
						prio: 2,
						pgn: 129041,
						dst: 255,
						fields: {
							messageId: "ATON report",
							repeatIndicator: "Initial",
							userId: 993672085,
							longitude: -76.5,
							latitude: 38.6,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "0",
							atonType: "Floating AtoN: port hand mark",
							offPositionIndicator: "No",
							virtualAtonFlag: "No",
							assignedModeFlag: "Autonomous and continuous",
							spare: 1,
							atonName: "RED-1",
						},
					},
				],
			},
			{
				// Regression: PGN 129041 atonName is a STRING_LAU field, but
				// canboatjs's toPgn writer hardcodes an 18-character cap for
				// this specific field. The plugin pre-clamps to the same
				// width (ATON_NAME_CHARS) so the pre-encode value is the
				// authoritative source of truth; if canboatjs ever loosens
				// or removes its cap, the wire output stays bounded.
				input: [
					{
						context: "atons.urn:mrn:imo:mmsi:993672085",
						updates: [
							{
								values: [
									{
										path: "",
										value: { name: "EXCEEDINGLY LONG AID TO NAVIGATION LABEL" },
									},
									{
										path: "navigation.position",
										value: { longitude: -76.5, latitude: 38.6 },
									},
									{
										path: "atonType",
										value: { id: 14, name: "Beacon, Starboard Hand" },
									},
									{ path: "", value: { mmsi: "993672085" } },
									{ path: "sensors.ais.class", value: "ATON" },
								],
							},
						],
					},
				],
				expected: [
					{
						prio: 2,
						pgn: 129041,
						dst: 255,
						fields: {
							messageId: "ATON report",
							repeatIndicator: "Initial",
							userId: 993672085,
							longitude: -76.5,
							latitude: 38.6,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "0",
							atonType: "Fixed beacon: starboard hand",
							offPositionIndicator: "No",
							virtualAtonFlag: "No",
							assignedModeFlag: "Autonomous and continuous",
							spare: 1,
							// 18 chars from the 41-char input: the plugin's
							// clampString(ATON_NAME_CHARS) caps the value before it
							// reaches canboatjs.
							atonName: "EXCEEDINGLY LONG A",
						},
					},
				],
			},
			{
				// Regression: 129038 navStatus must respect SK navigation.state.
				// "anchored" maps to NAV_STATUS value 1 ("At anchor"); a regression
				// to the old reverse-lookup pattern would silently encode 0
				// ("Under way using engine") instead.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301250",
						updates: [
							{
								values: [
									{
										path: "navigation.position",
										value: { longitude: -76.4, latitude: 39.0 },
									},
									{ path: "navigation.state", value: "anchored" },
									{ path: "", value: { mmsi: "367301250" } },
								],
							},
						],
					},
				],
				expected: [
					{
						prio: 2,
						pgn: 129038,
						dst: 255,
						fields: {
							messageId: "Scheduled Class A position report",
							repeatIndicator: "Initial",
							userId: 367301250,
							longitude: -76.4,
							latitude: 39.0,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "0",
							aisTransceiverInformation: "Channel A VDL reception",
							navStatus: "At anchor",
						},
					},
				],
			},
			{
				// Echo loop: delta originated from the vessel's own N2K bus
				// (source.type === "NMEA2000"). Re-emitting would duplicate
				// every AIS frame on the wire. mmsi is included so that the
				// rest of the pipeline *would* succeed if the echo guard
				// weren't enforced, making this a genuine regression test.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301250",
						updates: [
							{
								source: { label: "canbus0", type: "NMEA2000" },
								values: [
									{ path: "mmsi", value: "367301250" },
									{
										path: "navigation.position",
										value: {
											longitude: -76.3947165,
											latitude: 39.1296167,
										},
									},
								],
							},
						],
					},
				],
				expected: [],
			},
			{
				// Regression: AIS strings relayed from other vessels are
				// unbounded. PGN 129794 name/callsign/destination are fixed-width
				// STRING_FIX fields; an over-long value overflows the field (and
				// the encode buffer). Clamp to the AIS spec widths.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301250",
						updates: [
							{
								values: [
									{ path: "", value: { mmsi: "367301250" } },
									{
										path: "",
										value: { name: "VERY LONG VESSEL NAME EXCEEDS LIMIT" },
									},
									{
										path: "communication.callsignVhf",
										value: "CALLSIGN1234567",
									},
									{
										path: "navigation.destination.commonName",
										value: "BALTIMORE INNER HARBOR EAST",
									},
								],
							},
						],
					},
				],
				expected: [
					{
						prio: 2,
						pgn: 129794,
						dst: 255,
						fields: {
							messageId: "Static and voyage related data",
							userId: 367301250,
							callsign: "CALLSIG",
							name: "VERY LONG VESSEL NAM",
							destination: "BALTIMORE INNER HARB",
							aisVersionIndicator: "ITU-R M.1371-1",
							dte: "Available",
							reserved: 1,
							aisTransceiverInformation: "Channel A VDL reception",
						},
					},
				],
			},
		],
	};
}

function generateStatic(
	vessel: Vessel,
	mmsi: string,
	index: Map<string, unknown>,
): N2KMessage | null {
	const name = indexedFindValue<string>(index, vessel, "name");
	const typeObj = indexedFindValue<AisShipType>(
		index,
		vessel,
		"design.aisShipType",
	);
	const type = typeObj?.id;
	const callsign = indexedFindValue<string>(
		index,
		vessel,
		"communication.callsignVhf",
	);
	const lengthObj = indexedFindValue<{ overall?: number }>(
		index,
		vessel,
		"design.length",
	);
	const length = lengthObj?.overall;
	const beam = indexedFindValue<number>(index, vessel, "design.beam");
	const fromCenter = indexedFindValue<number>(
		index,
		vessel,
		"sensors.ais.fromCenter",
	);
	const fromBow = indexedFindValue<number>(
		index,
		vessel,
		"sensors.ais.fromBow",
	);
	const draftObj = indexedFindValue<{ maximum?: number }>(
		index,
		vessel,
		"design.draft",
	);
	const draft = draftObj?.maximum;
	const dest = indexedFindValue<string>(
		index,
		vessel,
		"navigation.destination.commonName",
	);

	let fromStarboard: number | undefined;
	if (beam != null && fromCenter != null) {
		fromStarboard = beam / 2 + fromCenter;
	}

	const mmsiNumber = parseMmsi(mmsi);

	return {
		prio: N2K_DEFAULT_PRIORITY,
		pgn: 129794,
		dst: N2K_BROADCAST_DST,
		fields: {
			messageId: "Static and voyage related data",
			userId: mmsiNumber,
			callsign: clampString(callsign, AIS_CALLSIGN_CHARS),
			name: clampString(name, AIS_NAME_CHARS),
			typeOfShip: type,
			length: length,
			beam: beam,
			positionReferenceFromStarboard: fromStarboard,
			positionReferenceFromBow: fromBow,
			draft: draft,
			destination: clampString(dest, AIS_DESTINATION_CHARS),
			aisVersionIndicator: "ITU-R M.1371-1",
			dte: "Available",
			aisTransceiverInformation: "Channel A VDL reception",
		},
	};
}

function generatePosition(
	vessel: Vessel,
	mmsi: string,
	index: Map<string, unknown>,
): N2KMessage | null {
	const position = indexedFindValue<Position>(
		index,
		vessel,
		"navigation.position",
	);

	if (
		!position ||
		!isValidNumber(position.latitude) ||
		!isValidNumber(position.longitude)
	) {
		return null;
	}

	const cog = indexedFindValue<number>(
		index,
		vessel,
		"navigation.courseOverGroundTrue",
	);
	const sog = indexedFindValue<number>(
		index,
		vessel,
		"navigation.speedOverGround",
	);
	const heading = indexedFindValue<number>(
		index,
		vessel,
		"navigation.headingTrue",
	);
	const rot = indexedFindValue<number>(index, vessel, "navigation.rateOfTurn");
	const state = indexedFindValue<string>(index, vessel, "navigation.state");

	const mappedStatus = state ? navStatusMapping[state] : undefined;
	const status = mappedStatus ?? NAV_STATUS_NOT_DEFINED;

	const validCog =
		isValidNumber(cog) && cog >= 0 && cog <= Math.PI * 2 ? cog : undefined;
	const validHeading =
		isValidNumber(heading) && heading >= 0 && heading <= Math.PI * 2
			? heading
			: undefined;

	const mmsiNumber = parseMmsi(mmsi);

	return {
		prio: N2K_DEFAULT_PRIORITY,
		pgn: 129038,
		dst: N2K_BROADCAST_DST,
		fields: {
			messageId: "Scheduled Class A position report",
			repeatIndicator: "Initial",
			userId: mmsiNumber,
			longitude: position.longitude,
			latitude: position.latitude,
			positionAccuracy: "Low",
			raim: "not in use",
			timeStamp: "0",
			cog: validCog,
			sog: sog,
			aisTransceiverInformation: "Channel A VDL reception",
			heading: validHeading,
			rateOfTurn: rot,
			navStatus: status,
		},
	};
}

function generateAtoN(
	vessel: Vessel,
	mmsi: string,
	index: Map<string, unknown>,
): N2KMessage | null {
	const position = indexedFindValue<Position>(
		index,
		vessel,
		"navigation.position",
	);

	if (
		!position ||
		!isValidNumber(position.latitude) ||
		!isValidNumber(position.longitude)
	) {
		return null;
	}

	const name = vessel?.name || indexedFindValue<string>(index, vessel, "name");
	const lengthObj = indexedFindValue<{ overall?: number }>(
		index,
		vessel,
		"design.length",
	);
	const length = lengthObj?.overall;
	const beam = indexedFindValue<number>(index, vessel, "design.beam");
	const fromCenter = indexedFindValue<number>(
		index,
		vessel,
		"sensors.ais.fromCenter",
	);
	const fromBow = indexedFindValue<number>(
		index,
		vessel,
		"sensors.ais.fromBow",
	);

	let fromStarboard: number | undefined;
	if (isValidNumber(beam) && isValidNumber(fromCenter)) {
		fromStarboard = beam / 2 + fromCenter;
	}

	const fromBowScaled = isValidNumber(fromBow) ? fromBow * 10 : undefined;
	const mmsiNumber = parseMmsi(mmsi);

	// SK atons.* contexts publish atonType.id as the canonical AIS Message
	// 21 type code (0..31), aligned with canboat's ATON_TYPE lookup. Pass
	// the numeric id straight through; default to 0 ("not specified") when
	// missing.
	const atonTypeObj = indexedFindValue<{ id?: number }>(
		index,
		vessel,
		"atonType",
	);
	const atonType = isValidNumber(atonTypeObj?.id) ? atonTypeObj.id : 0;

	return {
		prio: N2K_DEFAULT_PRIORITY,
		pgn: 129041,
		dst: N2K_BROADCAST_DST,
		fields: {
			messageId: "ATON report",
			repeatIndicator: "Initial",
			userId: mmsiNumber,
			longitude: position.longitude,
			latitude: position.latitude,
			positionAccuracy: "Low",
			raim: "not in use",
			timeStamp: "0",
			lengthDiameter: length,
			beamDiameter: beam,
			positionReferenceFromStarboardEdge: fromStarboard,
			positionReferenceFromTrueNorthFacingEdge: fromBowScaled,
			atonType,
			offPositionIndicator: "No",
			virtualAtonFlag: "No",
			assignedModeFlag: "Autonomous and continuous",
			spare: 1,
			atonName: clampString(name, ATON_NAME_CHARS),
		},
	};
}

/**
 * Build a key→value index from delta updates for O(1) lookups.
 * Handles both path-keyed values and root-object values (path === "").
 */
function buildDeltaIndex(delta: AisDelta): Map<string, unknown> {
	const index = new Map<string, unknown>();
	if (!delta.updates) return index;

	for (const update of delta.updates) {
		if (!Array.isArray(update.values)) continue;

		for (const valueUpdate of update.values) {
			const valuePath = valueUpdate.path;
			const value = valueUpdate.value;

			if (valuePath === "" && typeof value === "object" && value != null) {
				for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
					index.set(k, v);
				}
			} else if (valuePath !== "") {
				index.set(valuePath, value);
			}
		}
	}
	return index;
}

function indexHasAnyKeys(index: Map<string, unknown>, keys: string[]): boolean {
	return keys.some((key) => index.has(key));
}

function indexedFindValue<T = unknown>(
	index: Map<string, unknown>,
	vessel: Vessel,
	path: string,
): T | undefined {
	if (index.has(path)) return index.get(path) as T | undefined;

	// Fallback: traverse the vessel object
	const pathParts = path.split(".");
	let val: unknown = vessel;
	for (const part of pathParts) {
		if (val && typeof val === "object" && val != null) {
			val = (val as Record<string, unknown>)[part];
		} else {
			val = undefined;
			break;
		}
	}

	const out =
		val && typeof val === "object" && val != null && "value" in val
			? (val as { value: unknown }).value
			: val;
	return out as T | undefined;
}

/**
 * Detect deltas that originated from the vessel's own NMEA 2000 bus so we
 * don't rebroadcast them: that would duplicate every AIS frame on the wire.
 * Signal K server's N2K inbound decoder labels sources with
 * `updates[].source.type === "NMEA2000"`.
 */
function isN2K(delta: AisDelta): boolean {
	if (!Array.isArray(delta.updates)) return false;
	return delta.updates.some((u) => {
		const src = (u as { source?: { type?: string } }).source;
		return typeof src?.type === "string" && src.type === "NMEA2000";
	});
}
