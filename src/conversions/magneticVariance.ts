import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, N2K_SID_ZERO } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { toN2KDate } from "../utils/dateUtils.js";
import { isValidNumber } from "../utils/validation.js";

export default function createMagneticVarianceConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Magnetic Variation (PGN 127258)",
		// The Signal K path and user-facing title use "Variation" (the spec
		// term); the optionKey kept the older "Variance" spelling. Renaming
		// the optionKey would strand every existing user's configuration
		// (the key is the lookup into plugin settings), so the mismatch is
		// deliberate and preserved for backward compatibility.
		optionKey: "MAGNETIC_VARIANCE",
		category: "navigation",
		keys: ["navigation.magneticVariation", "navigation.magneticVariationAgeOfService"],
		callback: (magneticVariation: unknown, ageOfService: unknown): N2KMessage[] => {
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
						// The plugin has no way to verify which magnetic model
						// the Signal K provider used to compute the variation.
						// "Automatic Calculation" (canboat MAGNETIC_VARIATION
						// enum value 3) makes no model claim and matches the
						// Garmin documented expectation.
						source: "Automatic Calculation",
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
							source: "Automatic Calculation",
							variation: -0.0524,
						},
					},
				],
			},
			{
				// A populated ageOfService (Signal K epoch seconds) must encode as
				// the PGN 127258 DATE field (days since 1970-01-01). Epoch
				// 1700000000 s is 19675 days, which round-trips to 2023.11.14. The
				// null-age case above leaves this branch untested, so this case
				// covers the toN2KDate conversion and the emitted ageOfService.
				input: [-0.0524, 1700000000],
				expected: [
					{
						prio: 2,
						pgn: 127258,
						dst: 255,
						fields: {
							sid: 0,
							source: "Automatic Calculation",
							ageOfService: "2023.11.14",
							variation: -0.0524,
						},
					},
				],
			},
			{
				// No usable variation: the callback must drop the message rather
				// than emit a zeroed PGN 127258.
				input: [null, null],
				expected: [],
			},
		],
	};
}
