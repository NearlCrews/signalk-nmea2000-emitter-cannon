export interface Position {
	latitude?: number;
	longitude?: number;
}

export interface Waypoint {
	id?: number;
	name?: string;
	position?: Position;
	bearingFromOrigin?: number;
	distanceFromOrigin?: number;
	description?: string;
}

export const DEFAULT_ROUTE_NAME = "ACTIVE_ROUTE";

// PGN 129285 (Route/Waypoint) carries up to 8 waypoints per frame.
export const MAX_RPS_WAYPOINTS = 8;
// PGN 130074 (Route WP List) carries up to 16 waypoints per frame.
export const MAX_WP_LIST_WAYPOINTS = 16;
