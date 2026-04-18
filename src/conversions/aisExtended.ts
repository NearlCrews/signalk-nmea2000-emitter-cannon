import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
	SignalKPlugin,
} from "../types/index.js";

interface Position {
	latitude?: number;
	longitude?: number;
}

interface AisShipType {
	id?: number;
	name?: string;
}

export default function createAisExtendedConversions(
	_app: SignalKApp,
	_plugin: SignalKPlugin,
): ConversionModule<unknown[]>[] {
	return [
		// AIS Class B Position Report (PGN 129039)
		{
			title: "AIS Class B Position Report (129039)",
			optionKey: "AIS_CLASS_B_POSITION",
			keys: [
				"sensors.ais.class",
				"navigation.position",
				"navigation.courseOverGroundTrue",
				"navigation.speedOverGround",
				"navigation.headingTrue",
				"sensors.ais.fromCenter",
				"sensors.ais.fromBow",
				"design.length",
				"design.beam",
			],
			timeouts: [10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000], // 10 seconds
			callback: ((
				aisClass: string | null,
				position: Position | null,
				cog: number | null,
				sog: number | null,
				heading: number | null,
				_fromCenter: number | null,
				_fromBow: number | null,
				_length: number | null,
				_beam: number | null,
			) => {
				if (
					aisClass !== "B" ||
					typeof position !== "object" ||
					position == null ||
					!position.latitude ||
					!position.longitude
				) {
					return [];
				}

				const pos = position as Position;

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129039,
						dst: N2K_BROADCAST_DST,
						fields: {
							messageId: "Standard Class B position report",
							repeatIndicator: "Initial",
							userId: 123456789, // Should be derived from MMSI
							longitude: pos.longitude,
							latitude: pos.latitude,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "0",
							cog: typeof cog === "number" ? cog : undefined,
							sog: typeof sog === "number" ? sog : undefined,
							aisTransceiverInformation: "Channel A VDL reception",
							heading: typeof heading === "number" ? heading : undefined,
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
					number | null,
					number | null,
					number | null,
					number | null,
				]
			>,
			tests: [
				{
					input: [
						"B",
						{ latitude: 39.1296, longitude: -76.3947 },
						1.501,
						0.05,
						5.6199,
						0,
						9,
						30,
						7,
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
								userId: 123456789,
							},
						},
					],
				},
			],
		},

		// AIS Class B Extended Position Report (PGN 129040)
		{
			title: "AIS Class B Extended Position Report (129040)",
			optionKey: "AIS_CLASS_B_EXTENDED",
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
			timeouts: [
				10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000,
			],
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
					!position.latitude ||
					!position.longitude
				) {
					return [];
				}

				const pos = position as Position;

				// Calculate position reference points
				let fromStarboard: number | null = null;
				if (typeof beam === "number" && typeof fromCenter === "number") {
					fromStarboard = beam / 2 + fromCenter;
				}

				const shipTypeName = shipType?.name || "Sailing";

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129040,
						dst: N2K_BROADCAST_DST,
						fields: {
							messageId: "Extended Class B position report",
							repeatIndicator: "Initial",
							userId: 123456789, // Should be derived from MMSI
							longitude: pos.longitude,
							latitude: pos.latitude,
							positionAccuracy: "Low",
							raim: "not in use",
							timeStamp: "0",
							cog: typeof cog === "number" ? cog : undefined,
							sog: typeof sog === "number" ? sog : undefined,
							aisTransceiverInformation: "Channel A VDL reception",
							heading: typeof heading === "number" ? heading : undefined,
							typeOfShip: shipTypeName,
							length: typeof length === "number" ? length : undefined,
							beam: typeof beam === "number" ? beam : undefined,
							positionReferenceFromStarboard: fromStarboard,
							positionReferenceFromBow:
								typeof fromBow === "number" ? fromBow : undefined,
							name: "UNKNOWN", // Should be derived from vessel data
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
								name: "UNKNOWN",
								positionAccuracy: "Low",
								positionReferenceFromBow: 9,
								positionReferenceFromStarboard: 3.5,
								raim: "not in use",
								repeatIndicator: "Initial",
								sog: 0.05,
								timeStamp: "0",
								typeOfShip: "Sailing",
								userId: 123456789,
							},
						},
					],
				},
			],
		},

		// AIS SAR Aircraft Position Report (PGN 129798)
		{
			title: "AIS SAR Aircraft Position Report (129798)",
			optionKey: "AIS_SAR_AIRCRAFT",
			keys: [
				"sensors.ais.class",
				"navigation.position",
				"navigation.courseOverGroundTrue",
				"navigation.speedOverGround",
				"navigation.altitude",
			],
			timeouts: [5000, 5000, 5000, 5000, 5000], // 5 seconds for aircraft
			callback: ((
				aisClass: string | null,
				position: Position | null,
				cog: number | null,
				sog: number | null,
				altitude: number | null,
			) => {
				if (
					aisClass !== "SAR" ||
					typeof position !== "object" ||
					position == null ||
					!position.latitude ||
					!position.longitude
				) {
					return [];
				}

				const pos = position as Position;

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129798,
						dst: N2K_BROADCAST_DST,
						fields: {
							messageId: "Standard SAR aircraft position report",
							repeatIndicator: "Initial",
							userId: 111000001, // SAR aircraft MMSI format
							longitude: pos.longitude,
							latitude: pos.latitude,
							positionAccuracy: "High",
							raim: "in use",
							timeStamp: "0",
							cog: typeof cog === "number" ? cog : undefined,
							sog: typeof sog === "number" ? sog : undefined,
							aisTransceiverInformation: "Channel A VDL reception",
							altitude: typeof altitude === "number" ? altitude : 0,
							dte: "Available",
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
					input: [
						"SAR",
						{ latitude: 40.7128, longitude: -74.006 },
						0.7854, // 45 degrees
						25.7, // 50 knots
						500, // 500 meters altitude
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
			],
		},

		// AIS Safety Related Broadcast Message (PGN 129802)
		{
			title: "AIS Safety Related Broadcast Message (129802)",
			optionKey: "AIS_SAFETY_MESSAGE",
			keys: [
				"communication.ais.safetyMessage",
				"communication.ais.safetyMessageSeqId",
			],
			timeouts: [300000, 300000], // 5 minutes
			callback: ((safetyMessage: string | null, seqId: number | null) => {
				if (typeof safetyMessage !== "string") {
					return [];
				}

				const sequenceId = typeof seqId === "number" ? seqId : 0;

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129802,
						dst: N2K_BROADCAST_DST,
						fields: {
							messageId: "Satety related broadcast message",
							repeatIndicator: "Initial",
							userId: 123456789, // Should be derived from MMSI
							sequenceId: sequenceId,
							destinationId: 0, // Broadcast
							retransmitFlag: "No retransmission",
							safetyText: safetyMessage.substring(0, 156), // Max 156 characters
							reserved: 1,
						},
					},
				];
			}) as ConversionCallback<[string | null, number | null]>,
			tests: [
				{
					input: ["STORM WARNING: SEVERE WEATHER APPROACHING FROM WEST", 1],
					expected: [
						{
							prio: 2,
							pgn: 129802,
							dst: 255,
							fields: {
								messageId: "Satety related broadcast message",
								repeatIndicator: "Initial",
								reserved: 1,
							},
						},
					],
				},
			],
		},
	];
}
