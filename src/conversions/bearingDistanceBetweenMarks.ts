import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	N2KFieldValue,
	SignalKApp,
} from "../types/index.js";
import {
	isValidNumber,
	normalizeAngle,
	toValidNumber,
} from "../utils/validation.js";

// canboat MARK_TYPE entries: Collision, Turning point, Reference, Wheelover,
// Waypoint. SK only emits "waypoint"; everything else maps to "Reference"
// since the canonical lookup has no generic "mark" entry.
const markTypeFor = (t: string | null) =>
	t === "waypoint" ? "Waypoint" : "Reference";

type BearingDistanceInputs = [
	number | null,
	number | null,
	number | null,
	number | null,
	string | null,
	string | null,
];

export default function createBearingDistanceBetweenMarksConversion(
	_app: SignalKApp,
): ConversionModule<BearingDistanceInputs> {
	return {
		title: "Bearing and Distance Between Marks (PGN 129302)",
		optionKey: "BEARING_DISTANCE_MARKS",
		category: "navigation",
		// v2 navigation.course.* is not pushed into the v1 streambundle;
		// use the v1 sibling under navigation.courseGreatCircle.* so the
		// subscriptions actually fire.
		keys: [
			"navigation.courseGreatCircle.nextPoint.bearingTrue",
			"navigation.courseGreatCircle.nextPoint.bearingMagnetic",
			"navigation.magneticVariation",
			"navigation.courseGreatCircle.nextPoint.distance",
			"navigation.courseGreatCircle.nextPoint.type",
			"navigation.courseGreatCircle.previousPoint.type",
		],
		timeouts: [5000, 5000, 5000, 5000, 5000, 5000],
		callback: ((
			nextBearingTrue: number | null,
			nextBearingMagnetic: number | null,
			magneticVariation: number | null,
			nextDistance: number | null,
			nextType: string | null,
			prevType: string | null,
		) => {
			let bearing = toValidNumber(nextBearingTrue);
			if (
				bearing === null &&
				isValidNumber(nextBearingMagnetic) &&
				isValidNumber(magneticVariation)
			) {
				bearing = normalizeAngle(nextBearingMagnetic + magneticVariation);
			}
			const validNextDistance = toValidNumber(nextDistance);

			if (bearing === null && validNextDistance === null) {
				return [];
			}

			const fields: Record<string, N2KFieldValue> = {
				sid: N2K_SID_ZERO,
				calculationType: "Great Circle",
				bearingReference: "True",
			};

			if (bearing !== null) fields.bearingOriginToDestination = bearing;
			if (validNextDistance !== null) fields.distance = validNextDistance;

			if (prevType != null) fields.originMarkType = markTypeFor(prevType);
			if (nextType != null) fields.destinationMarkType = markTypeFor(nextType);

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129302,
					dst: N2K_BROADCAST_DST,
					fields,
				},
			];
		}) as ConversionCallback<BearingDistanceInputs>,
		tests: [
			{
				input: [1.2217, null, null, 2000, "waypoint", "waypoint"],
				expected: [
					{
						prio: 2,
						pgn: 129302,
						dst: 255,
						fields: {
							bearingOriginToDestination: 1.2217,
							bearingReference: "True",
							calculationType: "Great Circle",
							distance: 2000,
							destinationMarkType: "Waypoint",
							originMarkType: "Waypoint",
							sid: 0,
						},
					},
				],
			},
			{
				input: [null, 1.2, 0.0217, 2000, "waypoint", "waypoint"],
				expected: [
					{
						prio: 2,
						pgn: 129302,
						dst: 255,
						fields: {
							bearingOriginToDestination: 1.2217,
							bearingReference: "True",
							calculationType: "Great Circle",
							distance: 2000,
							destinationMarkType: "Waypoint",
							originMarkType: "Waypoint",
							sid: 0,
						},
					},
				],
			},
			{
				input: [2.0944, null, null, 5000, "mark", null],
				expected: [
					{
						prio: 2,
						pgn: 129302,
						dst: 255,
						fields: {
							bearingOriginToDestination: 2.0944,
							bearingReference: "True",
							calculationType: "Great Circle",
							distance: 5000,
							destinationMarkType: "Reference",
							sid: 0,
						},
					},
				],
			},
		],
	};
}
