import type { StatusSnapshot } from "../api/types.js";

export type OutputState = "loading" | "inactive" | "waiting" | "ready";

/** Derive the user-facing output state from the status API contract. */
export function outputStateFor(
	status: Pick<StatusSnapshot, "pluginRunning" | "nmea2000Ready"> | null,
): OutputState {
	if (status === null) return "loading";
	if (!status.pluginRunning) return "inactive";
	return status.nmea2000Ready ? "ready" : "waiting";
}
