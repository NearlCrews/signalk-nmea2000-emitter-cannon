import { isValidNumber } from "../utils/validation.js";

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

// Waypoint and route names are STRING_LAU fields. 16 chars keeps a full
// 16-waypoint PGN 130074 under the encoder buffer limit; see clampString.
export const MAX_WP_NAME_CHARS = 16;
export const MAX_ROUTE_NAME_CHARS = 32;

// Filters waypoints with valid latitude/longitude and projects each via the
// transform; out-of-range entries are dropped.
export function mapValidWaypoints<T>(
	waypoints: unknown,
	max: number,
	transform: (wp: Waypoint, index: number) => T,
): T[] {
	if (!Array.isArray(waypoints)) return [];
	return waypoints.slice(0, max).flatMap((wp: Waypoint, index: number) => {
		const lat = wp.position?.latitude;
		const lon = wp.position?.longitude;
		if (!isValidNumber(lat) || !isValidNumber(lon)) return [];
		return [transform(wp, index)];
	});
}
