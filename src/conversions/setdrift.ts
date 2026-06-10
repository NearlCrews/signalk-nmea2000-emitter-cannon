import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { toUnsignedAngle, toValidNumber } from "../utils/validation.js";

export default function createSetDriftConversion(
	_app: SignalKApp,
): ConversionModule {
	return {
		title: "Set and Drift (PGN 129291)",
		optionKey: "SET_DRIFT",
		category: "navigation",
		// Live signalk-server publishes the current under environment.water.current.*.
		// The older environment.current.* form is not pushed into the v1
		// streambundle on the current schema, so subscribe to the water branch.
		keys: ["environment.water.current.set", "environment.water.current.drift"],
		callback: (set: unknown, drift: unknown): N2KMessage[] => {
			const setValue = toValidNumber(set);
			const driftValue = toValidNumber(drift);

			if (setValue === null && driftValue === null) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129291,
					dst: N2K_BROADCAST_DST,
					fields: {
						// Set is an unsigned [0, 2pi) direction field; see toUnsignedAngle.
						set: toUnsignedAngle(setValue),
						drift: driftValue,
						setReference: "True",
					},
				},
			];
		},

		tests: [
			{
				input: [2.0944, 1.2],
				expected: [
					{
						pgn: 129291,
						dst: 255,
						prio: 2,
						fields: {
							drift: 1.2,
							set: 2.0944,
							setReference: "True",
						},
					},
				],
			},
			{
				input: [1.0944, 1.5],
				expected: [
					{
						pgn: 129291,
						dst: 255,
						prio: 2,
						fields: {
							drift: 1.5,
							set: 1.0944,
							setReference: "True",
						},
					},
				],
			},
			{
				// Regression: a negative set is normalized into [0, 2pi). -0.5 rad
				// wraps to 5.7832 rad (2pi - 0.5) before the unsigned field.
				input: [-0.5, 1.2],
				expected: [
					{
						pgn: 129291,
						dst: 255,
						prio: 2,
						fields: {
							drift: 1.2,
							set: 5.7832,
							setReference: "True",
						},
					},
				],
			},
		],
	};
}
