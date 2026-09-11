import {
	DEFAULT_DATA_TIMEOUT_MS,
	MAX_OIL_TEMPERATURE_K,
	MAX_PRESSURE_PA,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
} from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { toFiniteInRange } from "../utils/validation.js";

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

			// Both oil fields are the unsigned PGN 127489 fields under different
			// PGN numbers: 100 Pa pressure and 0.1 K temperature. They wrap rather
			// than rejecting an out-of-range value, so a gearbox sender publishing
			// Celsius instead of the Kelvin the Signal K spec calls for sent -5 to
			// the receiver as 6548.6 K, and a negative reading from a failing oil
			// pressure sender arrived as 6453600 Pa, or 64 bar.
			const pressure = toFiniteInRange(oilPressure, 0, MAX_PRESSURE_PA);
			const temperature = toFiniteInRange(oilTemperature, 0, MAX_OIL_TEMPERATURE_K);

			// Test the mapped gear, not the raw string. GEAR_STATUS has no "fault"
			// member, so a fault gear with both oil values absent would otherwise
			// emit a frame whose only content is the instance and an empty status
			// array. The sibling engine conversions guard the same way.
			if (transmissionGear === undefined && pressure === undefined && temperature === undefined) {
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
						oilPressure: pressure,
						oilTemperature: temperature,
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
			{
				// Regression on both unsigned oil fields, which wrap rather than
				// rejecting an out-of-range reading. A gearbox sender publishing
				// Celsius instead of Kelvin sent -5 to the receiver as 6548.6 K, and
				// a negative reading from a failing oil pressure sender arrived as
				// 6453600 Pa, or 64 bar. Both are now omitted, which the receiver
				// reads as not available, and the gear still rides the frame.
				input: ["forward", -100000, -5],
				expected: [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127493,
						dst: N2K_BROADCAST_DST,
						fields: {
							instance: "Single Engine or Dual Engine Port",
							transmissionGear: "Forward",
							discreteStatus1: 0,
						},
					},
				],
			},
			{
				// The same two fields wrap at the top of their ranges: an oil
				// temperature of 7000 K reached the receiver as 446.4 K, and an oil
				// pressure of 7000000 Pa as 446400 Pa. With an unmapped gear as well
				// there is nothing left to carry, so the frame is dropped rather
				// than emitted with an instance and an empty status array.
				input: ["fault", 7000000, 7000],
				expected: [],
			},
		],
	};
}
