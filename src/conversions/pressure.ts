import {
	MAX_PRESSURE_PA,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_INSTANCE,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { toFiniteInRange } from "../utils/validation.js";

function createPressureMessage(pressure: number, source: string): N2KMessage[] {
	return [
		{
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 130314,
			dst: N2K_BROADCAST_DST,
			fields: {
				sid: N2K_SID_ZERO,
				instance: N2K_DEFAULT_INSTANCE,
				source,
				pressure,
			},
		},
	];
}

export default function createPressureConversions(_app: SignalKApp): ConversionModule[] {
	return [
		{
			title: "Atmospheric Pressure (PGN 130314)",
			optionKey: "PRESSURE",
			category: "environment",
			presets: ["environmental"],
			keys: ["environment.outside.pressure"],
			callback: (pressure: unknown): N2KMessage[] => {
				const atmosphericPressure = toFiniteInRange(pressure, 0, MAX_PRESSURE_PA);
				if (atmosphericPressure === undefined) {
					return [];
				}
				return createPressureMessage(atmosphericPressure, "Atmospheric");
			},

			tests: [
				{
					input: [103047.8],
					expected: [
						{
							prio: 2,
							pgn: 130314,
							dst: 255,
							fields: {
								sid: 0,
								instance: 100,
								source: "Atmospheric",
								pressure: 103047.8,
							},
						},
					],
				},
				{
					input: [101325],
					expected: [
						{
							prio: 2,
							pgn: 130314,
							dst: 255,
							fields: {
								sid: 0,
								instance: 100,
								source: "Atmospheric",
								pressure: 101325,
							},
						},
					],
				},
				{
					input: [98000],
					expected: [
						{
							prio: 2,
							pgn: 130314,
							dst: 255,
							fields: {
								sid: 0,
								instance: 100,
								source: "Atmospheric",
								pressure: 98000,
							},
						},
					],
				},
				{
					input: [MAX_PRESSURE_PA + 1],
					expected: [],
				},
			],
		},
	];
}
