import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
	SOURCE_TYPE,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";
import {
	courseCalculation,
	courseDeltaTouches,
	currentCourse,
	routePointIndex,
} from "./courseData.js";
import { markTypeFor } from "./routeTypes.js";

const MIN_TIME_TO_MARK_SECONDS = -2_147_483.647;
const MAX_TIME_TO_MARK_SECONDS = 2_147_483.644;

export default function createTimeToMarkConversion(app: SignalKApp): ConversionModule {
	return {
		title: "Time to Mark (PGN 129301)",
		optionKey: "TIME_TO_MARK",
		category: "navigation",
		sourceType: SOURCE_TYPE.ON_DELTA,
		allowResend: false,
		callback: async (delta: unknown): Promise<N2KMessage[]> => {
			if (!courseDeltaTouches(app, delta, ["navigation.course.calcValues.timeToGo"])) return [];
			const timeToGo = courseCalculation(app, "timeToGo", delta);
			if (
				!isValidNumber(timeToGo) ||
				timeToGo < MIN_TIME_TO_MARK_SECONDS ||
				timeToGo > MAX_TIME_TO_MARK_SECONDS
			) {
				return [];
			}
			const course = await currentCourse(app);
			const pointIndex = routePointIndex(course);
			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129301,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_SID_ZERO,
						timeToMark: timeToGo,
						markType: markTypeFor(course?.nextPoint?.type),
						markId: pointIndex === undefined ? undefined : pointIndex + 1,
					},
				},
			];
		},
		tests: [
			{
				input: [
					{
						context: "vessels.self",
						updates: [
							{
								values: [{ path: "navigation.course.calcValues.timeToGo", value: 1800 }],
							},
						],
					},
				],
				skSelfData: {
					courseInfo: {
						activeRoute: { pointIndex: 5 },
						nextPoint: { type: "RoutePoint" },
					},
				},
				expected: [
					{
						prio: 2,
						pgn: 129301,
						dst: 255,
						fields: {
							sid: 0,
							timeToMark: "00:30:00",
							markType: "Waypoint",
							markId: 6,
						},
					},
				],
			},
			{
				input: [
					{
						context: "vessels.self",
						updates: [
							{
								values: [
									{
										path: "navigation.course.calcValues.timeToGo",
										value: MAX_TIME_TO_MARK_SECONDS + 0.001,
									},
								],
							},
						],
					},
				],
				expected: [],
			},
		],
	};
}
