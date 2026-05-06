import {
	DEFAULT_DATA_TIMEOUT_MS,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
} from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

const TRANSMISSION_TIMEOUTS = [
	DEFAULT_DATA_TIMEOUT_MS,
	DEFAULT_DATA_TIMEOUT_MS,
	DEFAULT_DATA_TIMEOUT_MS,
	DEFAULT_DATA_TIMEOUT_MS,
	DEFAULT_DATA_TIMEOUT_MS,
];

export default function createTransmissionParametersConversion(): ConversionModule {
	return {
		title: "Transmission Parameters (127493)",
		optionKey: "TRANSMISSION_PARAMETERS",
		keys: [
			"propulsion.main.transmission.gearRatio",
			"propulsion.main.transmission.oilPressure",
			"propulsion.main.transmission.oilTemperature",
			"propulsion.main.transmission.discreteStatus1",
			"propulsion.main.transmission.discreteStatus2",
		],
		timeouts: TRANSMISSION_TIMEOUTS,
		callback: (
			gearRatio: unknown,
			oilPressure: unknown,
			oilTemperature: unknown,
			discreteStatus1: unknown,
			discreteStatus2: unknown,
		): N2KMessage[] => {
			if (
				!isValidNumber(gearRatio) &&
				!isValidNumber(oilPressure) &&
				!isValidNumber(oilTemperature)
			) {
				return [];
			}

			let transmissionGear = "Neutral";
			if (isValidNumber(gearRatio)) {
				if (gearRatio > 1) {
					transmissionGear = "Forward";
				} else if (gearRatio < 0) {
					transmissionGear = "Reverse";
				}
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 127493,
					dst: N2K_BROADCAST_DST,
					fields: {
						engineInstance: 0,
						transmissionGear,
						oilPressure: isValidNumber(oilPressure) ? oilPressure : undefined,
						oilTemperature: isValidNumber(oilTemperature)
							? oilTemperature
							: undefined,
						discreteStatus1: isValidNumber(discreteStatus1)
							? discreteStatus1
							: 0,
						discreteStatus2: isValidNumber(discreteStatus2)
							? discreteStatus2
							: 0,
					},
				},
			];
		},
		tests: [
			{
				input: [2.5, 345000, 353.15, 0, 0],
				expected: [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127493,
						dst: N2K_BROADCAST_DST,
						fields: {
							transmissionGear: "Forward",
							oilPressure: 345000,
							oilTemperature: 353.1,
							discreteStatus1: 0,
						},
					},
				],
			},
			{
				input: [-1.5, 320000, 343.15, 1, 0],
				expected: [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127493,
						dst: N2K_BROADCAST_DST,
						fields: {
							transmissionGear: "Reverse",
							oilPressure: 320000,
							oilTemperature: 343.1,
							discreteStatus1: 1,
						},
					},
				],
			},
		],
	};
}
