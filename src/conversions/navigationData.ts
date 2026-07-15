import {
	DEFAULT_DATA_TIMEOUT_MS,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SLOW_DATA_TIMEOUT_MS,
} from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { toN2KDateTime } from "../utils/dateUtils.js";
import { isClearState } from "../utils/notificationUtils.js";
import { isValidNumber, toUnsignedAngle, toValidNumber } from "../utils/validation.js";
import type { Position } from "./routeTypes.js";

// PGN 129284 uses a fixed sequence identifier per common implementations.
const NAV_DATA_SID = 0x88;

// A cleared notification object lingers on the path until its timeout, so a
// bare presence check would keep the PGN flag raised after the alert ended.
function notificationActive(v: unknown): boolean {
	if (v == null) return false;
	if (typeof v === "object") {
		const state = (v as { state?: unknown }).state;
		return typeof state !== "string" || !isClearState(state);
	}
	return true;
}

interface DestinationPoint {
	position?: Position;
}

interface ActiveRoute {
	pointIndex?: number;
}

function createNavDataConversion(
	optionKey: string,
	title: string,
	calculationType: "Rhumbline" | "Great Circle",
): ConversionModule {
	// v2 Course API paths (navigation.course.*) are not pushed into the v1
	// streambundle by signalk-server. Subscribe to the v1 siblings under
	// navigation.courseRhumbline.* / navigation.courseGreatCircle.* per
	// calculation mode.
	const courseBranch =
		calculationType === "Great Circle"
			? "navigation.courseGreatCircle"
			: "navigation.courseRhumbline";
	return {
		title,
		optionKey,
		category: "navigation",
		keys: [
			`${courseBranch}.calcValues.distance`,
			`${courseBranch}.calcValues.bearingTrue`,
			`${courseBranch}.calcValues.bearingTrackTrue`,
			`${courseBranch}.nextPoint`,
			`${courseBranch}.calcValues.velocityMadeGood`,
			"notifications.navigation.arrivalCircleEntered",
			"notifications.navigation.perpendicularPassed",
			`${courseBranch}.activeRoute`,
		],
		// Arrival-circle and perpendicular-passed use a longer freshness window
		// (SLOW_DATA_TIMEOUT_MS 60s vs DEFAULT_DATA_TIMEOUT_MS 10s) so a brief
		// notification flicker stays visible across the full PGN window.
		timeouts: [
			DEFAULT_DATA_TIMEOUT_MS,
			DEFAULT_DATA_TIMEOUT_MS,
			DEFAULT_DATA_TIMEOUT_MS,
			DEFAULT_DATA_TIMEOUT_MS,
			DEFAULT_DATA_TIMEOUT_MS,
			SLOW_DATA_TIMEOUT_MS,
			SLOW_DATA_TIMEOUT_MS,
			DEFAULT_DATA_TIMEOUT_MS,
		],
		callback: (
			distToDest: unknown,
			bearingToDest: unknown,
			bearingOriginToDest: unknown,
			destPos: unknown,
			WCV: unknown,
			ace: unknown,
			pp: unknown,
			rte: unknown,
		): N2KMessage[] => {
			if (!isValidNumber(distToDest)) {
				return [];
			}

			const wcvValid = isValidNumber(WCV);
			let etaDate: number | undefined;
			let etaTime: number | undefined;
			if (wcvValid && WCV > 0) {
				const secondsToGo = Math.trunc(distToDest / WCV);
				const eta = toN2KDateTime(new Date(Date.now() + secondsToGo * 1000));
				etaDate = eta.date;
				etaTime = eta.time;
			}

			const route = rte as ActiveRoute;
			const wpid = route && typeof route.pointIndex === "number" ? route.pointIndex + 1 : 0;
			const destination = destPos as DestinationPoint;

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129284,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: NAV_DATA_SID,
						distanceToWaypoint: distToDest,
						courseBearingReference: "True",
						perpendicularCrossed: notificationActive(pp) ? "Yes" : "No",
						arrivalCircleEntered: notificationActive(ace) ? "Yes" : "No",
						calculationType,
						etaTime,
						etaDate,
						// Both bearings are unsigned [0, 2pi) fields; see toUnsignedAngle.
						bearingOriginToDestinationWaypoint: toUnsignedAngle(toValidNumber(bearingOriginToDest)),
						bearingPositionToDestinationWaypoint: toUnsignedAngle(toValidNumber(bearingToDest)),
						destinationWaypointNumber: wpid,
						destinationLatitude: destination?.position?.latitude,
						destinationLongitude: destination?.position?.longitude,
						waypointClosingVelocity: wcvValid ? WCV : undefined,
					},
				},
			];
		},
		tests: [
			{
				input: [
					12,
					1.23,
					3.1,
					{ position: { longitude: -75.487264, latitude: 32.0631296 } },
					4.0,
					null,
					1,
					{ pointIndex: 5 },
				],
				expected: [
					{
						__preprocess__: (testResult: { fields: { etaDate?: unknown; etaTime?: unknown } }) => {
							delete testResult.fields.etaDate;
							delete testResult.fields.etaTime;
						},
						prio: 2,
						pgn: 129284,
						dst: 255,
						fields: {
							sid: NAV_DATA_SID,
							distanceToWaypoint: 12,
							courseBearingReference: "True",
							perpendicularCrossed: "Yes",
							arrivalCircleEntered: "No",
							calculationType,
							bearingOriginToDestinationWaypoint: 3.1,
							bearingPositionToDestinationWaypoint: 1.23,
							destinationWaypointNumber: 6,
							destinationLatitude: 32.0631296,
							destinationLongitude: -75.487264,
							waypointClosingVelocity: 4,
						},
					},
				],
			},
			{
				// Regression: negative or out-of-range bearings are normalized into
				// [0, 2pi) before the unsigned PGN 129284 bearing fields. -0.2 rad
				// wraps to 6.0832 rad. WCV is null so no ETA fields are emitted.
				input: [
					12,
					-0.2,
					1.0,
					{ position: { longitude: -75.5, latitude: 32.0 } },
					null,
					null,
					null,
					null,
				],
				expected: [
					{
						prio: 2,
						pgn: 129284,
						dst: 255,
						fields: {
							sid: NAV_DATA_SID,
							distanceToWaypoint: 12,
							courseBearingReference: "True",
							perpendicularCrossed: "No",
							arrivalCircleEntered: "No",
							calculationType,
							bearingOriginToDestinationWaypoint: 1,
							bearingPositionToDestinationWaypoint: 6.0832,
							destinationWaypointNumber: 0,
							destinationLatitude: 32,
							destinationLongitude: -75.5,
						},
					},
				],
			},
		],
	};
}

