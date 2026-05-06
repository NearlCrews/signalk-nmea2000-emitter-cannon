import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_INSTANCE,
	N2K_DEFAULT_PRIORITY,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isValidNumber } from "../utils/validation.js";

function createPressureMessage(pressure: number, source: string): N2KMessage[] {
	return [
		{
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 130314,
			dst: N2K_BROADCAST_DST,
			fields: {
				instance: N2K_DEFAULT_INSTANCE,
				source,
				pressure,
			},
		},
	];
}

export default function createPressureConversions(
	app: SignalKApp,
): ConversionModule[] {
	return [
		{
			title: "Atmospheric Pressure (130314)",
			optionKey: "PRESSURE",
			keys: ["environment.outside.pressure"],
			callback: (pressure: unknown): N2KMessage[] => {
				try {
					if (!isValidNumber(pressure)) {
						return [];
					}

					return createPressureMessage(pressure, "Atmospheric");
				} catch (err) {
					app.error(errMessage(err));
					return [];
				}
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
								instance: 100,
								source: "Atmospheric",
								pressure: 98000,
							},
						},
					],
				},
			],
		},
	];
}
