// Runtime-neutral source matching and origin classification shared by the
// stream runtime, Advisor, and setup wizard.

export const SOURCE_ORIGIN = {
	NMEA2000: "nmea2000",
	NON_NMEA2000: "non-nmea2000",
	UNKNOWN: "unknown",
} as const;

export type SourceOrigin = (typeof SOURCE_ORIGIN)[keyof typeof SOURCE_ORIGIN];

interface StructuredSource {
	type?: unknown;
	src?: unknown;
	pgn?: unknown;
	canName?: unknown;
}

/**
 * Match a Signal K `$source` exactly or at a dot-segment boundary.
 *
 * A filter of `gps1` therefore accepts `gps1` and `gps1.0`, but not `gps10`
 * or `gps10.0`.
 */
export function sourceMatchesFilter(source: string, filter: string): boolean {
	if (source.length === 0 || filter.length === 0) return false;
	return source === filter || source.startsWith(`${filter}.`);
}

function originFromType(type: unknown): SourceOrigin {
	if (typeof type !== "string" || type.trim().length === 0) return SOURCE_ORIGIN.UNKNOWN;
	return type.trim().toUpperCase() === "NMEA2000"
		? SOURCE_ORIGIN.NMEA2000
		: SOURCE_ORIGIN.NON_NMEA2000;
}

function originFromStructuredSource(source: StructuredSource | null | undefined): SourceOrigin {
	const typedOrigin = originFromType(source?.type);
	if (typedOrigin !== SOURCE_ORIGIN.UNKNOWN) return typedOrigin;
	if (!source) return SOURCE_ORIGIN.UNKNOWN;

	// NMEA 2000 deltas can carry protocol identity without an explicit type.
	// Do not fall back to source-label spelling: src, pgn, and canName are
	// structured bus metadata, while a numeric suffix in `$source` is not.
	if (
		(typeof source.src === "number" && Number.isInteger(source.src)) ||
		(typeof source.src === "string" && source.src.trim().length > 0) ||
		(typeof source.pgn === "number" && Number.isInteger(source.pgn)) ||
		(typeof source.canName === "string" && source.canName.trim().length > 0)
	) {
		return SOURCE_ORIGIN.NMEA2000;
	}
	return SOURCE_ORIGIN.UNKNOWN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve a source reference against Signal K's authoritative `sources` tree.
 *
 * Source labels may themselves contain dots, so splitting at the first or
 * last dot is ambiguous. Instead, choose the longest metadata key that is an
 * exact or dot-boundary prefix of the observed `$source`.
 */
function originFromMetadata(sourceRef: string, sourceMetadata: unknown): SourceOrigin {
	if (!isRecord(sourceMetadata)) return SOURCE_ORIGIN.UNKNOWN;

	let bestLength = -1;
	let bestOrigin: SourceOrigin = SOURCE_ORIGIN.UNKNOWN;
	for (const [label, metadata] of Object.entries(sourceMetadata)) {
		if (!sourceMatchesFilter(sourceRef, label) || !isRecord(metadata)) continue;
		const origin = originFromType(metadata.type);
		if (origin !== SOURCE_ORIGIN.UNKNOWN && label.length > bestLength) {
			bestLength = label.length;
			bestOrigin = origin;
		}
	}
	return bestOrigin;
}

/**
 * Classify a Signal K source without guessing from its textual shape.
 *
 * The structured source attached to a live NormalizedDelta is the strongest
 * signal. The server's `sources` tree is the fallback used by inventory-based
 * code. A trailing numeric address or CAN name is never sufficient by itself:
 * plugin publishers such as `venus.com.victronenergy.temperature.24` use the
 * same shape.
 */
export function classifySourceOrigin(
	sourceRef: string,
	structuredSource?: StructuredSource | null,
	sourceMetadata?: unknown,
): SourceOrigin {
	const structuredOrigin = originFromStructuredSource(structuredSource);
	if (structuredOrigin !== SOURCE_ORIGIN.UNKNOWN) return structuredOrigin;

	const metadataOrigin = originFromMetadata(sourceRef, sourceMetadata);
	if (metadataOrigin !== SOURCE_ORIGIN.UNKNOWN) return metadataOrigin;

	// Emitter Cannon's existing AIS echo guard uses this explicit synthetic
	// label. Keep recognizing it without reviving numeric-suffix guessing.
	if (sourceRef === "NMEA2000") return SOURCE_ORIGIN.NMEA2000;
	return SOURCE_ORIGIN.UNKNOWN;
}

/** Backward-compatible boolean form for callers that only need an echo test. */
export function isN2KSource(label: string, sourceMetadata?: unknown): boolean {
	return classifySourceOrigin(label, undefined, sourceMetadata) === SOURCE_ORIGIN.NMEA2000;
}
