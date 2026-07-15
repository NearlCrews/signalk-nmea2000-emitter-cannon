import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, N2K_SID_ZERO } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

export default function createRateOfTurnConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Rate of Turn (PGN 127251)",
		optionKey: "RATE_OF_TURN",
		category: "navigation",
		keys: ["navigation.rateOfTurn"],
		callback: (rateOfTurn: unknown): N2KMessage[] => {
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
		},

		tests: [
			{
				input: [0.0175],
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
				input: [-0.0349],
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
