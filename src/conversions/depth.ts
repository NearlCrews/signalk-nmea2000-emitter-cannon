import { N2K_BROADCAST_DST, N2K_DEFAULT_SID } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { getSelfValue } from "../utils/pathUtils.js";
import { isValidNumber, toValidNumber } from "../utils/validation.js";

const N2K_DEPTH_PRIORITY = 3;

export default function createDepthConversion(
	app: SignalKApp,
): ConversionModule<[number | null]> {
	return {
		title: "Water Depth (PGN 128267)",
		optionKey: "DEPTH",
		category: "navigation",
		presets: ["basic-nav"],
		keys: ["environment.depth.belowTransducer"],
		callback: ((belowTransducer: number | null) => {
			if (!isValidNumber(belowTransducer)) {
				return [];
			}

			// PGN 128267 `depth` is an unsigned u32 at 0.01m resolution.
			// Negative input would wrap into garbage on the wire, so drop the
			// frame instead of encoding nonsense.
			if (belowTransducer < 0) {
				return [];
			}

			const surfaceToTransducer = toValidNumber(
				getSelfValue(app, "environment.depth.surfaceToTransducer"),
			);
			const transducerToKeel = toValidNumber(
				getSelfValue(app, "environment.depth.transducerToKeel"),
			);

			// PGN 128267 `offset` is the signed distance between the
			// transducer and a reference: positive = distance to the surface,
			// negative = distance to the keel. SK `surfaceToTransducer` is the
			// positive distance down from the waterline, so it encodes as a
			// positive offset. SK `transducerToKeel` is the positive distance
			// down to the keel, so it encodes as a negative offset.
			let offset = 0;
			if (surfaceToTransducer !== null) {
				offset = surfaceToTransducer;
			} else if (transducerToKeel !== null) {
				offset = -transducerToKeel;
			}

			return [
				{
					prio: N2K_DEPTH_PRIORITY,
					pgn: 128267,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_DEFAULT_SID,
						depth: belowTransducer,
						offset,
					},
				},
			];
		}) as ConversionCallback<[number | null]>,

		tests: [
			{
				input: [4.5],
				skSelfData: {
					"environment.depth.surfaceToTransducer": { value: 1 },
				},
				expected: [
					{
						prio: 3,
						pgn: 128267,
						dst: 255,
						fields: {
							sid: 87,
							depth: 4.5,
							offset: 1,
						},
					},
				],
			},
			{
				input: [2.1],
				skSelfData: {
					"environment.depth.transducerToKeel": { value: 3 },
				},
				expected: [
					{
						prio: 3,
						pgn: 128267,
						dst: 255,
						fields: {
							sid: 87,
							depth: 2.1,
							offset: -3,
						},
					},
				],
			},
			{
				input: [5.0],
				skSelfData: {},
				expected: [
					{
						prio: 3,
						pgn: 128267,
						dst: 255,
						fields: {
							sid: 87,
							depth: 5.0,
							offset: 0,
						},
					},
				],
			},
			{
				input: [-1],
				expected: [],
			},
		],
	};
}
