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
import { errMessage } from "../utils/errorUtils.js";
import { isValidNumber } from "../utils/validation.js";

export default function createSpeedConversion(
	app: SignalKApp,
): ConversionModule {
	return {
		title: "Speed (128259)",
		optionKey: "SPEED",
		keys: ["navigation.speedThroughWater"],
		callback: (speed: unknown): N2KMessage[] => {
			try {
				if (!isValidNumber(speed)) {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 128259,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_DEFAULT_SID,
							speedWaterReferenced: speed,
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
				input: [3],
				expected: [
					{
						prio: 2,
						pgn: 128259,
						dst: 255,
						fields: {
							sid: 87,
							speedWaterReferenced: 3,
						},
					},
				],
			},
			{
				input: [2.5],
				expected: [
					{
						prio: 2,
						pgn: 128259,
						dst: 255,
						fields: {
							sid: 87,
							speedWaterReferenced: 2.5,
						},
					},
				],
			},
			{
				input: [0],
				expected: [
					{
						prio: 2,
						pgn: 128259,
						dst: 255,
						fields: {
							sid: 87,
							speedWaterReferenced: 0,
						},
					},
				],
			},
		],
	};
}
