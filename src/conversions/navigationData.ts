import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, SOURCE_TYPE } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { toN2KDateTime } from "../utils/dateUtils.js";
import { isClearState } from "../utils/notificationUtils.js";
import {
	isValidLatitude,
	isValidLongitude,
	isValidNumber,
	toUnsignedAngle,
} from "../utils/validation.js";
import {
	courseCalculation,
	courseDeltaTouches,
	coursePathValue,
	currentCourse,
	routePointIndex,
} from "./courseData.js";

const NAV_DATA_SID = 0x88;
const MAX_NAV_DISTANCE_METERS = 42_949_672.92;
const MIN_WAYPOINT_CLOSING_VELOCITY = -327.67;
const MAX_WAYPOINT_CLOSING_VELOCITY = 327.64;
const MIN_XTE_METERS = -21_474_836.47;
const MAX_XTE_METERS = 21_474_836.44;

function notificationActive(value: unknown): boolean {
	if (value == null) return false;
	if (typeof value === "object") {
		const state = (value as { state?: unknown }).state;
		return typeof state !== "string" || !isClearState(state);
	}
	return true;
}

function validRange(value: unknown, min: number, max: number): value is number {
	return isValidNumber(value) && value >= min && value <= max;
}

function etaFields(value: unknown): { etaDate?: number; etaTime?: number } {
	if (typeof value !== "string") return {};
	const eta = new Date(value);
	if (!Number.isFinite(eta.getTime())) return {};
	const converted = toN2KDateTime(eta);
	return converted.date >= 0 && converted.date <= 65_532
		? { etaDate: converted.date, etaTime: converted.time }
		: {};
}

