import { DEFAULT_DATA_TIMEOUT_MS, N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { isValidNumber, toValidNumber } from "../utils/validation.js";

const TRANSMISSION_TIMEOUTS = [
	DEFAULT_DATA_TIMEOUT_MS,
	DEFAULT_DATA_TIMEOUT_MS,
	DEFAULT_DATA_TIMEOUT_MS,
];

// Map the canonical SK propulsion.<id>.transmission.gear enum to the canboat
// GEAR_STATUS LOOKUP labels. SK values are lowercase ("forward"/"neutral"/
// "reverse"). GEAR_STATUS has no "fault" member, so a fault gear is left
// unmapped and the transmissionGear field is omitted (data not available).
const SK_GEAR_TO_N2K: Record<string, string> = {
	forward: "Forward",
	neutral: "Neutral",
	reverse: "Reverse",
};

export default function createTransmissionParametersConversion(): ConversionModule {
	return {
		title: "Transmission Parameters (PGN 127493)",
		optionKey: "TRANSMISSION_PARAMETERS",
		category: "engine",
		presets: ["engine-set"],
		// Read gear from the canonical propulsion.<id>.transmission.gear enum
		// (Forward / Neutral / Reverse): the discreteStatus1/2 leaves used
		// previously are not in the v1 schema.
		//
		// KNOWN LIMITATION: single gearbox only. The path is hardcoded to
		// propulsion.main and the wire instance to 0, so a twin-engine boat
		// cannot emit its second gearbox. Fixing it means a per-engine factory
		// like ENGINE_PARAMETERS, which changes the persisted config shape and
		// needs its own extras editor: a feature, not a maintenance fix.
		keys: [
			"propulsion.main.transmission.gear",
			"propulsion.main.transmission.oilPressure",
			"propulsion.main.transmission.oilTemperature",
		],
		timeouts: TRANSMISSION_TIMEOUTS,
		callback: (gear: unknown, oilPressure: unknown, oilTemperature: unknown): N2KMessage[] => {
			let transmissionGear: string | undefined;
			if (typeof gear === "string") {
				transmissionGear = SK_GEAR_TO_N2K[gear.toLowerCase()];
			}

			// Test the mapped gear, not the raw string. GEAR_STATUS has no "fault"
			// member, so a fault gear with both oil values absent would otherwise
			// emit a frame whose only content is the instance and an empty status
			// array. The sibling engine conversions guard the same way.
			if (
				transmissionGear === undefined &&
				!isValidNumber(oilPressure) &&
				!isValidNumber(oilTemperature)
			) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 127493,
					dst: N2K_BROADCAST_DST,
					fields: {
						instance: 0,
						transmissionGear,
						oilPressure: toValidNumber(oilPressure) ?? undefined,
						oilTemperature: toValidNumber(oilTemperature) ?? undefined,
						// An empty array encodes no active status flags. The pinned
						// ts-pgns models this particular field as an 8-bit number (only
						// PGN 127489 has BITLOOKUP status fields), and an empty array
						// still encodes as 0, so this stays compatible either way.
						discreteStatus1: [],
					},
				},
			];
		},
		tests: [
			{
				input: ["forward", 345000, 353.15],
				expected: [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127493,
						dst: N2K_BROADCAST_DST,
						fields: {
							instance: "Single Engine or Dual Engine Port",
							transmissionGear: "Forward",
							oilPressure: 345000,
							oilTemperature: 353.1,
							discreteStatus1: 0,
						},
					},
				],
			},
			{
				input: ["reverse", 320000, 343.15],
				expected: [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127493,
						dst: N2K_BROADCAST_DST,
						fields: {
							instance: "Single Engine or Dual Engine Port",
							transmissionGear: "Reverse",
							oilPressure: 320000,
							oilTemperature: 343.1,
							discreteStatus1: 0,
						},
					},
				],
			},
			{
				input: ["neutral", 310000, 333.15],
				expected: [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127493,
						dst: N2K_BROADCAST_DST,
						fields: {
							instance: "Single Engine or Dual Engine Port",
							transmissionGear: "Neutral",
							oilPressure: 310000,
							oilTemperature: 333.1,
							discreteStatus1: 0,
						},
					},
				],
			},
		],
	};
}
