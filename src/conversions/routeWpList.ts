import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";

interface Position {
	latitude?: number;
	longitude?: number;
}

interface RouteWaypoint {
	id?: number;
	name?: string;
	position?: Position;
	bearingFromOrigin?: number;
	distanceFromOrigin?: number;
	description?: string;
}

export default function createRouteWpListConversion(): ConversionModule {
	return {
		title: "Route WP List (130074)",
		optionKey: "ROUTE_WP_LIST",
		keys: [
			"navigation.course.activeRoute.waypoints",
			"navigation.course.activeRoute.name",
			"navigation.course.activeRoute.reverse",
		],
		callback: (
			waypoints: unknown,
			routeName: unknown,
			reverse: unknown,
		): N2KMessage[] => {
			if (!waypoints || !Array.isArray(waypoints) || waypoints.length === 0) {
				return [];
			}

			// Prepare waypoint list data (limit to reasonable number for single message)
			const wpList = waypoints
				.slice(0, 16)
				.map((wp: RouteWaypoint, index: number) => {
					return {
						wpId: wp.id || index + 1,
						wpName: wp.name || `WP${index + 1}`,
						wpLatitude: wp.position?.latitude || 0,
						wpLongitude: wp.position?.longitude || 0,
						wpBearingFromOrigin: wp.bearingFromOrigin || 0,
						wpDistanceFromOrigin: wp.distanceFromOrigin || 0,
						wpDescription: wp.description || "",
					};
				});

			const routeNameString =
				typeof routeName === "string" ? routeName : "ACTIVE_ROUTE";
			const isReverse = typeof reverse === "boolean" ? reverse : false;

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 130074,
					dst: N2K_BROADCAST_DST,
					fields: {
						startWp: 0, // Starting waypoint index
						nitems: Math.min(waypoints.length, 16),
						databaseId: 1,
						routeId: 1,
						navigationDirectionInRoute: isReverse ? "Reverse" : "Forward",
						routeName: routeNameString,
						reserved: 0,
						list: wpList,
					},
				},
			];
		},
		tests: [
			{
				input: [
					[
						{
							id: 1,
							name: "START",
							position: { latitude: 39.0458, longitude: -76.6413 },
							bearingFromOrigin: 0,
							distanceFromOrigin: 0,
							description: "Starting point",
						},
						{
							id: 2,
							name: "TURN1",
							position: { latitude: 39.2904, longitude: -76.6122 },
							bearingFromOrigin: 0.785,
							distanceFromOrigin: 27130,
							description: "First turn",
						},
						{
							id: 3,
							name: "DEST",
							position: { latitude: 39.3504, longitude: -76.5422 },
							bearingFromOrigin: 1.047,
							distanceFromOrigin: 35420,
							description: "Destination",
						},
					],
					"Baltimore Harbor Route",
					false,
				],
				expected: [
					{
						prio: 2,
						pgn: 130074,
						dst: 255,
						fields: {
							databaseId: 1,
							nitems: 3,
							reserved: 0,
							list: [
								{
									wpId: 1,
									wpName: "START",
									wpLatitude: 39.0458,
									wpLongitude: -76.6413,
								},
								{
									wpId: 2,
									wpName: "TURN1",
									wpLatitude: 39.2904,
									wpLongitude: -76.6122,
								},
								{
									wpId: 3,
									wpName: "DEST",
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
