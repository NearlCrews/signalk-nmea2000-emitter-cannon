import {
	MAX_N2K_HEAVE_M,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";
import { toFiniteInRange } from "../utils/validation.js";

export default function createHeaveConversion(_app: SignalKApp): ConversionModule<[number | null]> {
	return {
		title: "Vessel Heave (PGN 127252)",
		optionKey: "HEAVE",
		category: "navigation",
		keys: ["navigation.heave"],
		timeouts: [1000],
		callback: ((heave: number | null) => {
			// The signed 0.01 m field wraps rather than rejecting: a provider
			// publishing millimetres sent a 1.5 m heave as 1500, which reached the
			// receiver as 189.28 m, and a -400 value arrived as +255.36 m, so a
			// vessel dropping into a trough was reported as rising. Heave is a
			// bounded displacement rather than a circular quantity, so an
			// unencodable value is dropped instead of wrapped.
			const heaveM = toFiniteInRange(heave, -MAX_N2K_HEAVE_M, MAX_N2K_HEAVE_M);
			if (heaveM === undefined) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 127252,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_SID_ZERO,
						heave: heaveM,
					},
				},
			];
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
			{
				// Regression: the signed 0.01 m field wraps. A provider publishing
				// millimetres sent a 1.5 m heave as 1500, which reached the receiver
				// as 189.28 m. It is now omitted instead.
				input: [1500],
				expected: [],
			},
			{
				// The same wrap flips the sign at the negative end: -400 m arrived
				// as +255.36 m, reporting a drop into a trough as a rise.
				input: [-400],
				expected: [],
			},
		],
	};
}
