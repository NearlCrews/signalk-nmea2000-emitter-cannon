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
import { isValidNumber } from "../utils/validation.js";

export default function createTrueHeadingConversion(
	_app: SignalKApp,
): ConversionModule {
	return {
		title: "True Heading (PGN 127250)",
		optionKey: "TRUE_HEADING",
		keys: ["navigation.headingTrue"],
		callback: (heading: unknown): N2KMessage[] => {
			if (!isValidNumber(heading)) {
				return [];
			}
			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 127250,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_DEFAULT_SID,
						heading,
						variation: undefined,
						reference: "True",
					},
				},
			];
		},

		tests: [
			{
				input: [1.35, undefined],
				expected: [
					{
						prio: 2,
						pgn: 127250,
						dst: 255,
						fields: {
							sid: 87,
							heading: 1.35,
							reference: "True",
						},
					},
				],
			},
		],
	};
}
