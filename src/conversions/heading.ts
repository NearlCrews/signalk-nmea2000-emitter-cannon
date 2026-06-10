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
import { toUnsignedAngle, toValidNumber } from "../utils/validation.js";

export default function createHeadingConversion(
	_app: SignalKApp,
): ConversionModule<[number | null, number | null, number | null]> {
	return {
		title: "Vessel Heading (PGN 127250)",
		optionKey: "HEADING",
		category: "navigation",
		presets: ["basic-nav"],
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
						// Heading is an unsigned [0, 2pi) field; see toUnsignedAngle.
						// deviation and variation are signed [-pi, pi] fields, left as-is.
						heading: toUnsignedAngle(validHeading),
						deviation: validDeviation,
						variation: validVariation,
						reference: "Magnetic",
					},
				},
			];
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
			{
				// Regression: a negative heading must be normalized into [0, 2pi)
				// before the unsigned PGN 127250 field. -0.5 rad wraps to 5.7832 rad
				// (2pi - 0.5), not the 6.0536 rad the raw uint16 modulus would give.
				input: [-0.5, null, null],
				expected: [
					{
						prio: 2,
						pgn: 127250,
						dst: 255,
						fields: {
							sid: 87,
							heading: 5.7832,
							reference: "Magnetic",
						},
					},
				],
			},
		],
	};
}
