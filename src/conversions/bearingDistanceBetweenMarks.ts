import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
	SOURCE_TYPE,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import {
	isValidLatitude,
	isValidLongitude,
	isValidNumber,
	toUnsignedAngle,
} from "../utils/validation.js";
import {
	courseCalculation,
	courseDeltaTouches,
	currentCourse,
	routePointIndex,
} from "./courseData.js";
import { markTypeFor } from "./routeTypes.js";

const MAX_DISTANCE_METERS = 42_949_672.92;
const EARTH_MEAN_RADIUS_METERS = 6_371_008.8;
const POLE_EPSILON_RADIANS = 1e-12;

interface LegCoordinates {
	latitude1: number;
	latitude2: number;
	latitudeDelta: number;
	longitudeDelta: number;
}

function legCoordinates(
	origin: { latitude?: unknown; longitude?: unknown } | null | undefined,
	destination: { latitude?: unknown; longitude?: unknown } | null | undefined,
): LegCoordinates | undefined {
	if (
		!isValidLatitude(origin?.latitude) ||
		!isValidLongitude(origin.longitude) ||
		!isValidLatitude(destination?.latitude) ||
		!isValidLongitude(destination.longitude)
	) {
		return undefined;
	}
	const toRadians = Math.PI / 180;
	const latitude1 = origin.latitude * toRadians;
	const latitude2 = destination.latitude * toRadians;
	let longitudeDelta = (destination.longitude - origin.longitude) * toRadians;
	if (longitudeDelta > Math.PI) longitudeDelta -= Math.PI * 2;
	if (longitudeDelta < -Math.PI) longitudeDelta += Math.PI * 2;
	return {
		latitude1,
		latitude2,
		latitudeDelta: latitude2 - latitude1,
		longitudeDelta,
	};
}

function greatCircleLeg(
	origin: { latitude?: unknown; longitude?: unknown } | null | undefined,
	destination: { latitude?: unknown; longitude?: unknown } | null | undefined,
): { bearing: number; distance: number } | undefined {
	const coordinates = legCoordinates(origin, destination);
	if (coordinates === undefined) return undefined;
	const { latitude1, latitude2, latitudeDelta, longitudeDelta } = coordinates;
	const sinLatitude = Math.sin(latitudeDelta / 2);
	const sinLongitude = Math.sin(longitudeDelta / 2);
	const haversine =
		sinLatitude * sinLatitude +
		Math.cos(latitude1) * Math.cos(latitude2) * sinLongitude * sinLongitude;
	const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
	const bearing = Math.atan2(
		Math.sin(longitudeDelta) * Math.cos(latitude2),
		Math.cos(latitude1) * Math.sin(latitude2) -
			Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta),
	);
	return { bearing, distance: EARTH_MEAN_RADIUS_METERS * centralAngle };
}

function rhumblineLeg(
	origin: { latitude?: unknown; longitude?: unknown } | null | undefined,
	destination: { latitude?: unknown; longitude?: unknown } | null | undefined,
): { bearing: number; distance: number } | undefined {
	const coordinates = legCoordinates(origin, destination);
	if (coordinates === undefined) return undefined;
	const { latitude1, latitude2, latitudeDelta, longitudeDelta } = coordinates;
	const mercatorLatitude1 = Math.max(
		-Math.PI / 2 + POLE_EPSILON_RADIANS,
		Math.min(Math.PI / 2 - POLE_EPSILON_RADIANS, latitude1),
	);
	const mercatorLatitude2 = Math.max(
		-Math.PI / 2 + POLE_EPSILON_RADIANS,
		Math.min(Math.PI / 2 - POLE_EPSILON_RADIANS, latitude2),
	);
	const meridionalDelta = Math.log(
		Math.tan(Math.PI / 4 + mercatorLatitude2 / 2) / Math.tan(Math.PI / 4 + mercatorLatitude1 / 2),
	);
	const q =
		Math.abs(meridionalDelta) > Number.EPSILON
			? latitudeDelta / meridionalDelta
			: Math.cos(latitude1);
	return {
		bearing: Math.atan2(longitudeDelta, meridionalDelta),
		distance: Math.hypot(latitudeDelta, q * longitudeDelta) * EARTH_MEAN_RADIUS_METERS,
	};
}

