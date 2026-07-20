export interface Position {
	latitude?: number;
	longitude?: number;
}

// canboat MARK_TYPE entries: Collision, Turning point, Reference, Wheelover,
// Waypoint. The Course API uses Waypoint and RoutePoint spellings; other
// explicit types map to Reference, while a missing type stays unavailable.
export const markTypeFor = (type: unknown): "Waypoint" | "Reference" | undefined => {
	if (typeof type !== "string") return undefined;
	return ["waypoint", "routepoint"].includes(type.toLowerCase()) ? "Waypoint" : "Reference";
};
