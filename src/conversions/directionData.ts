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
import { toValidNumber } from "../utils/validation.js";

export default function createDirectionDataConversion(
	_app: SignalKApp,
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
			const cogT = toValidNumber(cogTrue);
			const cogM = toValidNumber(cogMagnetic);
			const hdgT = toValidNumber(headingTrue);
			const hdgM = toValidNumber(headingMagnetic);

			if (cogT === null && cogM === null && hdgT === null && hdgM === null) {
				return [];
			}

			// PGN 130577 has only one reference field (cogReference) that
			// implicitly applies to heading. Pick True when any True value
			// is available so cog and heading agree. Heading-only-magnetic
			// is covered by PGN 127250 in heading.ts.
			const useTrue = cogT !== null || hdgT !== null;
			const cogReference = useTrue ? "True" : "Magnetic";
			const cog = useTrue ? cogT : cogM;
			const heading = useTrue ? hdgT : hdgM;

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 130577,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_SID_ZERO,
						dataMode: "Autonomous",
						cogReference,
						cog,
						heading,
					},
				},
			];
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
							sid: 0,
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
							sid: 0,
							cog: 1.047,
							cogReference: "Magnetic",
							dataMode: "Autonomous",
							heading: 0.698,
						},
					},
				],
			},
			{
				input: [0, 1.047, 0, 0.698],
				expected: [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 130577,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: 0,
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
