import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber, normalizeAngle } from "../utils/validation.js";

export function createWindTrueConversion(
	app: SignalKApp,
	config: {
		title: string;
		optionKey: string;
		keys: [string, string];
		reference: string;
	},
): ConversionModule {
	return {
		title: config.title,
		optionKey: config.optionKey,
		keys: config.keys,
		callback: (angle: unknown, speed: unknown): N2KMessage[] => {
			if (!isValidNumber(angle) || !isValidNumber(speed)) {
				return [];
			}

			try {
				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 130306,
						dst: N2K_BROADCAST_DST,
						fields: {
							windSpeed: speed,
							windAngle: normalizeAngle(angle),
							reference: config.reference,
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
				input: [2.0944, 1.2],
				expected: [
					{
						pgn: 130306,
						dst: 255,
						prio: 2,
						fields: {
							windSpeed: 1.2,
							windAngle: 2.0944,
							reference: config.reference,
						},
					},
				],
			},
			{
				input: [-2.0944, 1.5],
				expected: [
					{
						pgn: 130306,
						dst: 255,
						prio: 2,
						fields: {
							windSpeed: 1.5,
							windAngle: 4.1888,
							reference: config.reference,
						},
					},
				],
			},
		],
	};
}

export default function createWindTrueWaterConversion(
	app: SignalKApp,
): ConversionModule {
	return createWindTrueConversion(app, {
		title: "Wind True over water (130306)",
		optionKey: "WIND_TRUE",
		keys: ["environment.wind.angleTrueWater", "environment.wind.speedTrue"],
		reference: "True (boat referenced)",
	});
}
