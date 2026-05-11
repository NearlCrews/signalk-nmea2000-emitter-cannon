import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type {
	ConversionModule,
	N2KFieldValue,
	N2KMessage,
} from "../types/index.js";
import { toValidNumber } from "../utils/validation.js";

export default function createTimeToMarkConversion(): ConversionModule {
	return {
		title: "Time to Mark (129301)",
		optionKey: "TIME_TO_MARK",
		// canboat 129301 has only timeToMark; the SK previousPoint.timeSince
		// path has no canonical home in this PGN.
		keys: [
			"navigation.course.nextPoint.timeToGo",
			"navigation.course.nextPoint.type",
		],
		timeouts: [5000, 5000],
		callback: (timeToGo: unknown, markType: unknown): N2KMessage[] => {
			const validTimeToGo = toValidNumber(timeToGo);
			if (validTimeToGo === null) {
				return [];
			}

			const fields: Record<string, N2KFieldValue> = {
				sid: N2K_SID_ZERO,
				timeToMark: validTimeToGo,
				markType: markType === "waypoint" ? "Waypoint" : "Reference",
			};

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129301,
					dst: N2K_BROADCAST_DST,
					fields,
				},
			];
		},
		tests: [
			{
				input: [1800, "waypoint"],
				expected: [
					{
						prio: 2,
						pgn: 129301,
						dst: 255,
						fields: {
							sid: 0,
							timeToMark: "00:30:00",
							markType: "Waypoint",
						},
					},
				],
			},
			{
				input: [120, "mark"],
				expected: [
					{
						prio: 2,
						pgn: 129301,
						dst: 255,
						fields: {
							sid: 0,
							timeToMark: "00:02:00",
							markType: "Reference",
						},
					},
				],
			},
		],
	};
}
