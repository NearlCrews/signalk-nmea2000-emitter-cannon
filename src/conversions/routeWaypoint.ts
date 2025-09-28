import type { ConversionModule, N2KMessage } from '../types/index.js';

interface Position {
  latitude?: number;
  longitude?: number;
}

interface Waypoint {
  id?: number;
  name?: string;
  position?: Position;
}

export default function createRouteWaypointConversion(): ConversionModule {
  return {
    title: "Route and Waypoint Information (129285)",
    optionKey: "ROUTE_WAYPOINT",
    keys: [
      "navigation.course.nextPoint.position",
      "navigation.course.activeRoute.name",
      "navigation.course.activeRoute.waypoints",
    ],
    timeouts: [60000, 60000, 60000], // 1 minute
    callback: (nextPosition: unknown, routeName: unknown, waypoints: unknown): N2KMessage[] => {
      // Send route info if we have active navigation data
      if (!nextPosition && !routeName && !waypoints) {
        return [];
      }

      let wpData: Array<{
        "WP ID": number;
        "WP Name": string;
        "WP Latitude": number;
        "WP Longitude": number;
      }> = [];

      if (waypoints && Array.isArray(waypoints)) {
        // Take first few waypoints (NMEA2000 has limited message size)
        wpData = waypoints.slice(0, 8).map((wp: Waypoint, index: number) => ({
          "WP ID": wp.id || index,
          "WP Name": wp.name || `WP${index}`,
          "WP Latitude": wp.position?.latitude || 0,
          "WP Longitude": wp.position?.longitude || 0,
        }));
      }

      const routeNameString = typeof routeName === 'string' ? routeName : "ACTIVE_ROUTE";

      return [
        {
          prio: 2,
          pgn: 129285,
          dst: 255,
          fields: {
            startRps: 0,
            nitems: wpData.length,
            databaseId: 1,
            routeId: 1,
            navigationDirectionInRoute: "Forward",
            supplementaryRouteWpDataAvailable: wpData.length > 0 ? "Yes" : "No",
            routeName: routeNameString,
            list: wpData.map((wp) => ({
              wpId: wp["WP ID"],
              wpName: wp["WP Name"],
              wpLatitude: wp["WP Latitude"],
              wpLongitude: wp["WP Longitude"],
            })),
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
              supplementaryRouteWpDataAvailable: "Yes",
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
