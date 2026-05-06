import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { toValidNumber } from "../utils/validation.js";

export default function createSetDriftConversion(
	app: SignalKApp,
): ConversionModule {
	return {
		title: "Set/Drift (129291)",
		optionKey: "SET_DRIFT",
		keys: ["environment.current.setTrue", "environment.current.drift"],
		callback: (set: unknown, drift: unknown): N2KMessage[] => {
			try {
				const setValue = toValidNumber(set);
				const driftValue = toValidNumber(drift);

				if (setValue === null && driftValue === null) {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129291,
						dst: N2K_BROADCAST_DST,
						fields: {
							set: setValue,
							drift: driftValue,
							setReference: "True",
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
				input: [2.0944, 1.2],
				expected: [
					{
						pgn: 129291,
						dst: 255,
						prio: 2,
						fields: {
							drift: 1.2,
							set: 2.0944,
							setReference: "True",
						},
					},
				],
			},
			{
				input: [1.0944, 1.5],
				expected: [
					{
						pgn: 129291,
						dst: 255,
						prio: 2,
						fields: {
							drift: 1.5,
							set: 1.0944,
							setReference: "True",
						},
					},
				],
			},
		],
	};
}
