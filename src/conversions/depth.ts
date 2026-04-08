import { N2K_BROADCAST_DST, N2K_DEFAULT_SID } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

/**
 * Depth conversion module - converts Signal K depth data to NMEA 2000 PGN 128267
 */
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

				const surfaceToTransducer = app.getSelfPath(
					"environment.depth.surfaceToTransducer.value",
				) as number | undefined;
				const transducerToKeel = app.getSelfPath(
					"environment.depth.transducerToKeel.value",
				) as number | undefined;

				const offset = surfaceToTransducer ?? transducerToKeel ?? 0;

				return [
					{
						prio: 3,
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
				app.error(err instanceof Error ? err.message : String(err));
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
							offset: 1,
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
				// Test with no offset data available
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
