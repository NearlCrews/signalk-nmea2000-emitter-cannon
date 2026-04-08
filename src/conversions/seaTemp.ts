import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";

/**
 * Sea/Air Temperature conversion module - converts Signal K environmental data to NMEA 2000 PGN 130310
 */
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
				// Validate inputs
				const waterTemperature = typeof water === "number" ? water : null;
				const outsideTemperature = typeof air === "number" ? air : null;
				const atmosphericPressure =
					typeof pressure === "number" ? pressure : null;

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 130310,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: 0xff,
							waterTemperature,
							outsideAmbientAirTemperature: outsideTemperature,
							atmosphericPressure,
						},
					},
				];
			} catch (err) {
				app.error(err instanceof Error ? err.message : String(err));
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
