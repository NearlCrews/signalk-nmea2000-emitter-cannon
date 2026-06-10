import {
	DEFAULT_DATA_TIMEOUT_MS,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
	SignalKPlugin,
} from "../types/index.js";
import {
	AIS_NAME_CHARS,
	AIS_SAFETY_TEXT_CHARS,
	type AisShipType,
	parseMmsi,
	starboardOffset,
} from "../utils/aisUtils.js";
import {
	clampString,
	isValidNumber,
	normalizeAngle,
} from "../utils/validation.js";
import type { Position as GeoPosition } from "./routeTypes.js";

// SK publishes altitude as a sub-field of the position value when available
// (e.g. for SAR aircraft); there is no canonical top-level navigation.altitude
// path, so this extends the shared Position with an optional altitude.
interface Position extends GeoPosition {
	altitude?: number;
}

// AIS safety broadcasts are intentionally infrequent: 5 minutes of staleness
// is still useful, while reapplying DEFAULT_DATA_TIMEOUT_MS would expire
// after 10 seconds and silently mute the message between repeats.
const SAFETY_MESSAGE_TIMEOUT_MS = 300000;

export default function createAisExtendedConversions(
	app: SignalKApp,
	_plugin: SignalKPlugin,
): ConversionModule<unknown[]>[] {
	// Self-vessel mmsi and name live on the empty-path bag in Signal K
	// (`vessels.self`), so streambundle.getSelfBus() does not emit them.
	// Read them at callback time via getSelfPath instead.
	const selfMmsi = (): number => parseMmsi(app.getSelfPath("mmsi"));
	const selfName = (): string => {
		const n = app.getSelfPath("name");
		return typeof n === "string" ? n : "";
	};

	return [
		// AIS Class B Position Report (PGN 129039)
		{
			title: "AIS Class B Position (PGN 129039)",
			optionKey: "AIS_CLASS_B_POSITION",
			category: "ais",
			presets: ["full-ais"],
			keys: [
				"sensors.ais.class",
				"navigation.position",
				"navigation.courseOverGroundTrue",
				"navigation.speedOverGround",
				"navigation.headingTrue",
			],
			timeouts: Array(5).fill(DEFAULT_DATA_TIMEOUT_MS),
			callback: ((
				aisClass: string | null,
				position: Position | null,
				cog: number | null,
				sog: number | null,
				heading: number | null,
			) => {
				if (
					aisClass !== "B" ||
					typeof position !== "object" ||
					position == null ||
					!isValidNumber(position.latitude) ||
					!isValidNumber(position.longitude)
				) {
					return [];
				}

				// Drop the frame until self MMSI is published. parseMmsi() returns
				// 0 when the SK value is missing or unparseable, and emitting an
				// MMSI=0 AIS frame would broadcast as a malformed contact.
				const mmsi = selfMmsi();
				if (!mmsi) return [];

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129039,
						dst: N2K_BROADCAST_DST,
						fields: {
							messageId: "Standard Class B position report",
							repeatIndicator: "Initial",
							userId: mmsi,
							longitude: position.longitude,
							latitude: position.latitude,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "0",
							cog: isValidNumber(cog) ? normalizeAngle(cog) : undefined,
							sog: isValidNumber(sog) ? sog : undefined,
							aisTransceiverInformation: "Channel A VDL reception",
							heading: isValidNumber(heading)
								? normalizeAngle(heading)
								: undefined,
							regionalApplication: 0,
							unitType: "SOTDMA",
							integratedDisplay: "No",
							dsc: "Yes",
							band: "Top 525 kHz of marine band",
							canHandleMsg22: "Yes",
							aisMode: "Assigned",
							aisCommunicationState: "SOTDMA",
						},
					},
				];
			}) as ConversionCallback<
				[
					string | null,
					Position | null,
					number | null,
					number | null,
					number | null,
				]
			>,
			tests: [
				{
					skSelfData: { mmsi: "367301250" },
					input: [
						"B",
						{ latitude: 39.1296, longitude: -76.3947 },
						1.501,
						0.05,
						5.6199,
					],
					expected: [
						{
							prio: 2,
							pgn: 129039,
							dst: 255,
							fields: {
								aisCommunicationState: "SOTDMA",
								aisMode: "Assigned",
								aisTransceiverInformation: "Channel A VDL reception",
								band: "Top 525 kHz of marine band",
								canHandleMsg22: "Yes",
								cog: 1.501,
								dsc: "Yes",
								heading: 5.6199,
								integratedDisplay: "No",
								latitude: 39.1296,
								longitude: -76.3947,
								messageId: "Standard Class B position report",
								positionAccuracy: "Low",
								raim: "not in use",
								regionalApplication: 0,
								repeatIndicator: "Initial",
								sog: 0.05,
								timeStamp: "0",
								unitType: "SOTDMA",
								userId: 367301250,
							},
						},
					],
				},
			],
		},

		// AIS Class B Extended Position Report (PGN 129040)
		{
			title: "AIS Class B Extended (PGN 129040)",
			optionKey: "AIS_CLASS_B_EXTENDED",
			category: "ais",
			presets: ["full-ais"],
			keys: [
				"sensors.ais.class",
				"navigation.position",
				"navigation.courseOverGroundTrue",
				"navigation.speedOverGround",
				"navigation.headingTrue",
				"design.aisShipType",
				"sensors.ais.fromCenter",
				"sensors.ais.fromBow",
				"design.length",
				"design.beam",
			],
			timeouts: Array(10).fill(DEFAULT_DATA_TIMEOUT_MS),
			callback: ((
				aisClass: string | null,
				position: Position | null,
				cog: number | null,
				sog: number | null,
				heading: number | null,
				shipType: AisShipType | null,
				fromCenter: number | null,
				fromBow: number | null,
				length: number | null,
				beam: number | null,
			) => {
				if (
					aisClass !== "B" ||
					typeof position !== "object" ||
					position == null ||
					!isValidNumber(position.latitude) ||
					!isValidNumber(position.longitude)
				) {
					return [];
				}

				// Drop until self MMSI is published; see PGN 129039 above.
				const mmsi = selfMmsi();
				if (!mmsi) return [];

				const fromStarboard = starboardOffset(beam, fromCenter);

				// canboat SHIP_TYPE is a numeric LOOKUP. Passing the SK
				// `shipType.id` directly avoids the silent-encode-as-zero
				// failure mode of passing an unmatched string label.
				const typeOfShip = isValidNumber(shipType?.id)
					? shipType.id
					: undefined;

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129040,
						dst: N2K_BROADCAST_DST,
						fields: {
							messageId: "Extended Class B position report",
							repeatIndicator: "Initial",
							userId: mmsi,
							longitude: position.longitude,
							latitude: position.latitude,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "0",
							cog: isValidNumber(cog) ? normalizeAngle(cog) : undefined,
							sog: isValidNumber(sog) ? sog : undefined,
							aisTransceiverInformation: "Channel A VDL reception",
							trueHeading: isValidNumber(heading)
								? normalizeAngle(heading)
								: undefined,
							typeOfShip,
							length: isValidNumber(length) ? length : undefined,
							beam: isValidNumber(beam) ? beam : undefined,
							positionReferenceFromStarboard: fromStarboard,
							positionReferenceFromBow: isValidNumber(fromBow)
								? fromBow
								: undefined,
							name: clampString(selfName(), AIS_NAME_CHARS),
							dte: "Available",
							aisMode: "Assigned",
						},
					},
				];
			}) as ConversionCallback<
				[
					string | null,
					Position | null,
					number | null,
					number | null,
					number | null,
					AisShipType | null,
					number | null,
					number | null,
					number | null,
					number | null,
				]
			>,
			tests: [
				{
					skSelfData: { mmsi: "367301250", name: "MY VESSEL" },
					input: [
						"B",
						{ latitude: 39.1296, longitude: -76.3947 },
						1.501,
						0.05,
						5.6199,
						{ id: 36, name: "Sailing" },
						0,
						9,
						30,
						7,
					],
					expected: [
						{
							prio: 2,
							pgn: 129040,
							dst: 255,
							fields: {
								aisMode: "Assigned",
								aisTransceiverInformation: "Channel A VDL reception",
								beam: 7,
								cog: 1.501,
								dte: "Available",
								latitude: 39.1296,
								length: 30,
								longitude: -76.3947,
								messageId: "Extended Class B position report",
								name: "MY VESSEL",
								positionAccuracy: "Low",
								positionReferenceFromBow: 9,
								positionReferenceFromStarboard: 3.5,
								raim: "not in use",
								repeatIndicator: "Initial",
								sog: 0.05,
								timeStamp: "0",
								trueHeading: 5.6199,
								// Callback emits the numeric LOOKUP id (36 for Sailing). The
								// canboatjs decoder used by the test harness round-trips the id
								// back to its enum label "Sailing", which is what we assert
								// against. Do NOT "fix" this by encoding the string label in
								// the callback: passing an unmatched string encodes silently
								// as zero.
								typeOfShip: "Sailing",
								userId: 367301250,
							},
						},
					],
				},
			],
		},

		// AIS SAR Aircraft Position Report (PGN 129798)
		{
			title: "AIS SAR Aircraft Position (PGN 129798)",
			optionKey: "AIS_SAR_AIRCRAFT",
			category: "ais",
			presets: ["full-ais"],
			// Altitude is read from the position value (position.altitude),
			// not a non-canonical navigation.altitude top-level path.
			keys: [
				"sensors.ais.class",
				"navigation.position",
				"navigation.courseOverGroundTrue",
				"navigation.speedOverGround",
			],
			timeouts: Array(4).fill(DEFAULT_DATA_TIMEOUT_MS),
			callback: ((
				aisClass: string | null,
				position: Position | null,
				cog: number | null,
				sog: number | null,
			) => {
				if (
					aisClass !== "SAR" ||
					typeof position !== "object" ||
					position == null ||
					!isValidNumber(position.latitude) ||
					!isValidNumber(position.longitude)
				) {
					return [];
				}

				// Drop until self MMSI is published; see PGN 129039 above.
				const mmsi = selfMmsi();
				if (!mmsi) return [];

				const altitude = position.altitude;

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129798,
						dst: N2K_BROADCAST_DST,
						fields: {
							messageId: "Standard SAR aircraft position report",
							repeatIndicator: "Initial",
							userId: mmsi,
							longitude: position.longitude,
							latitude: position.latitude,
							positionAccuracy: "High",
							raim: "in use",
							timeStamp: "0",
							cog: isValidNumber(cog) ? normalizeAngle(cog) : undefined,
							sog: isValidNumber(sog) ? sog : undefined,
							aisTransceiverInformation: "Channel A VDL reception",
							altitude: isValidNumber(altitude) ? altitude : undefined,
							dte: "Available",
						},
					},
				];
			}) as ConversionCallback<
				[string | null, Position | null, number | null, number | null]
			>,
			tests: [
				{
					skSelfData: { mmsi: "111000001" },
					input: [
						"SAR",
						{ latitude: 40.7128, longitude: -74.006, altitude: 500 },
						0.7854,
						25.7,
					],
					expected: [
						{
							prio: 2,
							pgn: 129798,
							dst: 255,
							fields: {
								aisTransceiverInformation: "Channel A VDL reception",
								altitude: 500,
								cog: 0.7854,
								dte: "Available",
								latitude: 40.7128,
								longitude: -74.006,
								messageId: "Standard SAR aircraft position report",
								positionAccuracy: "High",
								raim: "in use",
								repeatIndicator: "Initial",
								sog: 25.7,
								timeStamp: "0",
								userId: 111000001,
							},
						},
					],
				},
				{
					// Regression: a negative COG is normalized into [0, 2pi) before
					// the unsigned PGN 129798 field. -0.5 rad wraps to 5.7832 rad.
					skSelfData: { mmsi: "111000001" },
					input: [
						"SAR",
						{ latitude: 40.7128, longitude: -74.006, altitude: 500 },
						-0.5,
						25.7,
					],
					expected: [
						{
							prio: 2,
							pgn: 129798,
							dst: 255,
							fields: {
								aisTransceiverInformation: "Channel A VDL reception",
								altitude: 500,
								cog: 5.7832,
								dte: "Available",
								latitude: 40.7128,
								longitude: -74.006,
								messageId: "Standard SAR aircraft position report",
								positionAccuracy: "High",
								raim: "in use",
								repeatIndicator: "Initial",
								sog: 25.7,
								timeStamp: "0",
								userId: 111000001,
							},
						},
					],
				},
			],
		},

		// AIS Safety Related Broadcast Message (PGN 129802)
		//
		// Broadcasting AIS safety messages may be regulated in some
		// jurisdictions (transmit-class AIS station licensing, e.g. FCC ship
		// station licence in the US). This conversion is disable-by-default;
		// operators must opt in via the plugin config and are responsible for
		// confirming local rules permit transmit on AIS frequencies before
		// enabling.
		//
		// Per ITU-R M.1371, transmit only if your vessel has a licensed AIS
		// transceiver and the configured MMSI matches it.
		{
			title: "AIS Safety Related Broadcast Message (PGN 129802)",
			optionKey: "AIS_SAFETY_MESSAGE",
			category: "ais",
			presets: ["full-ais"],
			// communication.ais.safetyMessage is not part of the canonical
			// Signal K v1 schema; it is a convention used by AIS-aware
			// upstream providers. Requires such a provider.
			keys: ["communication.ais.safetyMessage"],
			timeouts: [SAFETY_MESSAGE_TIMEOUT_MS],
			callback: ((safetyMessage: string | null) => {
				if (typeof safetyMessage !== "string") {
					return [];
				}

				// Drop until self MMSI is published; see PGN 129039 above.
				const mmsi = selfMmsi();
				if (!mmsi) return [];

				// "Satety related" is the canonical canboat enum string;
				// the misspelling lives in the upstream lookup table.
				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129802,
						dst: N2K_BROADCAST_DST,
						fields: {
							messageId: "Satety related broadcast message",
							repeatIndicator: "Initial",
							sourceId: mmsi,
							reserved: 1,
							aisTransceiverInformation: "Channel A VDL reception",
							safetyRelatedText: clampString(
								safetyMessage,
								AIS_SAFETY_TEXT_CHARS,
							),
						},
					},
				];
			}) as ConversionCallback<[string | null]>,
			tests: [
				{
					skSelfData: { mmsi: "367301250" },
					input: ["STORM WARNING: SEVERE WEATHER APPROACHING FROM WEST"],
					expected: [
						{
							prio: 2,
							pgn: 129802,
							dst: 255,
							fields: {
								messageId: "Satety related broadcast message",
								repeatIndicator: "Initial",
								sourceId: 367301250,
								reserved: 1,
								aisTransceiverInformation: "Channel A VDL reception",
								safetyRelatedText:
									"STORM WARNING: SEVERE WEATHER APPROACHING FROM WEST",
							},
						},
					],
				},
			],
		},
	];
}
