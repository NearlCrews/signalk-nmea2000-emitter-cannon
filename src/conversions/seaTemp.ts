import {
	MAX_PRESSURE_PA,
	MAX_TEMPERATURE_K,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { toFiniteInRange } from "../utils/validation.js";

export default function createSeaTempConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Environmental Parameters, obsolete (PGN 130310)",
		optionKey: "SEA_TEMP",
		category: "environment",
		keys: [
			"environment.water.temperature",
			"environment.outside.temperature",
			"environment.outside.pressure",
		],
		callback: (water: unknown, air: unknown, pressure: unknown): N2KMessage[] => {
			// All three PGN 130310 fields are unsigned, so an out-of-range value
			// wraps rather than being rejected. Its PGN 130311 sibling already
			// range checks the same quantities.
			const waterTemperature = toFiniteInRange(water, 0, MAX_TEMPERATURE_K) ?? null;
			const outsideTemperature = toFiniteInRange(air, 0, MAX_TEMPERATURE_K) ?? null;
			const atmosphericPressure = toFiniteInRange(pressure, 0, MAX_PRESSURE_PA) ?? null;

			if (
				waterTemperature === null &&
				outsideTemperature === null &&
				atmosphericPressure === null
			) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 130310,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_SID_ZERO,
						waterTemperature,
						outsideAmbientAirTemperature: outsideTemperature,
						atmosphericPressure,
					},
				},
			];
		},

		tests: [
			{
				input: [281.2, 291, 20100],
				expected: [
					{
						prio: 2,
						pgn: 130310,
						dst: 255,
						fields: {
							sid: 0,
							waterTemperature: 281.2,
							outsideAmbientAirTemperature: 291,
							atmosphericPressure: 20100,
						},
					},
				],
			},
		],
	};
}
