import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { toN2KDateTime } from "../utils/dateUtils.js";
import { isValidNumber } from "../utils/validation.js";

// PGN 129284 uses a fixed sequence identifier per common implementations.
const NAV_DATA_SID = 0x88;

interface DestinationPoint {
	position?: {
		latitude?: number;
		longitude?: number;
	};
}

interface ActiveRoute {
	pointIndex?: number;
}

function createNavDataConversion(
	optionKey: string,
	title: string,
	calculationType: "Rhumbline" | "Great Circle",
): ConversionModule {
	return {
		title,
		optionKey,
		keys: [
			"navigation.course.calcValues.distance",
			"navigation.course.calcValues.bearingTrue",
			"navigation.course.calcValues.bearingTrackTrue",
			"navigation.course.nextPoint",
			"navigation.course.calcValues.velocityMadeGood",
			"notifications.navigation.arrivalCircleEntered",
			"notifications.navigation.perpendicularPassed",
			"navigation.course.activeRoute",
		],
		timeouts: [10000, 10000, 10000, 10000, 10000, 60000, 60000, 10000],
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
			const wpid =
				route && typeof route.pointIndex === "number"
					? route.pointIndex + 1
					: 0;
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
						perpendicularCrossed: pp != null ? "Yes" : "No",
						arrivalCircleEntered: ace != null ? "Yes" : "No",
						calculationType,
						etaTime,
						etaDate,
						bearingOriginToDestinationWaypoint: isValidNumber(
							bearingOriginToDest,
						)
							? bearingOriginToDest
							: undefined,
						bearingPositionToDestinationWaypoint: isValidNumber(bearingToDest)
							? bearingToDest
							: undefined,
						originWaypointNumber: undefined,
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
						__preprocess__: (testResult: {
							fields: { etaDate?: unknown; etaTime?: unknown };
						}) => {
							delete testResult.fields.etaDate;
							delete testResult.fields.etaTime;
						},
						prio: 2,
						pgn: 129284,
						dst: 255,
						fields: {
							sid: 136,
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
		],
	};
}

export default function createNavigationDataConversions(): ConversionModule[] {
	return [
		// Cross Track Error (PGN 129283)
		{
			title: "Cross Track Error (129283)",
			optionKey: "CROSS_TRACK_ERROR",
			keys: ["navigation.course.calcValues.crossTrackError"],
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
		createNavDataConversion(
			"NAVIGATION_DATA",
			"Navigation Data (129284)",
			"Rhumbline",
		),

		// Navigation Data Great Circle (PGN 129284)
		createNavDataConversion(
			"NAVIGATION_DATA_GREAT_CIRCLE",
			"Navigation Data Great Circle (129284)",
			"Great Circle",
		),
	];
}
