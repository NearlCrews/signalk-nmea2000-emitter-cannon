import {
	DEFAULT_DATA_TIMEOUT_MS,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
} from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { isValidNumber, toValidNumber } from "../utils/validation.js";

const TRANSMISSION_TIMEOUTS = [
	DEFAULT_DATA_TIMEOUT_MS,
	DEFAULT_DATA_TIMEOUT_MS,
	DEFAULT_DATA_TIMEOUT_MS,
	DEFAULT_DATA_TIMEOUT_MS,
];

// Map the canonical SK propulsion.<id>.transmission.gear enum directly to
// the canboat TRANSMISSION_GEAR LOOKUP labels. SK values are lowercase
// ("forward"/"neutral"/"reverse"); the spec also defines "fault".
const SK_GEAR_TO_N2K: Record<string, string> = {
	forward: "Forward",
	neutral: "Neutral",
	reverse: "Reverse",
	fault: "Fault",
};

export default function createTransmissionParametersConversion(): ConversionModule {
	return {
		title: "Transmission Parameters (PGN 127493)",
		optionKey: "TRANSMISSION_PARAMETERS",
		category: "engine",
		presets: ["engine-set"],
		// Read gear from the canonical propulsion.<id>.transmission.gear enum
		// (Forward / Neutral / Reverse / Fault), not from the sign of the
		// gearRatio: the discreteStatus1/2 leaves used previously are not in
		// the v1 schema.
		keys: [
			"propulsion.main.transmission.gear",
			"propulsion.main.transmission.gearRatio",
			"propulsion.main.transmission.oilPressure",
			"propulsion.main.transmission.oilTemperature",
		],
		timeouts: TRANSMISSION_TIMEOUTS,
		callback: (
			gear: unknown,
			gearRatio: unknown,
			oilPressure: unknown,
			oilTemperature: unknown,
		): N2KMessage[] => {
			if (
				typeof gear !== "string" &&
				!isValidNumber(gearRatio) &&
				!isValidNumber(oilPressure) &&
				!isValidNumber(oilTemperature)
			) {
				return [];
			}

			let transmissionGear: string | undefined;
			if (typeof gear === "string") {
				transmissionGear = SK_GEAR_TO_N2K[gear.toLowerCase()];
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
						discreteStatus1: 0,
					},
				},
			];
		},
		tests: [
			{
				input: ["forward", 2.5, 345000, 353.15],
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
				input: ["reverse", -1.5, 320000, 343.15],
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
				input: ["neutral", 0, 310000, 333.15],
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
