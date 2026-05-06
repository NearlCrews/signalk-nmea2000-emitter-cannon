import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isValidNumber } from "../utils/validation.js";

export default function createMagneticVarianceConversion(
	app: SignalKApp,
): ConversionModule {
	return {
		title: "Magnetic Variance (127258)",
		optionKey: "MAGNETIC_VARIANCE",
		keys: [
			"navigation.magneticVariation",
			"navigation.magneticVariationAgeOfService",
		],
		callback: (
			magneticVariation: unknown,
			ageOfService: unknown,
		): N2KMessage[] => {
			try {
				if (!isValidNumber(magneticVariation)) {
					return [];
				}

				const ageValue = isValidNumber(ageOfService) ? ageOfService : 0;

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127258,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_SID_ZERO,
							variationSource: "Table",
							ageOfService: ageValue,
							variation: magneticVariation,
						},
					},
				];
			} catch (err) {
				app.error(errMessage(err));
				return [];
			}
		},

		tests: [
			{
				input: [0.0349, 30], // 2 degrees east, 30 days old
				expected: [
					{
						prio: 2,
						pgn: 127258,
						dst: 255,
						fields: {
							ageOfService: "1970.01.31",
							sid: 0,
							variation: 0.0349,
						},
					},
				],
			},
			{
				input: [-0.0524, null], // 3 degrees west, unknown age
				expected: [
					{
						prio: 2,
						pgn: 127258,
						dst: 255,
						fields: {
							ageOfService: "1970.01.01",
							sid: 0,
							variation: -0.0524,
						},
					},
				],
			},
		],
	};
}
