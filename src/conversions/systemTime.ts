import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SOURCE_TYPE,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { toN2KDateTime } from "../utils/dateUtils.js";

export default function createSystemTimeConversion(
	_app: SignalKApp,
): ConversionModule {
	return {
		title: "System Time (PGN 126992)",
		sourceType: SOURCE_TYPE.TIMER,
		interval: 1000,
		optionKey: "SYSTEM_TIME",
		category: "system",
		callback: (_app: unknown, inputDate?: unknown): N2KMessage[] => {
			const { date, time } = toN2KDateTime(
				inputDate instanceof Date ? inputDate : new Date(),
			);

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 126992,
					dst: N2K_BROADCAST_DST,
					fields: {
						// Declare the time source so a consumer does not see the
						// SYSTEM_TIME field as "not available". The plugin derives time
						// from the host clock, which on a marine install is GPS-disciplined.
						source: "GPS",
						date,
						time,
					},
				},
			];
		},

		tests: [
			{
				input: [undefined, new Date("2017-04-15T14:59:53.123Z")],
				expected: [
					{
						prio: 2,
						pgn: 126992,
						dst: 255,
						fields: {
							source: "GPS",
							date: "2017.04.15",
							time: "14:59:53.12300",
						},
					},
				],
			},
		],
	};
}
