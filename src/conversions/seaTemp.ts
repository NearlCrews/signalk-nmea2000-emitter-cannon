import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { toValidNumber } from "../utils/validation.js";

export default function createSeaTempConversion(
	app: SignalKApp,
): ConversionModule {
	return {
		title: "Sea/Air Temp (130310)",
		optionKey: "SEA_TEMP",
		keys: [
			"environment.water.temperature",
			"environment.outside.temperature",
			"environment.outside.pressure",
		],
		callback: (
			water: unknown,
			air: unknown,
			pressure: unknown,
		): N2KMessage[] => {
			try {
				const waterTemperature = toValidNumber(water);
				const outsideTemperature = toValidNumber(air);
				const atmosphericPressure = toValidNumber(pressure);

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
			} catch (err) {
				app.error(errMessage(err));
				return [];
			}
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
