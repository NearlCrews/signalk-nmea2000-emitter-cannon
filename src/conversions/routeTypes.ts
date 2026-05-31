import { clampString, isValidNumber } from "../utils/validation.js";

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

// canboat MARK_TYPE entries: Collision, Turning point, Reference, Wheelover,
// Waypoint. SK only emits "waypoint"; everything else maps to "Reference"
// since the canonical lookup has no generic "mark" entry. Shared by PGN 129301
// (timeToMark) and PGN 129302 (bearingDistanceBetweenMarks) so the mapping
// cannot drift between the two.
export const markTypeFor = (t: unknown): "Waypoint" | "Reference" =>
	t === "waypoint" ? "Waypoint" : "Reference";

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

// A `type` alias (not an interface) so it carries the implicit index signature
// that lets a WaypointEntry[] satisfy the N2KMessage `list` field, matching the
// inline object literals these PGNs used before the builder was shared.
export type WaypointEntry = {
	wpId: number;
	wpName: string;
	wpLatitude: number | undefined;
	wpLongitude: number | undefined;
};

// The repeating-set entry shared by PGN 129285 (Route/WP info) and PGN 130074
// (Route WP List). When Signal K omits a numeric id or a name, both the id and
// the synthesized name fall back to the 0-based list index, matching the
// 0-based startRps / startWpId those PGNs already emit. Sharing one builder
// keeps the wpId/wpName for a given waypoint identical across both PGNs.
export function toWaypointEntry(wp: Waypoint, index: number): WaypointEntry {
	return {
		wpId: wp.id ?? index,
		wpName: clampString(wp.name || `WP${index}`, MAX_WP_NAME_CHARS),
		wpLatitude: wp.position?.latitude,
		wpLongitude: wp.position?.longitude,
	};
}
