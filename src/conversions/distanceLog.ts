import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, SLOW_DATA_TIMEOUT_MS } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

const MAX_DISTANCE_METERS = 4_294_967_292;

function toDistance(value: unknown): number | undefined {
	return isValidNumber(value) && value >= 0 && value <= MAX_DISTANCE_METERS ? value : undefined;
}

export default function createDistanceLogConversion(): ConversionModule {
	return {
		title: "Distance Log (PGN 128275)",
		optionKey: "DISTANCE_LOG",
		category: "navigation",
		keys: ["navigation.log", "navigation.trip.log"],
		timeouts: [SLOW_DATA_TIMEOUT_MS, SLOW_DATA_TIMEOUT_MS],
		callback: (log: unknown, tripLog: unknown): N2KMessage[] => {
			const validLog = toDistance(log);
			const validTripLog = toDistance(tripLog);
			if (validLog === undefined && validTripLog === undefined) return [];

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 128275,
					dst: N2K_BROADCAST_DST,
					fields: {
						log: validLog,
						tripLog: validTripLog,
					},
				},
			];
		},
		tests: [
			{
				input: [185_200, 12_345],
				expected: [
					{
						prio: 2,
						pgn: 128275,
						dst: 255,
						fields: { log: 185_200, tripLog: 12_345 },
					},
				],
			},
			{
				input: [-1, Number.POSITIVE_INFINITY],
				expected: [],
			},
			{
				input: [null, 500],
				expected: [
					{
						prio: 2,
						pgn: 128275,
						dst: 255,
						fields: { tripLog: 500 },
					},
				],
			},
		],
	};
}
