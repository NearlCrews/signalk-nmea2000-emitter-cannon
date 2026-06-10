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
import { isValidNumber, normalizeAngle } from "../utils/validation.js";

// Deliberately NOT in the basic-nav preset. heading.ts already emits PGN 127250
// with reference "Magnetic" in basic-nav, and PGN 127250 has no instance field:
// a single source emitting both a Magnetic and a True frame on the same PGN
// differs only in the reference field, so a consumer keyed on (source, PGN)
// shows last-writer-wins and the displayed heading jumps by the magnetic
// variation. The canonical pairing is Magnetic 127250 plus PGN 127258
// (Magnetic Variation), letting the MFD derive true heading. This module stays
// available (enable it on a vessel whose only heading source is a satellite or
// GPS compass that publishes navigation.headingTrue), just not on by default.
export default function createTrueHeadingConversion(
	_app: SignalKApp,
): ConversionModule {
	return {
		title: "True Heading (PGN 127250)",
		optionKey: "TRUE_HEADING",
		category: "navigation",
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
						// Unsigned [0, 2pi) field: normalize so a negative or >2pi
						// heading does not wrap by the uint16 modulus.
						heading: normalizeAngle(heading),
						reference: "True",
					},
				},
			];
		},

		tests: [
			{
				input: [1.35],
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
			{
				// Regression: a >2pi heading is normalized into [0, 2pi). 7.0 rad
				// wraps to 0.7168 rad (7 - 2pi) before the unsigned field.
				input: [7.0],
				expected: [
					{
						prio: 2,
						pgn: 127250,
						dst: 255,
						fields: {
							sid: 87,
							heading: 0.7168,
							reference: "True",
						},
					},
				],
			},
		],
	};
}
