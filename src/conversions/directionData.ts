import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isValidNumber } from "../utils/validation.js";

export default function createDirectionDataConversion(
	app: SignalKApp,
): ConversionModule<
	[number | null, number | null, number | null, number | null]
> {
	return {
		title: "Direction Data (130577)",
		optionKey: "DIRECTION_DATA",
		keys: [
			"navigation.courseOverGroundTrue",
			"navigation.courseOverGroundMagnetic",
			"navigation.headingTrue",
			"navigation.headingMagnetic",
		],
		callback: ((
			cogTrue: number | null,
			cogMagnetic: number | null,
			headingTrue: number | null,
			headingMagnetic: number | null,
		) => {
			try {
				const cogTrueValid = isValidNumber(cogTrue);
				const cogMagneticValid = isValidNumber(cogMagnetic);
				const headingTrueValid = isValidNumber(headingTrue);
				const headingMagneticValid = isValidNumber(headingMagnetic);

				if (
					!cogTrueValid &&
					!cogMagneticValid &&
					!headingTrueValid &&
					!headingMagneticValid
				) {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 130577,
						dst: N2K_BROADCAST_DST,
						fields: {
							dataMode: "Autonomous",
							cogReference: cogTrueValid
								? "True"
								: cogMagneticValid
									? "Magnetic"
									: "Unavailable",
							sidForCog: N2K_SID_ZERO,
							cog: cogTrueValid
								? cogTrue
								: cogMagneticValid
									? cogMagnetic
									: null,
							sogReference: "Unavailable",
							sidForSog: N2K_SID_ZERO,
							sog: null,
							headingReference: headingTrueValid
								? "True"
								: headingMagneticValid
									? "Magnetic"
									: "Unavailable",
							sidForHeading: N2K_SID_ZERO,
							heading: headingTrueValid
								? headingTrue
								: headingMagneticValid
									? headingMagnetic
									: null,
							speedThroughWaterReference: "Unavailable",
							sidForStw: N2K_SID_ZERO,
							speedThroughWater: null,
							set: null,
							drift: null,
						},
					},
				];
			} catch (err) {
				app.error(errMessage(err));
				return [];
			}
		}) as ConversionCallback<
			[number | null, number | null, number | null, number | null]
		>,

		tests: [
			{
				input: [1.571, null, 1.396, null],
				expected: [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 130577,
						dst: N2K_BROADCAST_DST,
						fields: {
							cog: 1.571,
							cogReference: "True",
							dataMode: "Autonomous",
							heading: 1.396,
						},
					},
				],
			},
			{
				input: [null, 1.047, null, 0.698],
				expected: [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 130577,
						dst: N2K_BROADCAST_DST,
						fields: {
							cog: 1.047,
							cogReference: "Magnetic",
							dataMode: "Autonomous",
							heading: 0.698,
						},
					},
				],
			},
			{
				// Due north: cogTrue=0, headingTrue=0. With || fallback, zero is falsy
				// and cog/heading would wrongly fall through to magnetic values.
				input: [0, 1.047, 0, 0.698],
				expected: [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 130577,
						dst: N2K_BROADCAST_DST,
						fields: {
							cog: 0,
							cogReference: "True",
							dataMode: "Autonomous",
							heading: 0,
						},
					},
				],
			},
		],
	};
}
