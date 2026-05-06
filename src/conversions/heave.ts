import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isValidNumber } from "../utils/validation.js";

export default function createHeaveConversion(
	app: SignalKApp,
): ConversionModule<[number | null]> {
	return {
		title: "Heave (127252)",
		optionKey: "HEAVE",
		keys: ["navigation.heave"],
		timeouts: [1000], // 1 second for responsive motion data
		callback: ((heave: number | null) => {
			try {
				if (!isValidNumber(heave)) {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127252,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_SID_ZERO,
							heave,
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
				input: [0.15], // 15cm heave up
				expected: [
					{
						prio: 2,
						pgn: 127252,
						dst: 255,
						fields: {
							sid: 0,
							heave: 0.15,
						},
					},
				],
			},
			{
				input: [-0.08], // 8cm heave down
				expected: [
					{
						prio: 2,
						pgn: 127252,
						dst: 255,
						fields: {
							sid: 0,
							heave: -0.08,
						},
					},
				],
			},
		],
	};
}
