import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import {
	MAX_WP_LIST_WAYPOINTS,
	mapValidWaypoints,
	toWaypointEntry,
} from "./routeTypes.js";

export default function createRouteWpListConversion(): ConversionModule {
	return {
		title: "Route and Waypoint List (PGN 130074)",
		optionKey: "ROUTE_WP_LIST",
		category: "navigation",
		// v2 navigation.course.* is not pushed into the v1 streambundle;
		// subscribe to the v1 sibling under navigation.courseGreatCircle.*.
		keys: [
			"navigation.courseGreatCircle.activeRoute.waypoints",
			"navigation.courseGreatCircle.activeRoute.name",
			"navigation.courseGreatCircle.activeRoute.reverse",
		],
		callback: (
			waypoints: unknown,
			_routeName: unknown,
			_reverse: unknown,
		): N2KMessage[] => {
			if (!waypoints || !Array.isArray(waypoints) || waypoints.length === 0) {
				return [];
			}

			// PGN 130074 carries only the waypoint list; route metadata
			// (name, direction) belongs to PGN 129285.
			const wpList = mapValidWaypoints(
				waypoints,
				MAX_WP_LIST_WAYPOINTS,
				toWaypointEntry,
			);

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 130074,
					dst: N2K_BROADCAST_DST,
					fields: {
						startWpId: 0,
						nitems: wpList.length,
						numberOfValidWpsInTheWpList: wpList.length,
						databaseId: 1,
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
						},
						{
							id: 2,
							name: "TURN1",
							position: { latitude: 39.2904, longitude: -76.6122 },
						},
						{
							id: 3,
							name: "DEST",
							position: { latitude: 39.3504, longitude: -76.5422 },
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
							numberOfValidWpsInTheWpList: 3,
							startWpId: 0,
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
			{
				// Regression: an over-long waypoint name must be clamped before
				// reaching the STRING_LAU field of PGN 130074.
				input: [
					[
						{
							id: 1,
							name: "W".repeat(30),
							position: { latitude: 39.0458, longitude: -76.6413 },
						},
					],
					"Some Route",
					false,
				],
				expected: [
					{
						prio: 2,
						pgn: 130074,
						dst: 255,
						fields: {
							databaseId: 1,
							nitems: 1,
							numberOfValidWpsInTheWpList: 1,
							startWpId: 0,
							list: [
								{
									wpId: 1,
									wpName: "W".repeat(16),
									wpLatitude: 39.0458,
									wpLongitude: -76.6413,
								},
							],
						},
					},
				],
			},
		],
	};
}
