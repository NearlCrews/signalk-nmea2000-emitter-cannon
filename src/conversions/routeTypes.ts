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

// Upper bound on candidate waypoints considered per frame (PGN 129285 and
// 130074), before the fast-packet byte budget trims further. A single
// fast-packet route frame holds at most ~17 waypoints even with empty names,
// so this ceiling only caps how many raw entries we process;
// packWaypointsToBudget is the authoritative on-wire bound. See
// FAST_PACKET_MAX_BYTES.
export const MAX_CANDIDATE_WAYPOINTS = 18;

// Waypoint and route names are STRING_LAU fields. 16 chars bounds each name so
// a frame holds a useful number of waypoints within the fast-packet limit and
// keeps every name well under the encoder buffer; see clampString and
// packWaypointsToBudget.
const MAX_WP_NAME_CHARS = 16;
export const MAX_ROUTE_NAME_CHARS = 32;

// NMEA 2000 fast packet tops out at 223 bytes (32 frames, a 5-bit sequence
// counter: 6 + 31 * 7). A PGN larger than this cannot be transmitted as a
// single fast packet, so a receiver (Garmin, B&G) silently drops or truncates
// it. PGN 129285 and 130074 are variable-length route frames, so the waypoint
// count has to be bounded by the ENCODED byte size, not a fixed waypoint count.
const FAST_PACKET_MAX_BYTES = 223;

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
type WaypointEntry = {
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

// Test-fixture builders for the fast-packet budget regression tests shared by
// routeWaypoint.ts (PGN 129285) and routeWpList.ts (PGN 130074). Every
// waypoint gets a 16-char name ("WAYPOINT-LONG-0N", exactly MAX_WP_NAME_CHARS)
// so the per-row byte cost is fixed and the packed-count expectations are
// exact.
export function longNameWaypoints(count: number): Waypoint[] {
	return Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		name: `WAYPOINT-LONG-0${i + 1}`,
		position: { latitude: 39 + i, longitude: -76 - i },
	}));
}

// The expected decoded `list` rows for the first `count` longNameWaypoints,
// built through the same toWaypointEntry the conversions use.
export function longNameWaypointEntries(count: number): WaypointEntry[] {
	return longNameWaypoints(count).map(toWaypointEntry);
}

// Fixed bytes per waypoint row in both PGN 129285 and 130074: wpId(2) +
// wpLatitude(4) + wpLongitude(4) + the STRING_LAU name's length-and-control
// prefix(2). Each name character adds one byte (canboatjs writes one byte per
// code unit), so a row is WAYPOINT_ROW_FIXED_BYTES + wpName.length bytes.
const WAYPOINT_ROW_FIXED_BYTES = 12;

// Greedily keep the leading waypoints whose encoded rows fit the fast-packet
// budget after the PGN's fixed header (headerBytes). Returns the packed prefix;
// any tail that would push the frame past FAST_PACKET_MAX_BYTES is dropped so
// the emitted PGN stays transmittable on the bus. Names are already clamped by
// toWaypointEntry.
export function packWaypointsToBudget(
	entries: WaypointEntry[],
	headerBytes: number,
): WaypointEntry[] {
	const budget = FAST_PACKET_MAX_BYTES - headerBytes;
	const packed: WaypointEntry[] = [];
	let used = 0;
	for (const entry of entries) {
		const rowBytes = WAYPOINT_ROW_FIXED_BYTES + entry.wpName.length;
		if (used + rowBytes > budget) break;
		used += rowBytes;
		packed.push(entry);
	}
	return packed;
}
