import { N2K_BROADCAST_DST, N2K_DEFAULT_SID } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isValidNumber, toValidNumber } from "../utils/validation.js";

const N2K_DEPTH_PRIORITY = 3;

export default function createDepthConversion(
	app: SignalKApp,
): ConversionModule<[number | null]> {
	return {
		title: "Depth (128267)",
		optionKey: "DEPTH",
		keys: ["environment.depth.belowTransducer"],
		callback: ((belowTransducer: number | null) => {
			try {
				if (!isValidNumber(belowTransducer)) {
					return [];
				}

				const surfaceToTransducer = toValidNumber(
					app.getSelfPath("environment.depth.surfaceToTransducer.value"),
				);
				const transducerToKeel = toValidNumber(
					app.getSelfPath("environment.depth.transducerToKeel.value"),
				);

				// Signal K `surfaceToTransducer` is the positive distance from
				// waterline down to the transducer. PGN 128267 `offset` is signed:
				// negative = freeboard offset, positive = keel offset. Negate the
				// surface measurement to produce the correct N2K sign.
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
			} catch (err) {
				app.error(errMessage(err));
				return [];
			}
		}) as ConversionCallback<[number | null]>,

		tests: [
			{
				input: [4.5],
				skSelfData: {
					"environment.depth.surfaceToTransducer.value": 1,
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
					"environment.depth.transducerToKeel.value": 3,
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
		],
	};
}
