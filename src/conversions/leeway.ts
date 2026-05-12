import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

export default function createLeewayConversion(
	_app: SignalKApp,
): ConversionModule<[number | null]> {
	return {
		title: "Leeway Angle (PGN 128000)",
		optionKey: "LEEWAY",
		category: "navigation",
		keys: ["navigation.leewayAngle"],
		callback: ((leeway: number | null) => {
			if (!isValidNumber(leeway)) {
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
				input: [-0.15],
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
