import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_DEFAULT_SID,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber, normalizeAngle } from "../utils/validation.js";

// Shared PGN 130306 (Wind Data) builder. Every wind-130306 module (apparent,
// true-over-water, true-over-ground, weather-forecast apparent) differs only
// in title, optionKey, the two source paths, the N2K `reference` label, and
// the panel category, so they all delegate here.
export function createWind130306Conversion(
	_app: SignalKApp,
	config: {
		title: string;
		optionKey: string;
		keys: [string, string];
		reference: string;
		category?: ConversionModule["category"];
		presets?: ConversionModule["presets"];
	},
): ConversionModule {
	const module: ConversionModule = {
		title: config.title,
		optionKey: config.optionKey,
		category: config.category ?? "navigation",
		keys: config.keys,
		callback: (angle: unknown, speed: unknown): N2KMessage[] => {
			if (!isValidNumber(angle) && !isValidNumber(speed)) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 130306,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_DEFAULT_SID,
						windSpeed: isValidNumber(speed) ? speed : undefined,
						windAngle: isValidNumber(angle) ? normalizeAngle(angle) : undefined,
						reference: config.reference,
					},
				},
			];
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
							sid: 87,
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
							sid: 87,
							windSpeed: 1.5,
							windAngle: 4.1888,
							reference: config.reference,
						},
					},
				],
			},
			{
				input: [2.0944, null],
				expected: [
					{
						pgn: 130306,
						dst: 255,
						prio: 2,
						fields: {
							sid: 87,
							windAngle: 2.0944,
							reference: config.reference,
						},
					},
				],
			},
			{
				input: [null, 1.2],
				expected: [
					{
						pgn: 130306,
						dst: 255,
						prio: 2,
						fields: {
							sid: 87,
							windSpeed: 1.2,
							reference: config.reference,
						},
					},
				],
			},
			{
				input: [null, null],
				expected: [],
			},
		],
	};
	if (config.presets) {
		module.presets = config.presets;
	}
	return module;
}

export default function createWindTrueWaterConversion(
	app: SignalKApp,
): ConversionModule {
	return createWind130306Conversion(app, {
		title: "Wind True Over Water (PGN 130306)",
		optionKey: "WIND_TRUE",
		keys: ["environment.wind.angleTrueWater", "environment.wind.speedTrue"],
		reference: "True (boat referenced)",
	});
}
