import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, SOURCE_TYPE } from "../constants.js";
import { classifySourceOrigin, SOURCE_ORIGIN } from "../recommendation/busSource.js";
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
	type AisShipType,
	ATON_NAME_CHARS,
	MAX_AIS_ANGLE_RADIANS,
	MAX_AIS_DECIMETER_FIELD,
	MAX_AIS_SOG_METERS_PER_SECOND,
	parseImo,
	parseMmsi,
	starboardOffset,
} from "../utils/aisUtils.js";
import {
	clampString,
	isValidLatitude,
	isValidLongitude,
	toFiniteInRange,
} from "../utils/validation.js";
import type { Position } from "./routeTypes.js";

// AIS Message 1 spec value for "Not defined". canboat NAV_STATUS lookup
// stops at 14, but the AIS bitfield is 4 bits and 15 is the spec default
// for "navigation state unknown". canboatjs accepts the numeric value.
const NAV_STATUS_NOT_DEFINED = 15;
const MIN_AIS_ROT_RADIANS_PER_SECOND = -1.02396875;
const MAX_AIS_ROT_RADIANS_PER_SECOND = 1.023875;
const MAX_AIS_DIMENSION_METERS = MAX_AIS_DECIMETER_FIELD;
const MAX_AIS_DRAFT_METERS = MAX_AIS_SOG_METERS_PER_SECOND;
const MAX_AIS_CONTEXTS = 2048;
// Class A vessels at anchor, slow Class B vessels, and AIS AtoNs normally
// report at intervals up to three minutes. Allow fifteen seconds of transport
// jitter without combining a new position with indefinitely old kinematics.
export const AIS_DYNAMIC_FRESHNESS_MS = 195_000;
const MAX_AIS_TIMESTAMP_FUTURE_SKEW_MS = 60_000;
const SIGNAL_K_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

interface CachedAisValue {
	value: unknown;
	updatedAtMs: number;
	sourceTimestampMs?: number;
}

type AisStateIndex = Map<string, CachedAisValue>;