export default function createNavigationDataConversions(): ConversionModule[] {
	return [
		// Cross Track Error (PGN 129283)
		{
			title: "Cross Track Error (PGN 129283)",
			optionKey: "CROSS_TRACK_ERROR",
			category: "navigation",
			// XTE applies to either course mode; rhumbline is the conservative
			// v1 default (v2 navigation.course.* is not pushed to streambundle).
			keys: ["navigation.courseRhumbline.calcValues.crossTrackError"],
			callback: (XTE: unknown): N2KMessage[] => {
				if (!isValidNumber(XTE)) {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129283,
						dst: N2K_BROADCAST_DST,
						fields: {
							xte: XTE,
							xteMode: "Autonomous",
							navigationTerminated: "No",
						},
					},
				];
			},
			tests: [
				{
					input: [0.12],
					expected: [
						{
							prio: 2,
							pgn: 129283,
							dst: 255,
							fields: {
								xteMode: "Autonomous",
								navigationTerminated: "No",
								xte: 0.12,
							},
						},
					],
				},
			],
		},

		// Navigation Data (PGN 129284)
		createNavDataConversion("NAVIGATION_DATA", "Navigation Data (PGN 129284)", "Rhumbline"),

		// Navigation Data Great Circle (PGN 129284)
		createNavDataConversion(
			"NAVIGATION_DATA_GREAT_CIRCLE",
			"Navigation Data Great Circle (PGN 129284)",
			"Great Circle",
		),
	];
}