export default function createBearingDistanceBetweenMarksConversion(
	app: SignalKApp,
): ConversionModule {
	return {
		title: "Bearing and Distance Between Marks (PGN 129302)",
		optionKey: "BEARING_DISTANCE_MARKS",
		category: "navigation",
		sourceType: SOURCE_TYPE.ON_DELTA,
		// KNOWN LIMITATION: this is gated on the whole
		// navigation.course.calcValues subtree, but the frame's content depends
		// only on previousPoint and nextPoint. Between waypoints it therefore
		// rebroadcasts an identical PGN 129302 at whatever rate the Course
		// Provider republishes calcValues. Fixing it well means the digest plus
		// interval gate notifications.ts uses, which is a design change rather
		// than a patch.
		allowResend: false,
		callback: async (delta: unknown): Promise<N2KMessage[]> => {
			if (!courseDeltaTouches(app, delta, ["navigation.course.calcValues"])) return [];
			const method = courseCalculation(app, "calcMethod", delta);
			if (method !== "GreatCircle" && method !== "Rhumbline") return [];
			const course = await currentCourse(app);
			const leg =
				method === "Rhumbline"
					? rhumblineLeg(course?.previousPoint?.position, course?.nextPoint?.position)
					: greatCircleLeg(course?.previousPoint?.position, course?.nextPoint?.position);
			if (
				leg === undefined ||
				!isValidNumber(leg.bearing) ||
				!isValidNumber(leg.distance) ||
				leg.distance < 0 ||
				leg.distance > MAX_DISTANCE_METERS
			) {
				return [];
			}
			const pointIndex = routePointIndex(course);
			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129302,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_SID_ZERO,
						calculationType: method === "Rhumbline" ? "Rhumbline" : "Great Circle",
						bearingReference: "True",
						bearingOriginToDestination: toUnsignedAngle(leg.bearing),
						distance: leg.distance,
						originMarkType: markTypeFor(course?.previousPoint?.type),
						destinationMarkType: markTypeFor(course?.nextPoint?.type),
						originMarkId: pointIndex !== undefined && pointIndex > 0 ? pointIndex : undefined,
						destinationMarkId: pointIndex === undefined ? undefined : pointIndex + 1,
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
									{ path: "navigation.course.calcValues.calcMethod", value: "GreatCircle" },
									{ path: "navigation.course.calcValues.bearingTrackTrue", value: 1.2217 },
									{ path: "navigation.course.calcValues.previousPoint.distance", value: 2000 },
								],
							},
						],
					},
				],
				skSelfData: {
					courseInfo: {
						activeRoute: { pointIndex: 5 },
						previousPoint: {
							type: "RoutePoint",
							position: { latitude: 0, longitude: 0 },
						},
						nextPoint: {
							type: "RoutePoint",
							position: { latitude: 0, longitude: 1 },
						},
					},
				},
				expected: [
					{
						prio: 2,
						pgn: 129302,
						dst: 255,
						fields: {
							sid: 0,
							calculationType: "Great Circle",
							bearingReference: "True",
							bearingOriginToDestination: 1.5708,
							distance: 111_195.08,
							originMarkType: "Waypoint",
							destinationMarkType: "Waypoint",
							originMarkId: 5,
							destinationMarkId: 6,
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
									{ path: "navigation.course.calcValues.calcMethod", value: "GreatCircle" },
									{ path: "navigation.course.calcValues.bearingTrackTrue", value: 1 },
									{ path: "navigation.course.calcValues.previousPoint.distance", value: 100 },
								],
							},
						],
					},
				],
				expected: [],
			},
			{
				input: [
					{
						context: "vessels.self",
						updates: [
							{
								values: [
									{ path: "navigation.course.calcValues.calcMethod", value: "GreatCircle" },
									{ path: "navigation.course.calcValues.bearingTrackTrue", value: 0 },
								],
							},
						],
					},
				],
				skSelfData: {
					courseInfo: {
						previousPoint: { position: { latitude: 0, longitude: 0 } },
						nextPoint: { position: { latitude: 1, longitude: 0 } },
					},
				},
				expected: [
					{
						prio: 2,
						pgn: 129302,
						dst: 255,
						fields: {
							sid: 0,
							calculationType: "Great Circle",
							bearingReference: "True",
							bearingOriginToDestination: 0,
							distance: 111_195.08,
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
								values: [{ path: "navigation.course.calcValues.calcMethod", value: "Rhumbline" }],
							},
						],
					},
				],
				skSelfData: {
					courseInfo: {
						previousPoint: { position: { latitude: 50, longitude: -5 } },
						nextPoint: { position: { latitude: 58, longitude: 10 } },
					},
				},
				expected: [
					{
						prio: 2,
						pgn: 129302,
						dst: 255,
						fields: {
							sid: 0,
							calculationType: "Rhumbline",
							bearingReference: "True",
							bearingOriginToDestination: 0.832,
							distance: 1_320_976.42,
						},
					},
				],
			},
		],
	};
}
