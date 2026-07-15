import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, N2K_DEFAULT_SID } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

export default function createSpeedConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Speed Through Water (PGN 128259)",
		optionKey: "SPEED",
		category: "navigation",
		presets: ["basic-nav"],
		keys: ["navigation.speedThroughWater"],
		callback: (speed: unknown): N2KMessage[] => {
			if (!isValidNumber(speed)) {
				return [];
			}
			// PGN 128259 speedWaterReferenced is an unsigned u16 at 0.01 m/s. A
			// negative (astern) value cannot be represented and would wrap into
			// garbage on the wire, so drop the frame rather than encode nonsense
			// (matches depth.ts).
			if (speed < 0) {
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
		],
	};
}
