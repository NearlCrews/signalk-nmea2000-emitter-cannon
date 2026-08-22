import { N2K_BROADCAST_DST, N2K_DEFAULT_SID } from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";
import { getSelfValue } from "../utils/pathUtils.js";
import { isValidNumber, toFiniteInRange, toValidNumber } from "../utils/validation.js";

const N2K_DEPTH_PRIORITY = 3;
// PGN 128267 offset is signed 16-bit at 0.001 m resolution.
const MIN_DEPTH_OFFSET_M = -32.767;
const MAX_DEPTH_OFFSET_M = 32.764;

export default function createDepthConversion(app: SignalKApp): ConversionModule<[number | null]> {
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
			// down to the keel, so it encodes as a negative offset. When neither
			// is configured, leave the field undefined so canboatjs encodes the
			// spec's "data not available" sentinel rather than 0, which would
			// claim the transducer sits exactly at the waterline.
			//
			// The field is signed 16-bit at 0.001 m, so it only reaches about
			// +-32.7 m. A configured offset past that would wrap and come out with
			// the opposite sign (+50 m decodes as -15.536 m), which is worse than
			// no offset at all, so an unencodable offset is left undefined.
			let offset: number | undefined;
			if (surfaceToTransducer !== null) {
				offset = toFiniteInRange(surfaceToTransducer, MIN_DEPTH_OFFSET_M, MAX_DEPTH_OFFSET_M);
			} else if (transducerToKeel !== null) {
				offset = toFiniteInRange(-transducerToKeel, MIN_DEPTH_OFFSET_M, MAX_DEPTH_OFFSET_M);
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
				// No surfaceToTransducer or transducerToKeel configured: the offset
				// field is omitted so canboatjs encodes "data not available" rather
				// than asserting a zero (transducer-at-waterline) offset.
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
