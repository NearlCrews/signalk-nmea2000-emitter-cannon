import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { toN2KDateTime } from "../utils/dateUtils.js";

/**
 * System Time conversion module - converts current time to NMEA 2000 PGN 126992
 */
export default function createSystemTimeConversion(
	app: SignalKApp,
): ConversionModule {
	return {
		title: "System Time (126992)",
		sourceType: "timer",
		interval: 1000,
		optionKey: "SYSTEM_TIME",
		callback: (...values: unknown[]): N2KMessage[] => {
			try {
				const inputDate = values[1] as Date | undefined;
				const { date, time } = toN2KDateTime(inputDate || new Date());

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 126992,
						dst: N2K_BROADCAST_DST,
						fields: {
							date,
							time,
						},
					},
				];
			} catch (err) {
				app.error(err instanceof Error ? err.message : String(err));
				return [];
			}
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
							date: "2017.04.15",
							time: "14:59:53",
						},
					},
				],
			},
		],
	};
}
