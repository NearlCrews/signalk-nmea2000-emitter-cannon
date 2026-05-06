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
import { errMessage } from "../utils/errorUtils.js";
import { toValidNumber } from "../utils/validation.js";

export default function createHeadingConversion(
	app: SignalKApp,
): ConversionModule<[number | null, number | null, number | null]> {
	return {
		title: "Heading (127250)",
		optionKey: "HEADING",
		keys: [
			"navigation.headingMagnetic",
			"navigation.magneticVariation",
			"navigation.magneticDeviation",
		],
		callback: ((
			heading: number | null,
			variation: number | null,
			deviation: number | null,
		) => {
			try {
				const validHeading = toValidNumber(heading);
				const validVariation = toValidNumber(variation);
				const validDeviation = toValidNumber(deviation);

				if (validHeading === null) {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127250,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_DEFAULT_SID,
							heading: validHeading,
							deviation: validDeviation,
							variation: validVariation,
							reference: "Magnetic",
						},
					},
				];
			} catch (err) {
				app.error(errMessage(err));
				return [];
			}
		}) as ConversionCallback<[number | null, number | null, number | null]>,

		tests: [
			{
				input: [1.2, 0.7, 0],
				expected: [
					{
						prio: 2,
						pgn: 127250,
						dst: 255,
						fields: {
							sid: 87,
							heading: 1.2,
							deviation: 0,
							variation: 0.7,
							reference: "Magnetic",
						},
					},
				],
			},
			{
				input: [2.5, null, null],
				expected: [
					{
						prio: 2,
						pgn: 127250,
						dst: 255,
						fields: {
							sid: 87,
							heading: 2.5,
							reference: "Magnetic",
						},
					},
				],
			},
			{
				input: [0, 0.1, 0],
				expected: [
					{
						prio: 2,
						pgn: 127250,
						dst: 255,
						fields: {
							sid: 87,
							heading: 0,
							deviation: 0,
							variation: 0.1,
							reference: "Magnetic",
						},
					},
				],
			},
		],
	};
}
