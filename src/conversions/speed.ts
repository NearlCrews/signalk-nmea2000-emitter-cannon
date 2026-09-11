import {
	MAX_N2K_SPEED_MPS,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_DEFAULT_SID,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { toFiniteInRange } from "../utils/validation.js";

export default function createSpeedConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Speed Through Water (PGN 128259)",
		optionKey: "SPEED",
		category: "navigation",
		presets: ["basic-nav"],
		keys: ["navigation.speedThroughWater"],
		callback: (speed: unknown): N2KMessage[] => {
			// PGN 128259 speedWaterReferenced is the unsigned u16 0.01 m/s field
			// that MAX_N2K_SPEED_MPS describes. Neither end of the range can be
			// represented: a negative (astern) value and an oversized one both
			// wrap into a plausible-looking reading rather than being rejected,
			// so drop the frame rather than encode nonsense (matches depth.ts,
			// and the ceiling matches cogSOG.ts, setdrift.ts, and windData.ts).
			const speedMps = toFiniteInRange(speed, 0, MAX_N2K_SPEED_MPS);
			if (speedMps === undefined) {
				return [];
			}
			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 128259,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_DEFAULT_SID,
						speedWaterReferenced: speedMps,
					},
				},
			];
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
			{
				// Regression: a negative (astern) speed cannot be represented by the
				// unsigned PGN 128259 field, so the frame is dropped.
				input: [-1],
				expected: [],
			},
			{
				// Regression: the same field wraps at the top of its range. 700 m/s
				// went on the bus as 44.64 m/s, an 87 knot reading a log display
				// would render without complaint.
				input: [700],
				expected: [],
			},
		],
	};
}
