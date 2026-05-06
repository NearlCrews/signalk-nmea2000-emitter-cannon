import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import type { Waypoint } from "./routeTypes.js";
import { DEFAULT_ROUTE_NAME } from "./routeTypes.js";

const ROUTE_TIMEOUT_MS = 60000;

export default function createRouteWaypointConversion(): ConversionModule {
	return {
		title: "Route and Waypoint Information (129285)",
		optionKey: "ROUTE_WAYPOINT",
		keys: [
			"navigation.course.nextPoint.position",
			"navigation.course.activeRoute.name",
			"navigation.course.activeRoute.waypoints",
		],
		timeouts: [ROUTE_TIMEOUT_MS, ROUTE_TIMEOUT_MS, ROUTE_TIMEOUT_MS],
		callback: (
			nextPosition: unknown,
			routeName: unknown,
			waypoints: unknown,
		): N2KMessage[] => {
			if (!nextPosition && !routeName && !waypoints) {
				return [];
			}

			const list = Array.isArray(waypoints)
				? waypoints.slice(0, 8).map((wp: Waypoint, index: number) => ({
						wpId: wp.id ?? index,
						wpName: wp.name || `WP${index}`,
						wpLatitude: wp.position?.latitude ?? 0,
						wpLongitude: wp.position?.longitude ?? 0,
					}))
				: [];

			const routeNameString =
				typeof routeName === "string" ? routeName : DEFAULT_ROUTE_NAME;

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
						supplementaryRouteWpDataAvailable: list.length > 0 ? "Yes" : "No",
						routeName: routeNameString,
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
							supplementaryRouteWpDataAvailable: "Off",
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
		],
	};
}
