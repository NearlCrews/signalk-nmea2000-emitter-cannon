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
