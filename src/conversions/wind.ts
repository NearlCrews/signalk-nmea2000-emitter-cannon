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
import { normalizeAngle, toValidNumber } from "../utils/validation.js";

/**
 * Wind conversion module - converts Signal K wind data to NMEA 2000 PGN 130306
 */
export default function createWindConversion(
	app: SignalKApp,
): ConversionModule<[number | null, number | null]> {
	return {
		title: "Wind (130306)",
		optionKey: "WIND",
		keys: ["environment.wind.angleApparent", "environment.wind.speedApparent"],
		callback: ((angle: number | null, speed: number | null) => {
			try {
				// Validate inputs (reject NaN/Infinity)
				const validAngle = toValidNumber(angle);
				const validSpeed = toValidNumber(speed);

				if (validAngle === null && validSpeed === null) {
					return [];
				}

				const normalizedAngle =
					validAngle !== null ? normalizeAngle(validAngle) : validAngle;

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 130306,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_DEFAULT_SID,
							windSpeed: validSpeed,
							windAngle: normalizedAngle,
							reference: "Apparent",
						},
					},
				];
			} catch (err) {
				app.error(err instanceof Error ? err.message : String(err));
				return [];
			}
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
				// Test with null values
				input: [null, 0],
				expected: [
					{
						prio: 2,
						pgn: 130306,
						dst: 255,
						fields: {
							sid: 87,
							windSpeed: 0,
							reference: "Apparent",
						},
					},
				],
			},
		],
	};
}
