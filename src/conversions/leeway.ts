import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isValidNumber } from "../utils/validation.js";

export default function createLeewayConversion(
	app: SignalKApp,
): ConversionModule<[number | null]> {
	return {
		title: "Leeway (128000)",
		optionKey: "LEEWAY",
		keys: ["performance.leeway"],
		callback: ((leeway: number | null) => {
			try {
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
			} catch (err) {
				app.error(errMessage(err));
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
