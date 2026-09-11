import {
	MAX_N2K_RATE_OF_TURN_RAD_PER_S,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { toFiniteInRange } from "../utils/validation.js";

export default function createRateOfTurnConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Rate of Turn (PGN 127251)",
		optionKey: "RATE_OF_TURN",
		category: "navigation",
		keys: ["navigation.rateOfTurn"],
		callback: (rateOfTurn: unknown): N2KMessage[] => {
			// The signed int32 field wraps with a sign change rather than
			// rejecting: a provider publishing degrees per minute instead of the
			// radians per second the Signal K spec calls for sent 100 to the
			// receiver as -34.217728 rad/s, turning a starboard swing into a port
			// one for every autopilot reading it. A rate is a bounded rotational
			// speed rather than a circular quantity, so an unencodable value is
			// dropped instead of wrapped.
			const rate = toFiniteInRange(
				rateOfTurn,
				-MAX_N2K_RATE_OF_TURN_RAD_PER_S,
				MAX_N2K_RATE_OF_TURN_RAD_PER_S,
			);
			if (rate === undefined) {
				return [];
			}
			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 127251,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_SID_ZERO,
						rate,
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
			{
				// Regression: the signed int32 field wraps with a sign change. A
				// provider publishing degrees per minute sent 100, which reached the
				// receiver as -34.217728 rad/s: a starboard turn reported to the
				// autopilot as a port turn. It is now omitted instead.
				input: [100],
				expected: [],
			},
			{
				// The same wrap at the negative end of the range.
				input: [-100],
				expected: [],
			},
		],
	};
}
