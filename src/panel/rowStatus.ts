import type { PerConversionStatus } from "../api/types.js";
import { humanizeAgo } from "./recency.js";

export type RailState = "emitting" | "silent" | "error" | "disabled";

export interface RowStatus {
	/** Drives the left rail treatment. */
	rail: RailState;
	/** Right-aligned recency text; null when nothing should show (disabled). */
	recency: string | null;
}

/**
 * Derive a conversion row's live-state rail and recency text. Error takes
 * precedence on the rail (it is the most important signal) while the recency
 * text still reports the emit count, so an erroring-yet-emitting conversion
 * reads as both. An enabled conversion never has a blank recency: a quiet one
 * reads "no recent output", which is the load-bearing emitting-versus-silent
 * cue in the night theme where the rail hue cannot carry it.
 */
export function rowStatus(
	status: PerConversionStatus | undefined,
	enabled: boolean,
): RowStatus {
	const rail: RailState = status?.lastErrorMessage
		? "error"
		: status && status.emitCount > 0
			? "emitting"
			: enabled
				? "silent"
				: "disabled";
	let recency: string | null = null;
	if (status && status.emitCount > 0) {
		recency = `${status.emitCount} emits, last ${humanizeAgo(status.lastEmitMs)}`;
	} else if (enabled) {
		recency = "no recent output";
	}
	return { rail, recency };
}
