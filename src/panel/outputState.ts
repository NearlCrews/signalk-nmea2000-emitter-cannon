import type { StatusTone } from "signalk-nearlcrews-ui";
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

/**
 * Presentation of each state, beside the state itself so the toolbar chip and
 * the Status metric can never disagree.
 */
export const OUTPUT_STATE_TONES: Record<OutputState, StatusTone> = {
	loading: "neutral",
	inactive: "neutral",
	waiting: "warning",
	ready: "success",
};

/**
 * What each state means to the user. The raw identifiers read as debug output
 * and "waiting" does not say what for, so nothing renders the union member.
 */
export const OUTPUT_STATE_LABELS: Record<OutputState, string> = {
	loading: "Loading",
	inactive: "Plugin not running",
	waiting: "Waiting for the NMEA 2000 bus",
	ready: "Emitting",
};
