import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_DEFAULT_SID,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber, normalizeAngle } from "../utils/validation.js";

export default function createWindConversion(
	_app: SignalKApp,
): ConversionModule<[number | null, number | null]> {
	return {
		title: "Wind (PGN 130306)",
		optionKey: "WIND",
		keys: ["environment.wind.angleApparent", "environment.wind.speedApparent"],
		callback: ((angle: number | null, speed: number | null) => {
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
						reference: "Apparent",
					},
				},
			];
		}) as ConversionCallback<[number | null, number | null]>,

		tests: [
			{
				input: [2.0944, 1.2],
				expected: [
					{
						prio: 2,
						pgn: 130306,
						dst: 255,
						fields: {
							sid: 87,
							windSpeed: 1.2,
							windAngle: 2.0944,
							reference: "Apparent",
						},
					},
				],
			},
			{
				input: [-2.0944, 1.5],
				expected: [
					{
						prio: 2,
						pgn: 130306,
						dst: 255,
						fields: {
							sid: 87,
							windSpeed: 1.5,
							windAngle: 4.1888,
							reference: "Apparent",
						},
					},
				],
			},
			{
				input: [2.0944, null],
				expected: [
					{
						prio: 2,
						pgn: 130306,
						dst: 255,
						fields: {
							sid: 87,
							windAngle: 2.0944,
							reference: "Apparent",
						},
					},
				],
			},
			{
				input: [null, 1.2],
				expected: [
					{
						prio: 2,
						pgn: 130306,
						dst: 255,
						fields: {
							sid: 87,
							windSpeed: 1.2,
							reference: "Apparent",
						},
					},
				],
			},
		],
	};
}
