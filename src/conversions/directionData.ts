import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";

/**
 * Direction Data conversion module - converts Signal K navigation directions to NMEA 2000 PGN 130577
 */
export default function createDirectionDataConversion(
	app: SignalKApp,
): ConversionModule<
	[number | null, number | null, number | null, number | null]
> {
	return {
		title: "Direction Data (130577)",
		optionKey: "DIRECTION_DATA",
		keys: [
			"navigation.courseOverGroundTrue",
			"navigation.courseOverGroundMagnetic",
			"navigation.headingTrue",
			"navigation.headingMagnetic",
		],
		callback: ((
			cogTrue: number | null,
			cogMagnetic: number | null,
			headingTrue: number | null,
			headingMagnetic: number | null,
		) => {
			try {
				// Send direction data if we have at least one direction value
				if (
					cogTrue === null &&
					cogMagnetic === null &&
					headingTrue === null &&
					headingMagnetic === null
				) {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 130577,
						dst: N2K_BROADCAST_DST,
						fields: {
							dataMode: "Autonomous", // Could be made configurable
							cogReference:
								cogTrue !== null
									? "True"
									: cogMagnetic !== null
										? "Magnetic"
										: "Unavailable",
							sidForCog: 0,
							cog: cogTrue ?? cogMagnetic,
							sogReference: "Unavailable", // Would need SOG data source info
							sidForSog: 0,
							sog: null, // This PGN focuses on direction, not speed
							headingReference:
								headingTrue !== null
									? "True"
									: headingMagnetic !== null
										? "Magnetic"
										: "Unavailable",
							sidForHeading: 0,
							heading: headingTrue ?? headingMagnetic,
							speedThroughWaterReference: "Unavailable",
							sidForStw: 0,
							speedThroughWater: null,
							set: null, // Current set - not typically available
							drift: null, // Current drift - not typically available
						},
					},
				];
			} catch (err) {
				app.error(err instanceof Error ? err.message : String(err));
				return [];
			}
		}) as ConversionCallback<
			[number | null, number | null, number | null, number | null]
		>,

		tests: [
			{
				input: [1.571, null, 1.396, null, 0.785, null, null, null], // 90° COG true, 80° heading true, 45° rhumb bearing
				expected: [
					{
						prio: 2,
						pgn: 130577,
						dst: 255,
						fields: {
							cog: 1.571,
							cogReference: "True",
							dataMode: "Autonomous",
							heading: 1.396,
						},
					},
				],
			},
			{
				input: [null, 1.047, null, 0.698, null, null, null, null], // 60° COG magnetic, 40° heading magnetic
				expected: [
					{
						prio: 2,
						pgn: 130577,
						dst: 255,
						fields: {
							cog: 1.047,
							cogReference: "Magnetic",
							dataMode: "Autonomous",
							heading: 0.698,
						},
					},
				],
			},
			{
				// Due north: cogTrue=0, headingTrue=0. With || fallback, zero is falsy
				// and cog/heading would wrongly fall through to magnetic values.
				input: [0, 1.047, 0, 0.698, null, null, null, null],
				expected: [
					{
						prio: 2,
						pgn: 130577,
						dst: 255,
						fields: {
							cog: 0,
							cogReference: "True",
							dataMode: "Autonomous",
							heading: 0,
						},
					},
				],
			},
		],
	};
}
