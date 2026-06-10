import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SLOW_DATA_TIMEOUT_MS,
} from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { clampString, isValidNumber } from "../utils/validation.js";
import {
	DEFAULT_ROUTE_NAME,
	MAX_ROUTE_NAME_CHARS,
	MAX_RPS_WAYPOINTS,
	mapValidWaypoints,
	type Position,
	packWaypointsToBudget,
	toWaypointEntry,
} from "./routeTypes.js";

export default function createRouteWaypointConversion(): ConversionModule {
	return {
		title: "Route and Waypoint Information (PGN 129285)",
		optionKey: "ROUTE_WAYPOINT",
		category: "navigation",
		// v2 navigation.course.* is not pushed into the v1 streambundle;
		// the v1 sibling under navigation.courseGreatCircle.* matches the
		// live-server path for nextPoint.position and is the spec-canonical
		// home for activeRoute when a route is active.
		keys: [
			"navigation.courseGreatCircle.nextPoint.position",
			"navigation.courseGreatCircle.activeRoute.name",
			"navigation.courseGreatCircle.activeRoute.waypoints",
		],
		timeouts: [
			SLOW_DATA_TIMEOUT_MS,
			SLOW_DATA_TIMEOUT_MS,
			SLOW_DATA_TIMEOUT_MS,
		],
		callback: (
			nextPosition: unknown,
			routeName: unknown,
			waypoints: unknown,
		): N2KMessage[] => {
			if (!nextPosition && !routeName && !waypoints) {
				return [];
			}

			const routeNameString =
				typeof routeName === "string" ? routeName : DEFAULT_ROUTE_NAME;
			const clampedRouteName = clampString(
				routeNameString,
				MAX_ROUTE_NAME_CHARS,
			);

			// Pack the waypoint list against the 223-byte fast-packet budget. The
			// PGN 129285 fixed header is 12 bytes (startRps, nItems, databaseId,
			// routeId, the direction-and-flags byte, the reserved byte, and the
			// route name's STRING_LAU length-and-control prefix) plus the route
			// name's characters, so the per-frame waypoint count shrinks as the
			// route name grows.
			const list = packWaypointsToBudget(
				mapValidWaypoints(waypoints, MAX_RPS_WAYPOINTS, toWaypointEntry),
				12 + clampedRouteName.length,
			);

			// PGN 129285 with nitems=0 is malformed per spec. Skip the emission
			// when neither a waypoint list nor a nextPoint position is present:
			// a route name alone is not enough to describe a route.
			const pos = nextPosition as Position | null | undefined;
			const hasNextPosition =
				isValidNumber(pos?.latitude) && isValidNumber(pos?.longitude);
			if (list.length === 0 && !hasNextPosition) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129285,
					dst: N2K_BROADCAST_DST,
					fields: {
						startRps: 0,
						nitems: list.length,
						databaseId: 1,
						routeId: 1,
						navigationDirectionInRoute: "Forward",
						supplementaryRouteWpDataAvailable: list.length > 0 ? "On" : "Off",
						routeName: clampedRouteName,
						list,
					},
				},
			];
		},
		tests: [
			{
				input: [
					{ latitude: 39.2904, longitude: -76.6122 },
					"Test Route",
					[
						{
							id: 1,
							name: "WP001",
							position: { latitude: 39.2904, longitude: -76.6122 },
						},
						{
							id: 2,
							name: "WP002",
							position: { latitude: 39.3504, longitude: -76.5422 },
						},
					],
				],
				expected: [
					{
						prio: 2,
						pgn: 129285,
						dst: 255,
						fields: {
							startRps: 0,
							nitems: 2,
							databaseId: 1,
							routeId: 1,
							navigationDirectionInRoute: "Forward",
							supplementaryRouteWpDataAvailable: "On",
							routeName: "Test Route",
							list: [
								{
									wpId: 1,
									wpName: "WP001",
									wpLatitude: 39.2904,
									wpLongitude: -76.6122,
								},
								{
									wpId: 2,
									wpName: "WP002",
									wpLatitude: 39.3504,
									wpLongitude: -76.5422,
								},
							],
						},
					},
				],
			},
			{
				// Regression: an over-long route name or waypoint name must be
				// clamped before reaching the STRING_LAU fields of PGN 129285.
				input: [
					{ latitude: 39.2904, longitude: -76.6122 },
					"R".repeat(40),
					[
						{
							id: 1,
							name: "W".repeat(25),
							position: { latitude: 39.2904, longitude: -76.6122 },
						},
					],
				],
				expected: [
					{
						prio: 2,
						pgn: 129285,
						dst: 255,
						fields: {
							startRps: 0,
							nitems: 1,
							databaseId: 1,
							routeId: 1,
							navigationDirectionInRoute: "Forward",
							supplementaryRouteWpDataAvailable: "On",
							routeName: "R".repeat(32),
							list: [
								{
									wpId: 1,
									wpName: "W".repeat(16),
									wpLatitude: 39.2904,
									wpLongitude: -76.6122,
								},
							],
						},
					},
				],
			},
			{
				// Regression: a long route is trimmed to the 223-byte fast-packet
				// budget. With a 32-char route name (44-byte header) only six
				// 16-char-named waypoints fit (6 * 28 + 44 = 212); the seventh and
				// eighth are dropped and nitems tracks the packed count.
				input: [
					{ latitude: 40, longitude: -75 },
					"R".repeat(32),
					Array.from({ length: 8 }, (_, i) => ({
						id: i + 1,
						name: `WAYPOINT-LONG-0${i + 1}`,
						position: { latitude: 39 + i, longitude: -76 - i },
					})),
				],
				expected: [
					{
						prio: 2,
						pgn: 129285,
						dst: 255,
						fields: {
							startRps: 0,
							nitems: 6,
							databaseId: 1,
							routeId: 1,
							navigationDirectionInRoute: "Forward",
							supplementaryRouteWpDataAvailable: "On",
							routeName: "R".repeat(32),
							list: Array.from({ length: 6 }, (_, i) => ({
								wpId: i + 1,
								wpName: `WAYPOINT-LONG-0${i + 1}`,
								wpLatitude: 39 + i,
								wpLongitude: -76 - i,
							})),
						},
					},
				],
			},
		],
	};
}