interface AisDelta {
	context: string;
	updates: Array<{
		$source?: string;
		timestamp?: string;
		source?: {
			label?: string;
			type?: string;
			src?: string | number;
			pgn?: number;
			canName?: string;
		};
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
	"communication.callsignVhf",
	"navigation.destination.commonName",
	"sensors.ais.fromCenter",
	"sensors.ais.fromBow",
	"registrations.imo",
];

const positionKeys = ["navigation.position"];
const atonTriggerKeys = [...staticKeys, ...positionKeys, "mmsi", "atonType"];
const dynamicKeys = [
	"navigation.courseOverGroundTrue",
	"navigation.speedOverGround",
	"navigation.headingTrue",
	"navigation.rateOfTurn",
	"navigation.state",
];
const AIS_RELEVANT_VALUE_PATHS = new Set([
	"mmsi",
	"sensors.ais.class",
	...staticKeys,
	...positionKeys,
	...dynamicKeys,
	"atonType",
]);
const AIS_RELEVANT_PARENT_PATHS = new Set<string>();
for (const path of AIS_RELEVANT_VALUE_PATHS) {
	const segments = path.split(".");
	for (let length = 1; length < segments.length; length++) {
		AIS_RELEVANT_PARENT_PATHS.add(segments.slice(0, length).join("."));
	}
}

const AIS_COMPOSITE_CHILDREN: Readonly<Record<string, ReadonlySet<string>>> = {
	"navigation.position": new Set(["longitude", "latitude"]),
	"design.length": new Set(["overall"]),
	"design.draft": new Set(["maximum"]),
	"design.aisShipType": new Set(["id"]),
	atonType: new Set(["id"]),
};
const AIS_COMPOSITE_PARENT_BY_CHILD = new Map<string, string>();
for (const [parentPath, childNames] of Object.entries(AIS_COMPOSITE_CHILDREN)) {
	for (const childName of childNames) {
		AIS_COMPOSITE_PARENT_BY_CHILD.set(`${parentPath}.${childName}`, parentPath);
	}
}

const AIS_RELEVANT_DIRECT_CHILDREN = new Map<string, Set<string>>();
for (const path of AIS_RELEVANT_VALUE_PATHS) {
	const segments = path.split(".");
	for (let index = 0; index < segments.length; index++) {
		const parentPath = segments.slice(0, index).join(".");
		const children = AIS_RELEVANT_DIRECT_CHILDREN.get(parentPath) ?? new Set<string>();
		children.add(segments[index] as string);
		AIS_RELEVANT_DIRECT_CHILDREN.set(parentPath, children);
	}
}

const AIS_NUMBER_VALUE_PATHS = new Set([
	"design.beam",
	"sensors.ais.fromCenter",
	"sensors.ais.fromBow",
	"navigation.courseOverGroundTrue",
	"navigation.speedOverGround",
	"navigation.headingTrue",
	"navigation.rateOfTurn",
]);

export interface AisRelevantValueUpdate {
	path: string;
	value: unknown;
}

// Every navigation.state value in the current Signal K schema is listed here.
// Values with an exact AIS NAV_STATUS meaning map to Canboat's current numeric
// lookup. Signal K states that describe lights or operations without a direct
// navigational-status equivalent map to 15 (not defined), as do the schema's
// obsolete reserved labels. The final aliases are values emitted by older
// @signalk/n2k-signalk releases and remain accepted for round-trip compatibility.
// Numeric values avoid Canboat silently encoding an unmatched Signal K label as
// 0 ("Under way using engine").
export const AIS_NAV_STATUS_BY_SIGNAL_K_STATE: Readonly<Record<string, number>> = {
	"not under command": 2,
	anchored: 1,
	moored: 5,
	sailing: 8,
	motoring: 0,
	"towing < 200m": 11,
	"towing > 200m": 11,
	pushing: 12,
	fishing: 7,
	"fishing-hampered": 7,
	trawling: 7,
	"trawling-shooting": 7,
	"trawling-hauling": 7,
	pilotage: NAV_STATUS_NOT_DEFINED,
	"not-under-way": NAV_STATUS_NOT_DEFINED,
	aground: 6,
	"restricted manouverability": 3,
	"restricted manouverability towing < 200m": 3,
	"restricted manouverability towing > 200m": 3,
	"restricted manouverability underwater operations": 3,
	"constrained by draft": 4,
	"mine clearance": NAV_STATUS_NOT_DEFINED,
	"Reserved for future amendment of Navigational Status for HSC": 9,
	"Reserved for future amendment of Navigational Status for WIG": 10,
	"Reserved for future use-11": NAV_STATUS_NOT_DEFINED,
	"Reserved for future use-12": NAV_STATUS_NOT_DEFINED,
	"Reserved for future use-13": NAV_STATUS_NOT_DEFINED,
	"Reserved for future use-14": NAV_STATUS_NOT_DEFINED,
	"not defined (example)": NAV_STATUS_NOT_DEFINED,

	// Legacy @signalk/n2k-signalk output aliases and a corrected spelling seen
	// from third-party Signal K producers.
	"ais-sart": 14,
	"hazardous material high speed": 9,
	"hazardous material wing in ground": 10,
	"restricted maneuverability": 3,
};

export default function createAisConversion(
	app: SignalKApp,
	_plugin: SignalKPlugin,
): ConversionModule<[AisDelta]> {
	// Cached on first non-null observation. `app.selfId` is configured at
	// server boot and stable for the run, but the factory may load before
	// it is populated, so memoize lazily rather than at module-init.
	let cachedSelfContext: string | null = null;
	// AIS output may need identity and static fields from earlier deltas. Keep
	// only values observed from publishers that passed the echo guard. Reading
	// app.getPath(ctx) here would mix rejected NMEA 2000 values back into a safe
	// partial update after Signal K has applied the original delta.
	const safeStateByContext = new Map<string, AisStateIndex>();

	return {
		title: "AIS (PGNs 129038, 129039, 129041, 129794, 129809, 129810)",
		sourceType: SOURCE_TYPE.ON_DELTA,
		optionKey: "AIS",
		category: "ais",
		presets: ["full-ais"],
		callback: ((delta: AisDelta) => {
			if (!delta || typeof delta !== "object" || typeof delta.context !== "string") {
				return [];
			}
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

			if (ctx === cachedSelfContext) {
				return [];
			}

			// A Signal K delta may contain updates from more than one publisher.
			// Remove only the NMEA 2000-origin updates so one bus update cannot
			// either be echoed or suppress safe data supplied in the same delta.
			// `$source` is the current Signal K contract; the structured legacy
			// source and the server sources tree remain supported fallbacks.
			const safeDelta = withoutNmea2000Updates(delta, () => app.getPath?.("sources"));
			if (safeDelta === null) return [];
			const nowMs = Date.now();
			const currentIndex = buildDeltaIndex(safeDelta);
			const index = stateForContext(safeStateByContext, ctx);
			applyDeltaToState(index, safeDelta, nowMs);
			if (index.size === 0) safeStateByContext.delete(ctx);

			if (isVessel) {
				const hasStatic = indexHasAnyKeys(currentIndex, staticKeys);
				const hasPosition = indexHasAnyKeys(currentIndex, positionKeys);

				if (!hasStatic && !hasPosition) {
					return [];
				}

				const mmsiValue = indexedFindValue<string>(index, "mmsi");
				const aisClass = indexedFindValue<string>(index, "sensors.ais.class");

				if (!mmsiValue || typeof mmsiValue !== "string") {
					return [];
				}

				const res: N2KMessage[] = [];
				if (aisClass === "B") {
					if (hasPosition) {
						const positionMessage = generateClassBPosition(mmsiValue, index, nowMs);
						if (positionMessage) res.push(positionMessage);
					}
					if (hasStatic) res.push(...generateClassBStatic(mmsiValue, index));
					return res;
				}
				if (aisClass !== "A") return [];
				if (hasPosition) {
					const posMsg = generatePosition(mmsiValue, index, nowMs);
					if (posMsg) res.push(posMsg);
				}

				if (hasStatic) {
					const staticMsg = generateStatic(mmsiValue, index);
					if (staticMsg) res.push(staticMsg);
				}
				return res;
			}

			if (!indexHasAnyKeys(currentIndex, atonTriggerKeys)) return [];
			const mmsiValue = indexedFindValue(index, "mmsi");

			if (!mmsiValue || typeof mmsiValue !== "string") {
				return [];
			}

			const atonMsg = generateAtoN(
				mmsiValue,
				index,
				nowMs,
				indexHasAnyKeys(currentIndex, positionKeys),
			);
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
									{ path: "sensors.ais.class", value: "A" },
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
									{ path: "registrations.imo", value: "IMO9074729" },
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
							timeStamp: "Not available",
							cog: 1.501,
							sog: 0.05,
							aisTransceiverInformation: "Channel A VDL reception",
							heading: 5.6199,
							rateOfTurn: 0,
							navStatus: "Under way using engine",
							specialManeuverIndicator: "Not available",
						},
					},
					{
						prio: 2,
						pgn: 129794,
						dst: 255,
						fields: {
							messageId: "Static and voyage related data",
							repeatIndicator: "Initial",
							userId: 367301250,
							imoNumber: 9074729,
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
						context: "atons.urn:mrn:imo:mmsi:993672086",
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
							timeStamp: "Not available",
							atonType: "Fixed beacon: starboard hand",
							offPositionIndicator: "No",
							virtualAtonFlag: "No",
							assignedModeFlag: "Autonomous and continuous",
							spare: 1,
							aisTransceiverInformation: "Channel A VDL reception",
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
						context: "atons.urn:mrn:imo:mmsi:993672087",
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
							timeStamp: "Not available",
							atonType: "Floating AtoN: port hand mark",
							offPositionIndicator: "No",
							virtualAtonFlag: "No",
							assignedModeFlag: "Autonomous and continuous",
							spare: 1,
							aisTransceiverInformation: "Channel A VDL reception",
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
						context: "atons.urn:mrn:imo:mmsi:993672088",
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
							timeStamp: "Not available",
							atonType: "Fixed beacon: starboard hand",
							offPositionIndicator: "No",
							virtualAtonFlag: "No",
							assignedModeFlag: "Autonomous and continuous",
							spare: 1,
							aisTransceiverInformation: "Channel A VDL reception",
							// 18 chars from the 41-char input: the plugin's
							// clampString(ATON_NAME_CHARS) caps the value before it
							// reaches canboatjs.
							atonName: "EXCEEDINGLY LONG A",
						},
					},
				],
			},
			{
				// Regression (H1): 129041 geometry fields are plain SI meters
				// (res 0.1). positionReferenceFromTrueNorthFacingEdge must
				// round-trip fromBow unscaled, matching the sibling length,
				// beam, and starboard fields. A re-introduced *10 scale would
				// put 90 m on the wire for a 9 m offset.
				input: [
					{
						context: "atons.urn:mrn:imo:mmsi:993672085",
						updates: [
							{
								values: [
									{ path: "", value: { name: "DIM" } },
									{
										path: "navigation.position",
										value: { longitude: -76.5, latitude: 38.6 },
									},
									{
										path: "atonType",
										value: { id: 14, name: "Beacon, Starboard Hand" },
									},
									{ path: "design.length", value: { overall: 12 } },
									{ path: "design.beam", value: 4 },
									{ path: "sensors.ais.fromCenter", value: 1 },
									{ path: "sensors.ais.fromBow", value: 9 },
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
							timeStamp: "Not available",
							lengthDiameter: 12,
							beamDiameter: 4,
							positionReferenceFromStarboardEdge: 3,
							positionReferenceFromTrueNorthFacingEdge: 9,
							atonType: "Fixed beacon: starboard hand",
							offPositionIndicator: "No",
							virtualAtonFlag: "No",
							assignedModeFlag: "Autonomous and continuous",
							spare: 1,
							aisTransceiverInformation: "Channel A VDL reception",
							atonName: "DIM",
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
						context: "vessels.urn:mrn:imo:mmsi:367301251",
						updates: [
							{
								values: [
									{
										path: "navigation.position",
										value: { longitude: -76.4, latitude: 39.0 },
									},
									{ path: "navigation.state", value: "anchored" },
									{ path: "sensors.ais.class", value: "A" },
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
							timeStamp: "Not available",
							aisTransceiverInformation: "Channel A VDL reception",
							navStatus: "At anchor",
							specialManeuverIndicator: "Not available",
						},
					},
				],
			},
			{
				// A canonical remote Class B contact must stay Class B on the bus:
				// position uses 129039 and static message 24 is split into 129809/810.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367555111",
						updates: [
							{
								values: [
									{ path: "", value: { mmsi: "367555111", name: "CLASS B BOAT" } },
									{ path: "sensors.ais.class", value: "B" },
									{
										path: "navigation.position",
										value: { longitude: -76.4, latitude: 39.1 },
									},
									{ path: "navigation.courseOverGroundTrue", value: 1.2 },
									{ path: "navigation.speedOverGround", value: 3.4 },
									{ path: "navigation.headingTrue", value: 1.1 },
									{ path: "communication.callsignVhf", value: "WDC1234" },
									{ path: "design.aisShipType", value: { id: 36, name: "Sailing" } },
									{ path: "design.length", value: { overall: 10 } },
									{ path: "design.beam", value: 3.2 },
									{ path: "sensors.ais.fromCenter", value: 0.2 },
									{ path: "sensors.ais.fromBow", value: 8 },
								],
							},
						],
					},
				],
				expected: [
					{
						prio: 2,
						pgn: 129039,
						dst: 255,
						fields: {
							messageId: "Standard Class B position report",
							repeatIndicator: "Initial",
							userId: 367555111,
							longitude: -76.4,
							latitude: 39.1,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "Not available",
							cog: 1.2,
							sog: 3.4,
							aisTransceiverInformation: "Channel A VDL reception",
							heading: 1.1,
							regionalApplication: 0,
							unitType: "CS",
							integratedDisplay: "No",
							dsc: "No",
							band: "Top 525 kHz of marine band",
							canHandleMsg22: "No",
							aisMode: "Autonomous",
							aisCommunicationState: "SOTDMA",
						},
					},
					{
						prio: 2,
						pgn: 129809,
						dst: 255,
						fields: {
							messageId: "Static data report",
							repeatIndicator: "Initial",
							userId: 367555111,
							name: "CLASS B BOAT",
							aisTransceiverInformation: "Channel A VDL reception",
						},
					},
					{
						prio: 2,
						pgn: 129810,
						dst: 255,
						fields: {
							messageId: "Static data report",
							repeatIndicator: "Initial",
							userId: 367555111,
							typeOfShip: "Sailing",
							callsign: "WDC1234",
							length: 10,
							beam: 3.2,
							positionReferenceFromStarboard: 1.8,
							positionReferenceFromBow: 8,
							aisTransceiverInformation: "Channel A VDL reception",
						},
					},
				],
			},
			{
				// Invalid remote kinematics must become unavailable. Unsigned Canboat
				// fields otherwise wrap values such as -1 m/s into plausible speeds.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367555112",
						updates: [
							{
								values: [
									{ path: "", value: { mmsi: "367555112" } },
									{ path: "sensors.ais.class", value: "A" },
									{
										path: "navigation.position",
										value: { longitude: -76.4, latitude: 39.1 },
									},
									{ path: "navigation.courseOverGroundTrue", value: Math.PI * 2 },
									{ path: "navigation.speedOverGround", value: -1 },
									{ path: "navigation.headingTrue", value: 7 },
									{ path: "navigation.rateOfTurn", value: 2 },
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
							userId: 367555112,
							longitude: -76.4,
							latitude: 39.1,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "Not available",
							aisTransceiverInformation: "Channel A VDL reception",
							specialManeuverIndicator: "Not available",
						},
					},
				],
			},
			{
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367555113",
						updates: [
							{
								values: [
									{ path: "", value: { mmsi: "367555113" } },
									{
										path: "navigation.position",
										value: { longitude: -76.4, latitude: 39.1 },
									},
								],
							},
						],
					},
				],
				expected: [],
			},
			{
				// Echo loop: delta originated from the vessel's own N2K bus
				// (source.type === "NMEA2000"). Re-emitting would duplicate
				// every AIS frame on the wire. mmsi is included so that the
				// rest of the pipeline *would* succeed if the echo guard
				// weren't enforced, making this a genuine regression test.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301252",
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
						context: "vessels.urn:mrn:imo:mmsi:367301253",
						updates: [
							{
								values: [
									{ path: "", value: { mmsi: "367301250" } },
									{ path: "sensors.ais.class", value: "A" },
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
							repeatIndicator: "Initial",
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

function generateClassBPosition(
	mmsi: string,
	index: AisStateIndex,
	nowMs: number,
): N2KMessage | null {
	const position = indexedFindValue<Position>(index, "navigation.position");
	const userId = parseMmsi(mmsi);
	if (
		userId === undefined ||
		!position ||
		!isValidLatitude(position.latitude) ||
		!isValidLongitude(position.longitude)
	) {
		return null;
	}
	const cog = indexedFindFreshValue<number>(index, "navigation.courseOverGroundTrue", nowMs);
	const sog = indexedFindFreshValue<number>(index, "navigation.speedOverGround", nowMs);
	const heading = indexedFindFreshValue<number>(index, "navigation.headingTrue", nowMs);
	return {
		prio: N2K_DEFAULT_PRIORITY,
		pgn: 129039,
		dst: N2K_BROADCAST_DST,
		fields: {
			messageId: "Standard Class B position report",
			repeatIndicator: "Initial",
			userId,
			longitude: position.longitude,
			latitude: position.latitude,
			positionAccuracy: "Low",
			raim: "not in use",
			timeStamp: aisTimestampForPath(index, "navigation.position"),
			cog: toFiniteInRange(cog, 0, MAX_AIS_ANGLE_RADIANS),
			sog: toFiniteInRange(sog, 0, MAX_AIS_SOG_METERS_PER_SECOND),
			aisTransceiverInformation: "Channel A VDL reception",
			heading: toFiniteInRange(heading, 0, MAX_AIS_ANGLE_RADIANS),
			regionalApplication: 0,
			// Signal K identifies only Class B, not the radio subtype or optional
			// features. Use conservative no-capability defaults instead of the
			// all-ones bit patterns, which decode as affirmative values.
			unitType: "CS",
			integratedDisplay: "No",
			dsc: "No",
			band: "Top 525 kHz of marine band",
			canHandleMsg22: "No",
			aisMode: "Autonomous",
			aisCommunicationState: "SOTDMA",
		},
	};
}

function generateClassBStatic(mmsi: string, index: AisStateIndex): N2KMessage[] {
	const userId = parseMmsi(mmsi);
	if (userId === undefined) return [];
	const name = indexedFindValue<string>(index, "name");
	const callsign = indexedFindValue<string>(index, "communication.callsignVhf");
	const typeObj = indexedFindValue<AisShipType>(index, "design.aisShipType");
	const lengthValue = indexedFindValue<{ overall?: number }>(index, "design.length")?.overall;
	const length = toFiniteInRange(lengthValue, 0, MAX_AIS_DIMENSION_METERS);
	const beamValue = indexedFindValue<number>(index, "design.beam");
	const beam = toFiniteInRange(beamValue, 0, MAX_AIS_DIMENSION_METERS);
	const fromCenter = indexedFindValue<number>(index, "sensors.ais.fromCenter");
	const fromBowValue = indexedFindValue<number>(index, "sensors.ais.fromBow");
	const fromBow = toFiniteInRange(fromBowValue, 0, MAX_AIS_DIMENSION_METERS);
	const starboardValue = starboardOffset(beam, fromCenter);
	const fromStarboard = toFiniteInRange(starboardValue, 0, MAX_AIS_DIMENSION_METERS);
	const shipType = Number.isInteger(typeObj?.id) ? toFiniteInRange(typeObj?.id, 0, 252) : undefined;
	const messages: N2KMessage[] = [];
	if (typeof name === "string" && name !== "") {
		messages.push({
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 129809,
			dst: N2K_BROADCAST_DST,
			fields: {
				messageId: "Static data report",
				repeatIndicator: "Initial",
				userId,
				name: clampString(name, AIS_NAME_CHARS),
				aisTransceiverInformation: "Channel A VDL reception",
			},
		});
	}
	if (
		shipType !== undefined ||
		typeof callsign === "string" ||
		length !== undefined ||
		beam !== undefined ||
		fromStarboard !== undefined ||
		fromBow !== undefined
	) {
		messages.push({
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 129810,
			dst: N2K_BROADCAST_DST,
			fields: {
				messageId: "Static data report",
				repeatIndicator: "Initial",
				userId,
				typeOfShip: shipType,
				callsign: clampString(callsign, AIS_CALLSIGN_CHARS),
				length,
				beam,
				positionReferenceFromStarboard: fromStarboard,
				positionReferenceFromBow: fromBow,
				aisTransceiverInformation: "Channel A VDL reception",
			},
		});
	}
	return messages;
}

function generateStatic(mmsi: string, index: AisStateIndex): N2KMessage | null {
	const name = indexedFindValue<string>(index, "name");
	const typeObj = indexedFindValue<AisShipType>(index, "design.aisShipType");
	const type = typeObj?.id;
	const callsign = indexedFindValue<string>(index, "communication.callsignVhf");
	const lengthObj = indexedFindValue<{ overall?: number }>(index, "design.length");
	const length = lengthObj?.overall;
	const validLength = toFiniteInRange(length, 0, MAX_AIS_DIMENSION_METERS);
	const beam = indexedFindValue<number>(index, "design.beam");
	const validBeam = toFiniteInRange(beam, 0, MAX_AIS_DIMENSION_METERS);
	const fromCenter = indexedFindValue<number>(index, "sensors.ais.fromCenter");
	const fromBow = indexedFindValue<number>(index, "sensors.ais.fromBow");
	const validFromBow = toFiniteInRange(fromBow, 0, MAX_AIS_DIMENSION_METERS);
	const draftObj = indexedFindValue<{ maximum?: number }>(index, "design.draft");
	const draft = draftObj?.maximum;
	const validDraft = toFiniteInRange(draft, 0, MAX_AIS_DRAFT_METERS);
	const dest = indexedFindValue<string>(index, "navigation.destination.commonName");
	const imoNumber = parseImo(indexedFindValue<string>(index, "registrations.imo"));

	const fromStarboard = toFiniteInRange(
		starboardOffset(validBeam, fromCenter),
		0,
		MAX_AIS_DIMENSION_METERS,
	);

	const mmsiNumber = parseMmsi(mmsi);
	if (mmsiNumber === undefined) return null;

	return {
		prio: N2K_DEFAULT_PRIORITY,
		pgn: 129794,
		dst: N2K_BROADCAST_DST,
		fields: {
			messageId: "Static and voyage related data",
			repeatIndicator: "Initial",
			userId: mmsiNumber,
			imoNumber,
			callsign: clampString(callsign, AIS_CALLSIGN_CHARS),
			name: clampString(name, AIS_NAME_CHARS),
			typeOfShip: Number.isInteger(type) ? toFiniteInRange(type, 0, 252) : undefined,
			length: validLength,
			beam: validBeam,
			positionReferenceFromStarboard: fromStarboard,
			positionReferenceFromBow: validFromBow,
			draft: validDraft,
			destination: clampString(dest, AIS_DESTINATION_CHARS),
			aisVersionIndicator: "ITU-R M.1371-1",
			dte: "Available",
			aisTransceiverInformation: "Channel A VDL reception",
		},
	};
}

function generatePosition(mmsi: string, index: AisStateIndex, nowMs: number): N2KMessage | null {
	const position = indexedFindValue<Position>(index, "navigation.position");

	if (!position || !isValidLatitude(position.latitude) || !isValidLongitude(position.longitude)) {
		return null;
	}

	const cog = indexedFindFreshValue<number>(index, "navigation.courseOverGroundTrue", nowMs);
	const sog = indexedFindFreshValue<number>(index, "navigation.speedOverGround", nowMs);
	const heading = indexedFindFreshValue<number>(index, "navigation.headingTrue", nowMs);
	const rot = indexedFindFreshValue<number>(index, "navigation.rateOfTurn", nowMs);
	const state = indexedFindFreshValue<string>(index, "navigation.state", nowMs);

	const mappedStatus = state ? AIS_NAV_STATUS_BY_SIGNAL_K_STATE[state] : undefined;
	const status = mappedStatus ?? NAV_STATUS_NOT_DEFINED;

	// Received AIS COG/heading: drop an out-of-range value rather than wrap it
	// with toUnsignedAngle. A garbage bearing from a remote vessel should read
	// as "not available" on the MFD, not as a plausible-but-wrong heading.
	// (aisExtended.ts wraps the same fields because those are own-vessel sensor
	// values, which can legitimately sit a hair outside [0, 2pi).)
	const validCog = toFiniteInRange(cog, 0, MAX_AIS_ANGLE_RADIANS);
	const validHeading = toFiniteInRange(heading, 0, MAX_AIS_ANGLE_RADIANS);
	// Guard sog/rot like cog/heading: a NaN or Infinity from a flaky provider
	// must not reach the encoder.
	const validSog = toFiniteInRange(sog, 0, MAX_AIS_SOG_METERS_PER_SECOND);
	const validRot = toFiniteInRange(
		rot,
		MIN_AIS_ROT_RADIANS_PER_SECOND,
		MAX_AIS_ROT_RADIANS_PER_SECOND,
	);

	const mmsiNumber = parseMmsi(mmsi);
	if (mmsiNumber === undefined) return null;

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
			timeStamp: aisTimestampForPath(index, "navigation.position"),
			cog: validCog,
			sog: validSog,
			aisTransceiverInformation: "Channel A VDL reception",
			heading: validHeading,
			rateOfTurn: validRot,
			navStatus: status,
			specialManeuverIndicator: "Not available",
		},
	};
}

function generateAtoN(
	mmsi: string,
	index: AisStateIndex,
	nowMs: number,
	positionIsCurrent: boolean,
): N2KMessage | null {
	const position = indexedFindFreshValue<Position>(
		index,
		"navigation.position",
		nowMs,
		positionIsCurrent,
	);

	if (!position || !isValidLatitude(position.latitude) || !isValidLongitude(position.longitude)) {
		return null;
	}

	const name = indexedFindValue<string>(index, "name");
	const lengthObj = indexedFindValue<{ overall?: number }>(index, "design.length");
	const length = lengthObj?.overall;
	const beam = indexedFindValue<number>(index, "design.beam");
	const fromCenter = indexedFindValue<number>(index, "sensors.ais.fromCenter");
	const fromBow = indexedFindValue<number>(index, "sensors.ais.fromBow");

	const validLength = toFiniteInRange(length, 0, MAX_AIS_DIMENSION_METERS);
	const validBeam = toFiniteInRange(beam, 0, MAX_AIS_DIMENSION_METERS);
	const fromStarboard = toFiniteInRange(
		starboardOffset(validBeam, fromCenter),
		0,
		MAX_AIS_DIMENSION_METERS,
	);

	// canboat 129041 positionReferenceFromTrueNorthFacingEdge is res=0.1, unit=m;
	// canboatjs round-trips plain SI meters, so pass fromBow unscaled to match
	// the sibling geometry fields (lengthDiameter, beamDiameter,
	// positionReferenceFromStarboardEdge), which are all the same spec.
	const fromBowMeters = toFiniteInRange(fromBow, 0, MAX_AIS_DIMENSION_METERS);
	const mmsiNumber = parseMmsi(mmsi);
	if (mmsiNumber === undefined) return null;

	// SK atons.* contexts publish atonType.id as the canonical AIS Message
	// 21 type code (0..31), aligned with canboat's ATON_TYPE lookup. atonType
	// is a 5-bit field. Invalid values become 0 ("not specified") rather than
	// being clamped to a different, real aid type.
	const atonTypeObj = indexedFindValue<{ id?: number }>(index, "atonType");
	const atonTypeId = atonTypeObj?.id;
	const atonType = Number.isInteger(atonTypeId) ? (toFiniteInRange(atonTypeId, 0, 31) ?? 0) : 0;

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
			timeStamp: aisTimestampForPath(index, "navigation.position"),
			aisTransceiverInformation: "Channel A VDL reception",
			lengthDiameter: validLength,
			beamDiameter: validBeam,
			positionReferenceFromStarboardEdge: fromStarboard,
			positionReferenceFromTrueNorthFacingEdge: fromBowMeters,
			atonType,
			offPositionIndicator: "No",
			virtualAtonFlag: "No",
			assignedModeFlag: "Autonomous and continuous",
			spare: 1,
			atonName: clampString(name, ATON_NAME_CHARS),
		},
	};
}

function deletePathAndChildren<T>(index: Map<string, T>, path: string): void {
	index.delete(path);
	const prefix = `${path}.`;
	for (const key of index.keys()) {
		if (key.startsWith(prefix)) index.delete(key);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
	return Object.hasOwn(record, key);
}

function normalizeAisRelevantValue(path: string, value: unknown): unknown | undefined {
	if (AIS_NUMBER_VALUE_PATHS.has(path)) {
		return typeof value === "number" ? value : undefined;
	}

	switch (path) {
		case "mmsi":
			return typeof value === "string" && value.length <= 9 ? value : undefined;
		case "sensors.ais.class":
			return value === "A" || value === "B" ? value : undefined;
		case "name":
			return clampString(value, AIS_NAME_CHARS);
		case "communication.callsignVhf":
			return clampString(value, AIS_CALLSIGN_CHARS);
		case "navigation.destination.commonName":
			return clampString(value, AIS_DESTINATION_CHARS);
		case "registrations.imo":
			return typeof value === "string" && value.length <= 32 ? value : undefined;
		case "navigation.state":
			return typeof value === "string" && value.length <= 128 ? value : undefined;
	}

	const childNames = AIS_COMPOSITE_CHILDREN[path];
	if (!childNames || !isRecord(value)) return undefined;
	const normalized: Record<string, number> = {};
	for (const childName of childNames) {
		const childValue = value[childName];
		if (typeof childValue === "number") normalized[childName] = childValue;
	}
	return normalized;
}

function setCompositeChild<T>(
	index: Map<string, T>,
	parentPath: string,
	childPath: string,
	value: unknown,
	createEntry: (path: string, value: unknown) => T,
	readEntry: (entry: T) => unknown,
): void {
	const childName = childPath.slice(parentPath.length + 1);
	const existing = index.get(parentPath);
	const existingValue = existing === undefined ? undefined : readEntry(existing);
	const normalized = normalizeAisRelevantValue(parentPath, existingValue);
	const nextValue = isRecord(normalized) ? { ...normalized } : {};

	if (typeof value === "number") nextValue[childName] = value;
	else delete nextValue[childName];

	if (Object.keys(nextValue).length === 0) {
		index.delete(parentPath);
		return;
	}
	index.set(parentPath, createEntry(parentPath, nextValue));
}

function setRelevantIndexedValue<T>(
	index: Map<string, T>,
	path: string,
	value: unknown,
	createEntry: (path: string, value: unknown) => T,
	readEntry: (entry: T) => unknown,
): void {
	if (path === "") {
		if (value === null || value === undefined) {
			index.clear();
			return;
		}
		if (!isRecord(value)) return;
		for (const childName of AIS_RELEVANT_DIRECT_CHILDREN.get("") ?? []) {
			if (hasOwn(value, childName)) {
				setRelevantIndexedValue(index, childName, value[childName], createEntry, readEntry);
			}
		}
		return;
	}

	const compositeParent = AIS_COMPOSITE_PARENT_BY_CHILD.get(path);
	if (compositeParent !== undefined) {
		setCompositeChild(index, compositeParent, path, value, createEntry, readEntry);
		return;
	}

	if (AIS_RELEVANT_VALUE_PATHS.has(path)) {
		deletePathAndChildren(index, path);
		if (value === null || value === undefined) return;
		const normalized = normalizeAisRelevantValue(path, value);
		if (normalized !== undefined) index.set(path, createEntry(path, normalized));
		return;
	}

	if (!AIS_RELEVANT_PARENT_PATHS.has(path)) return;
	deletePathAndChildren(index, path);
	if (!isRecord(value)) return;
	for (const childName of AIS_RELEVANT_DIRECT_CHILDREN.get(path) ?? []) {
		if (hasOwn(value, childName)) {
			const childPath = `${path}.${childName}`;
			setRelevantIndexedValue(index, childPath, value[childName], createEntry, readEntry);
		}
	}
}

function applyRelevantValueUpdates<T>(
	index: Map<string, T>,
	values: ReadonlyArray<AisRelevantValueUpdate>,
	createEntry: (path: string, value: unknown) => T,
	readEntry: (entry: T) => unknown,
): void {
	for (const valueUpdate of values) {
		if (!valueUpdate || typeof valueUpdate !== "object" || typeof valueUpdate.path !== "string") {
			continue;
		}
		setRelevantIndexedValue(index, valueUpdate.path, valueUpdate.value, createEntry, readEntry);
	}
}

/** Build the bounded AIS state that can be retained from an ordered value batch. */
export function buildAisRelevantValueIndex(
	values: ReadonlyArray<AisRelevantValueUpdate>,
): ReadonlyMap<string, unknown> {
	const index = new Map<string, unknown>();
	applyRelevantValueUpdates(
		index,
		values,
		(_path, value) => value,
		(value) => value,
	);
	return index;
}

function parseUpdateTimestamp(
	timestamp: unknown,
	nowMs: number,
): { updatedAtMs: number; sourceTimestampMs?: number } {
	if (typeof timestamp !== "string" || !SIGNAL_K_UTC_TIMESTAMP.test(timestamp)) {
		return { updatedAtMs: nowMs };
	}
	const parsedMs = Date.parse(timestamp);
	if (
		!Number.isFinite(parsedMs) ||
		parsedMs < 0 ||
		new Date(parsedMs).toISOString().slice(0, 19) !== timestamp.slice(0, 19) ||
		parsedMs > nowMs + MAX_AIS_TIMESTAMP_FUTURE_SKEW_MS
	) {
		return { updatedAtMs: nowMs };
	}
	return { updatedAtMs: parsedMs, sourceTimestampMs: parsedMs };
}

/** Apply one safe delta to a source-aware per-context state index. */
function applyDeltaToState(index: AisStateIndex, delta: AisDelta, nowMs: number): void {
	for (const update of delta.updates ?? []) {
		if (!Array.isArray(update.values)) continue;
		const timing = parseUpdateTimestamp(update.timestamp, nowMs);
		applyRelevantValueUpdates(
			index,
			update.values,
			(_path, value) => ({ value, ...timing }),
			(entry) => entry.value,
		);
	}
}

function stateForContext(states: Map<string, AisStateIndex>, context: string): AisStateIndex {
	const existing = states.get(context);
	if (existing !== undefined) {
		// Refresh insertion order so the hard cap behaves as a small LRU cache.
		states.delete(context);
		states.set(context, existing);
		return existing;
	}
	if (states.size >= MAX_AIS_CONTEXTS) {
		const oldestContext = states.keys().next().value;
		if (typeof oldestContext === "string") states.delete(oldestContext);
	}
	const created: AisStateIndex = new Map();
	states.set(context, created);
	return created;
}

function collectRelevantTouchedPaths(index: Set<string>, path: string, value: unknown): void {
	if (path === "") {
		if (!isRecord(value)) return;
		for (const childName of AIS_RELEVANT_DIRECT_CHILDREN.get("") ?? []) {
			if (hasOwn(value, childName)) {
				collectRelevantTouchedPaths(index, childName, value[childName]);
			}
		}
		return;
	}

	const compositeParent = AIS_COMPOSITE_PARENT_BY_CHILD.get(path);
	if (compositeParent !== undefined) {
		index.add(compositeParent);
		return;
	}

	if (AIS_RELEVANT_VALUE_PATHS.has(path)) {
		index.add(path);
		return;
	}

	if (!AIS_RELEVANT_PARENT_PATHS.has(path) || !isRecord(value)) return;
	for (const childName of AIS_RELEVANT_DIRECT_CHILDREN.get(path) ?? []) {
		if (hasOwn(value, childName)) {
			collectRelevantTouchedPaths(index, `${path}.${childName}`, value[childName]);
		}
	}
}

/** Build an allowlisted index for deciding which fields the current delta touched. */
function buildDeltaIndex(delta: AisDelta): Set<string> {
	const index = new Set<string>();
	for (const update of delta.updates ?? []) {
		if (!Array.isArray(update.values)) continue;
		for (const valueUpdate of update.values) {
			if (!valueUpdate || typeof valueUpdate !== "object" || typeof valueUpdate.path !== "string") {
				continue;
			}
			collectRelevantTouchedPaths(index, valueUpdate.path, valueUpdate.value);
		}
	}
	return index;
}

function indexHasAnyKeys(index: ReadonlySet<string>, keys: string[]): boolean {
	return keys.some((key) => index.has(key));
}

function indexedFindValue<T = unknown>(index: AisStateIndex, path: string): T | undefined {
	return index.get(path)?.value as T | undefined;
}

function indexedFindFreshValue<T = unknown>(
	index: AisStateIndex,
	path: string,
	nowMs: number,
	currentDeltaValue = false,
): T | undefined {
	const entry = index.get(path);
	if (!entry) return undefined;
	if (!currentDeltaValue && nowMs - entry.updatedAtMs > AIS_DYNAMIC_FRESHNESS_MS) {
		return undefined;
	}
	return entry.value as T;
}

function aisTimestampForPath(index: AisStateIndex, path: string): number {
	const sourceTimestampMs = index.get(path)?.sourceTimestampMs;
	return sourceTimestampMs === undefined ? 60 : new Date(sourceTimestampMs).getUTCSeconds();
}

/** Keep safe publishers in a mixed delta while removing bus-origin updates. */
function withoutNmea2000Updates(
	delta: AisDelta,
	getSourceMetadata: () => unknown,
): AisDelta | null {
	if (!Array.isArray(delta.updates)) return null;
	let sourceMetadataLoaded = false;
	let sourceMetadata: unknown;
	const updates = delta.updates.filter((update) => {
		if (!update || typeof update !== "object") return false;
		const sourceRef = typeof update.$source === "string" ? update.$source : "";
		let origin = classifySourceOrigin(sourceRef, update.source);
		if (origin === SOURCE_ORIGIN.UNKNOWN) {
			if (!sourceMetadataLoaded) {
				sourceMetadata = getSourceMetadata();
				sourceMetadataLoaded = true;
			}
			origin = classifySourceOrigin(sourceRef, undefined, sourceMetadata);
		}
		return origin !== SOURCE_ORIGIN.NMEA2000;
	});
	if (updates.length === 0) return null;
	return updates.length === delta.updates.length ? delta : { ...delta, updates };
}
