import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, N2K_DEFAULT_SID } from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";
import { toSignedAngle, toUnsignedAngle, toValidNumber } from "../utils/validation.js";

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
		callback: ((heading: number | null, variation: number | null, deviation: number | null) => {
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
						// deviation and variation are the signed int16 0.0001 rad
						// field, which truncates instead of wrapping; see
						// toSignedAngle.
						heading: toUnsignedAngle(validHeading),
						deviation: toSignedAngle(validDeviation),
						variation: toSignedAngle(validVariation),
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
			{
				// Regression: the unsigned field is bounded above as well as
				// normalized. canboat's decoder discards a raw value past its
				// RangeMax, and the last 0.002 degrees below north round onto such a
				// value, so a compass reading 359.999 degrees (6.2831678 rad) used
				// to arrive as "heading not available" on the chartplotter. It now
				// clamps onto the largest encodable angle, 0.005 degrees below
				// north.
				input: [6.2831678, null, null],
				expected: [
					{
						prio: 2,
						pgn: 127250,
						dst: 255,
						fields: {
							sid: 87,
							heading: 6.2831,
							reference: "Magnetic",
						},
					},
				],
			},
			{
				// Regression: deviation and variation are signed, and the field
				// truncates rather than wrapping. A provider publishing a
				// variation of 4 rad (the same direction as -2.2832 rad) used to
				// emit -2.5536 rad, and a deviation of exactly pi was encoded past
				// the ceiling canboat's decoder accepts and thrown away.
				input: [1.2, 4.0, Math.PI],
				expected: [
					{
						prio: 2,
						pgn: 127250,
						dst: 255,
						fields: {
							sid: 87,
							heading: 1.2,
							// biome-ignore lint/suspicious/noApproximativeNumericConstant: decoded wire value. Math.PI clamps to this literal, so substituting Math.PI would falsely pass.
							deviation: 3.1415,
							variation: -2.2832,
							reference: "Magnetic",
						},
					},
				],
			},
		],
	};
}