function createNavDataConversion(
	app: SignalKApp,
	optionKey: string,
	title: string,
	providerMethod: "Rhumbline" | "GreatCircle",
	calculationType: "Rhumbline" | "Great Circle",
): ConversionModule {
	return {
		title,
		optionKey,
		category: "navigation",
		sourceType: SOURCE_TYPE.ON_DELTA,
		allowResend: false,
		callback: async (delta: unknown): Promise<N2KMessage[]> => {
			if (
				!courseDeltaTouches(app, delta, [
					"navigation.course.calcValues",
					"notifications.navigation.course.arrivalCircleEntered",
					"notifications.navigation.course.perpendicularPassed",
					"notifications.navigation.arrivalCircleEntered",
					"notifications.navigation.perpendicularPassed",
				])
			) {
				return [];
			}
			if (courseCalculation(app, "calcMethod", delta) !== providerMethod) return [];
			const distance = courseCalculation(app, "distance", delta);
			if (!validRange(distance, 0, MAX_NAV_DISTANCE_METERS)) return [];

			const course = await currentCourse(app);
			const destination = course?.nextPoint?.position;
			const destinationLatitude = destination?.latitude;
			const destinationLongitude = destination?.longitude;
			const destinationValid =
				isValidLatitude(destinationLatitude) && isValidLongitude(destinationLongitude);
			const routeIndex = routePointIndex(course);
			const bearingToDestination = courseCalculation(app, "bearingTrue", delta);
			const bearingTrack = courseCalculation(app, "bearingTrackTrue", delta);
			const closingVelocity = courseCalculation(app, "velocityMadeGood", delta);
			const validClosingVelocity = validRange(
				closingVelocity,
				MIN_WAYPOINT_CLOSING_VELOCITY,
				MAX_WAYPOINT_CLOSING_VELOCITY,
			);
			const arrivalCanonical = coursePathValue(
				app,
				"notifications.navigation.course.arrivalCircleEntered",
				delta,
			);
			const arrival =
				arrivalCanonical === undefined
					? coursePathValue(app, "notifications.navigation.arrivalCircleEntered", delta)
					: arrivalCanonical;
			const perpendicularCanonical = coursePathValue(
				app,
				"notifications.navigation.course.perpendicularPassed",
				delta,
			);
			const perpendicular =
				perpendicularCanonical === undefined
					? coursePathValue(app, "notifications.navigation.perpendicularPassed", delta)
					: perpendicularCanonical;

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129284,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: NAV_DATA_SID,
						distanceToWaypoint: distance,
						courseBearingReference: "True",
						perpendicularCrossed: notificationActive(perpendicular) ? "Yes" : "No",
						arrivalCircleEntered: notificationActive(arrival) ? "Yes" : "No",
						calculationType,
						...etaFields(courseCalculation(app, "estimatedTimeOfArrival", delta)),
						bearingOriginToDestinationWaypoint: isValidNumber(bearingTrack)
							? toUnsignedAngle(bearingTrack)
							: undefined,
						bearingPositionToDestinationWaypoint: isValidNumber(bearingToDestination)
							? toUnsignedAngle(bearingToDestination)
							: undefined,
						originWaypointNumber:
							routeIndex !== undefined && routeIndex > 0 ? routeIndex : undefined,
						destinationWaypointNumber: routeIndex !== undefined ? routeIndex + 1 : undefined,
						destinationLatitude: destinationValid ? destinationLatitude : undefined,
						destinationLongitude: destinationValid ? destinationLongitude : undefined,
						waypointClosingVelocity: validClosingVelocity ? closingVelocity : undefined,
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
								values: [
									{ path: "navigation.course.calcValues.calcMethod", value: providerMethod },
									{ path: "navigation.course.calcValues.distance", value: 12 },
									{ path: "navigation.course.calcValues.bearingTrue", value: 1.23 },
									{ path: "navigation.course.calcValues.bearingTrackTrue", value: 3.1 },
									{ path: "navigation.course.calcValues.velocityMadeGood", value: 4 },
									{
										path: "navigation.course.calcValues.estimatedTimeOfArrival",
										value: "2026-07-19T15:30:00Z",
									},
									{
										path: "notifications.navigation.course.perpendicularPassed",
										value: 1,
									},
								],
							},
						],
					},
				],
				skSelfData: {
					courseInfo: {
						activeRoute: { pointIndex: 5 },
						nextPoint: { position: { longitude: -75.487264, latitude: 32.0631296 } },
					},
				},
				expected: [
					{
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
							etaTime: "15:30:00",
							etaDate: "2026.07.19",
							bearingOriginToDestinationWaypoint: 3.1,
							bearingPositionToDestinationWaypoint: 1.23,
							originWaypointNumber: 5,
							destinationWaypointNumber: 6,
							destinationLatitude: 32.0631296,
							destinationLongitude: -75.487264,
							waypointClosingVelocity: 4,
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
									{ path: "navigation.course.calcValues.calcMethod", value: providerMethod },
									{ path: "navigation.course.calcValues.distance", value: 12 },
									{ path: "navigation.course.calcValues.bearingTrue", value: -0.2 },
									{ path: "navigation.course.calcValues.bearingTrackTrue", value: 1 },
									{ path: "navigation.course.calcValues.velocityMadeGood", value: 400 },
									{
										path: "navigation.course.calcValues.estimatedTimeOfArrival",
										value: null,
									},
									{
										path: "notifications.navigation.course.perpendicularPassed",
										value: null,
									},
									{
										path: "notifications.navigation.course.arrivalCircleEntered",
										value: null,
									},
								],
							},
						],
					},
				],
				skSelfData: {
					courseInfo: { nextPoint: { position: { longitude: -181, latitude: 32 } } },
				},
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
									{ path: "navigation.course.calcValues.calcMethod", value: providerMethod },
									{ path: "navigation.course.calcValues.distance", value: 12 },
									{ path: "navigation.course.calcValues.bearingTrue", value: null },
									{ path: "navigation.course.calcValues.bearingTrackTrue", value: null },
								],
							},
						],
					},
				],
				skSelfData: {
					courseInfo: { activeRoute: { pointIndex: 4_294_967_292 } },
				},
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
						},
					},
				],
			},
		],
	};
}

export default function createNavigationDataConversions(app: SignalKApp): ConversionModule[] {
	return [
		{
			title: "Cross Track Error (PGN 129283)",
			optionKey: "CROSS_TRACK_ERROR",
			category: "navigation",
			sourceType: SOURCE_TYPE.ON_DELTA,
			allowResend: false,
			callback: (delta: unknown): N2KMessage[] => {
				if (!courseDeltaTouches(app, delta, ["navigation.course.calcValues.crossTrackError"])) {
					return [];
				}
				const xte = courseCalculation(app, "crossTrackError", delta);
				if (!validRange(xte, MIN_XTE_METERS, MAX_XTE_METERS)) return [];
				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129283,
						dst: N2K_BROADCAST_DST,
						fields: { xte, xteMode: "Autonomous", navigationTerminated: "No" },
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
									values: [{ path: "navigation.course.calcValues.crossTrackError", value: 0.12 }],
								},
							],
						},
					],
					expected: [
						{
							prio: 2,
							pgn: 129283,
							dst: 255,
							fields: { xteMode: "Autonomous", navigationTerminated: "No", xte: 0.12 },
						},
					],
				},
			],
		},
		createNavDataConversion(
			app,
			"NAVIGATION_DATA",
			"Navigation Data (PGN 129284)",
			"Rhumbline",
			"Rhumbline",
		),
		createNavDataConversion(
			app,
			"NAVIGATION_DATA_GREAT_CIRCLE",
			"Navigation Data Great Circle (PGN 129284)",
			"GreatCircle",
			"Great Circle",
		),
	];
}
