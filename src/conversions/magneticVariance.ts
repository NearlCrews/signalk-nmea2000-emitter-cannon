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
import { toN2KDate } from "../utils/dateUtils.js";
import { isValidNumber } from "../utils/validation.js";

export default function createMagneticVarianceConversion(
	_app: SignalKApp,
): ConversionModule {
	return {
		title: "Magnetic Variation (PGN 127258)",
		optionKey: "MAGNETIC_VARIANCE",
		category: "navigation",
		keys: [
			"navigation.magneticVariation",
			"navigation.magneticVariationAgeOfService",
		],
		callback: (
			magneticVariation: unknown,
			ageOfService: unknown,
		): N2KMessage[] => {
			if (!isValidNumber(magneticVariation)) {
				return [];
			}

			// SK `magneticVariationAgeOfService` is Unix epoch seconds when the
			// variation was computed; PGN 127258 carries days-since-1970-01-01.
			const ageValue = isValidNumber(ageOfService)
				? toN2KDate(new Date(ageOfService * 1000))
				: undefined;

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 127258,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_SID_ZERO,
						source: "WMM 2025",
						ageOfService: ageValue,
						variation: magneticVariation,
					},
				},
			];
		},

		tests: [
			{
				input: [-0.0524, null],
				expected: [
					{
						prio: 2,
						pgn: 127258,
						dst: 255,
						fields: {
							sid: 0,
							source: "WMM 2025",
							variation: -0.0524,
						},
					},
				],
			},
		],
	};
}
