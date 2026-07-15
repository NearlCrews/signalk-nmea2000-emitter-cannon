import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

export default function createEnvironmentParametersConversion(
	_app: SignalKApp,
): ConversionModule<[number | null]> {
	return {
		title: "Environmental Parameters (PGN 130311)",
		optionKey: "ENVIRONMENT_PARAMETERS",
		category: "environment",
		presets: ["environmental"],
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
				// 101300 Pa = 1013 hPa, a realistic sea-level pressure and an
				// exact multiple of the field's 100 Pa resolution.
				input: [101300],
				expected: [
					{
						prio: 2,
						pgn: 130311,
						dst: 255,
						fields: {
							atmosphericPressure: 101300,
						},
					},
				],
			},
		],
	};
}
