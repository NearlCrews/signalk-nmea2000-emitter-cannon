import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

export default function createEnvironmentParametersConversion(
	_app: SignalKApp,
): ConversionModule<[number | null]> {
	return {
		title: "Atmospheric Pressure (130311)",
		optionKey: "ENVIRONMENT_PARAMETERS",
		keys: ["environment.outside.pressure"],
		callback: ((pressure: number | null) => {
			if (!isValidNumber(pressure)) {
				return [];
			}
			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 130311,
					dst: N2K_BROADCAST_DST,
					fields: {
						atmosphericPressure: pressure,
					},
				},
			];
		}) as ConversionCallback<[number | null]>,

		tests: [
			{
				input: [3507100],
				expected: [
					{
						prio: 2,
						pgn: 130311,
						dst: 255,
						fields: {
							atmosphericPressure: 3507100,
						},
					},
				],
			},
		],
	};
}
