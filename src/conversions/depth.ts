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

			// SK `surfaceToTransducer` is the positive distance from waterline
			// down to the transducer. PGN 128267 `offset` is signed: negative
			// = freeboard, positive = keel. Negate the surface measurement so
			// the wire sign matches the canboat convention.
			const offset =
				surfaceToTransducer !== null
					? -surfaceToTransducer
					: (transducerToKeel ?? 0);

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
							// Signal K surfaceToTransducer is the positive distance
							// from waterline down to the transducer. NMEA 2000
							// PGN 128267 offset treats that case as negative
							// (freeboard offset).
							offset: -1,
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
							offset: 3,
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
