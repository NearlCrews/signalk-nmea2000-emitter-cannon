import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";

/**
 * Leeway conversion module - converts Signal K leeway angle to NMEA 2000 PGN 128000
 */
export default function createLeewayConversion(
	app: SignalKApp,
): ConversionModule<[number | null]> {
	return {
		title: "Leeway (128000)",
		optionKey: "LEEWAY",
		keys: ["performance.leeway"],
		callback: ((leeway: number | null) => {
			try {
				// Validate leeway input - required field
				if (typeof leeway !== "number") {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 128000,
						dst: N2K_BROADCAST_DST,
						fields: {
							leewayAngle: leeway,
						},
					},
				];
			} catch (err) {
				app.error(err instanceof Error ? err.message : String(err));
				return [];
			}
		}) as ConversionCallback<[number | null]>,

		tests: [
			{
				input: [0.24],
				expected: [
					{
						prio: 2,
						pgn: 128000,
						dst: 255,
						fields: {
							leewayAngle: 0.24,
						},
					},
				],
			},
			{
				input: [-0.15], // Negative leeway
				expected: [
					{
						prio: 2,
						pgn: 128000,
						dst: 255,
						fields: {
							leewayAngle: -0.15,
						},
					},
				],
			},
		],
	};
}
