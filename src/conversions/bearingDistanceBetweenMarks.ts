import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	N2KFieldValue,
	SignalKApp,
} from "../types/index.js";

export default function createBearingDistanceBetweenMarksConversion(
	_app: SignalKApp,
): ConversionModule<
	[
		number | null,
		number | null,
		number | null,
		number | null,
		string | null,
		string | null,
	]
> {
	return {
		title: "Bearing and Distance Between Two Marks (129302)",
		optionKey: "BEARING_DISTANCE_MARKS",
		keys: [
			"navigation.course.nextPoint.bearingMagnetic",
			"navigation.course.nextPoint.distance",
			"navigation.course.previousPoint.bearingMagnetic",
			"navigation.course.previousPoint.distance",
			"navigation.course.nextPoint.type",
			"navigation.course.previousPoint.type",
		],
		timeouts: [5000, 5000, 5000, 5000, 5000, 5000], // 5 seconds
		callback: ((
			nextBearing: number | null,
			nextDistance: number | null,
			prevBearing: number | null,
			prevDistance: number | null,
			nextType: string | null,
			prevType: string | null,
		) => {
			if (
				nextBearing == null &&
				nextDistance == null &&
				prevBearing == null &&
				prevDistance == null
			) {
				return [];
			}

			const fields: Record<string, N2KFieldValue> = {
				sid: 0,
			};

			// Add fields conditionally based on availability
			if (typeof nextBearing === "number") {
				fields.bearingOriginToDestination = nextBearing;
			}
			if (typeof nextDistance === "number") {
				fields.distanceToMark = nextDistance;
			}
			if (typeof prevBearing === "number") {
				fields.bearingPositionToMark = prevBearing;
			}
			if (typeof prevDistance === "number") {
				fields.distancePositionToMark = prevDistance;
			}
			if (prevType != null) {
				fields.originMarkType = prevType === "waypoint" ? "Waypoint" : "Mark";
			}
			if (nextType != null) {
				fields.destinationMarkType =
					nextType === "waypoint" ? "Waypoint" : "Mark";
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129302,
					dst: N2K_BROADCAST_DST,
					fields,
				},
			];
		}) as ConversionCallback<
			[
				number | null,
				number | null,
				number | null,
				number | null,
				string | null,
				string | null,
			]
		>,
		tests: [
			{
				input: [1.2217, 2000, 0.7854, 1500, "waypoint", "waypoint"], // 70° to next WP (2km), 45° from prev WP (1.5km)
				expected: [
					{
						prio: 2,
						pgn: 129302,
						dst: 255,
						fields: {
							bearingOriginToDestination: 1.2217,
							destinationMarkType: "Waypoint",
							originMarkType: "Waypoint",
							sid: 0,
						},
					},
				],
			},
			{
				input: [2.0944, 5000, null, null, "mark", null], // 120° to mark, 5km away
				expected: [
					{
						prio: 2,
						pgn: 129302,
						dst: 255,
						fields: {
							bearingOriginToDestination: 2.0944,
							destinationMarkType: "Collision",
							sid: 0,
						},
					},
				],
			},
		],
	};
}
