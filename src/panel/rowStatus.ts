import { formatRelativeAge } from "signalk-nearlcrews-ui";
import type { PerConversionStatus } from "../api/types.js";

export type RailState = "emitting" | "silent" | "error" | "disabled";

export interface RowStatus {
	/** Drives the left rail treatment. */
	rail: RailState;
	/** Right-aligned recency text; null when nothing should show (disabled). */
	recency: string | null;
}

export type ConversionHealth =
	| "emitting"
	| "waiting-input"
	| "publisher-filter-mismatch"
	| "nmea2000-echo-blocked"
	| "input-no-output"
	| "input-stale"
	| "activity-stale";

export function conversionHealth(status: PerConversionStatus | undefined): {
	state: ConversionHealth;
	label: string;
} {
	const dropIsNewest =
		status?.lastDropReason !== undefined &&
		(status.lastEmitMs === undefined ||
			(status.lastDropAgeMs ?? Number.POSITIVE_INFINITY) < status.lastEmitMs) &&
		(status.lastInputMs === undefined ||
			(status.lastDropAgeMs ?? Number.POSITIVE_INFINITY) < status.lastInputMs);
	if (dropIsNewest && status?.lastDropReason === "publisher-filter") {
		return { state: "publisher-filter-mismatch", label: "Publisher filter does not match" };
	}
	if (dropIsNewest && status?.lastDropReason === "nmea2000-echo") {
		return { state: "nmea2000-echo-blocked", label: "NMEA 2000 echo blocked" };
	}
	if ((status?.staleInputPaths?.length ?? 0) > 0) {
		return { state: "input-stale", label: "Previously active input is stale" };
	}
	if (status?.activityStale) {
		return { state: "activity-stale", label: "Expected activity overdue" };
	}
	const emptyIsNewest =
		status?.lastEmptyOutputMs !== undefined &&
		(status.lastEmitMs === undefined || status.lastEmptyOutputMs < status.lastEmitMs);
	if (emptyIsNewest || ((status?.inputCount ?? 0) > 0 && (status?.emitCount ?? 0) === 0)) {
		return { state: "input-no-output", label: "Input received; no encodable output" };
	}
	if ((status?.emitCount ?? 0) > 0) {
		return { state: "emitting", label: "Emitting" };
	}
	return { state: "waiting-input", label: "Waiting for Signal K input" };
}

/**
 * Derive a conversion row's live-state rail and recency text. Error takes
 * precedence on the rail (it is the most important signal) while the recency
 * text still reports the emit count, so an erroring-yet-emitting conversion
 * reads as both. An enabled conversion never has a blank recency: a quiet one
 * reads "no recent output", which is the load-bearing emitting-versus-silent
 * cue in the night theme where the rail hue cannot carry it.
 */
export function rowStatus(status: PerConversionStatus | undefined, enabled: boolean): RowStatus {
	const health = conversionHealth(status);
	const rail: RailState = status?.lastErrorMessage
		? "error"
		: health.state === "emitting"
			? "emitting"
			: enabled
				? "silent"
				: "disabled";
	let recency: string | null = null;
	if (health.state === "emitting" && status && status.emitCount > 0) {
		recency = `${status.emitCount} emits, last ${formatRelativeAge(status.lastEmitMs)}`;
	} else if (enabled) {
		recency = health.label.toLowerCase();
	}
	return { rail, recency };
}
