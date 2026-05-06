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
import { isValidNumber } from "../utils/validation.js";

export default function createRateOfTurnConversion(
	app: SignalKApp,
): ConversionModule {
	return {
		title: "Rate of Turn (127251)",
		optionKey: "RATE_OF_TURN",
		keys: ["navigation.rateOfTurn"],
		callback: (rateOfTurn: unknown): N2KMessage[] => {
			try {
				if (!isValidNumber(rateOfTurn)) {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127251,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_SID_ZERO,
							rate: rateOfTurn,
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
				input: [0.0175], // 1 degree per second
				expected: [
					{
						prio: 2,
						pgn: 127251,
						dst: 255,
						fields: {
							sid: 0,
							rate: 0.0175,
						},
					},
				],
			},
			{
				input: [-0.0349], // 2 degrees per second, port turn
				expected: [
					{
						prio: 2,
						pgn: 127251,
						dst: 255,
						fields: {
							sid: 0,
							rate: -0.0349,
						},
					},
				],
			},
		],
	};
}
