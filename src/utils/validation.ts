const TWO_PI = Math.PI * 2;

export function isValidNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** True for a non-null, non-array object literal. */
export function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toValidNumber(value: unknown): number | null {
	return isValidNumber(value) ? value : null;
}

// The undefined-returning analogue of toValidNumber, for the many NMEA 2000
// fields that omit a value by leaving it undefined rather than encoding a null
// sentinel. A non-number or non-finite input returns undefined.
export function toFiniteOrUndefined(value: unknown): number | undefined {
	return isValidNumber(value) ? value : undefined;
}

// Clamps a number into the inclusive [min, max] range. Replaces the hand-rolled
// Math.max(min, Math.min(max, x)) idiom used across the codebase.
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// Modulo-wraps any real angle into [0, 2π); a single-turn shift would corrupt
// inputs outside [-2π, 2π].
export function normalizeAngle(angle: number): number {
	return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

// Unsigned NMEA 2000 angle fields (heading, COG, bearing, set) are uint16
// values in [0, 2 pi): an out-of-range input wraps by the field modulus
// (65536 raw units), not by 2 pi, so a negative or >2 pi angle would encode
// as a wrong direction. Normalize before the field. null and undefined pass
// through unchanged; a non-finite number returns undefined. Both null and
// undefined encode as the "not available" sentinel on the wire.
export function toUnsignedAngle(
	value: number | null | undefined,
): number | null | undefined {
	if (value === null || value === undefined) return value;
	if (!Number.isFinite(value)) return undefined;
	return normalizeAngle(value);
}

// Truncates a string so it cannot overflow a fixed-width or length-prefixed
// NMEA 2000 string field. canboatjs encodes every PGN into a 500-byte buffer
// and throws past it; that throw is re-raised uncatchably by signalk-server's
// safeApply, so an unclamped field can crash the host process. maxChars counts
// JS code units: marine string fields are ASCII, so this matches byte width.
// Non-string input (Signal K providers occasionally publish numbers, objects,
// or null where a string is expected) returns undefined rather than crashing
// at .slice; callers can then fall back to a sentinel or skip the field.
export function clampString(value: string, maxChars: number): string;
export function clampString(
	value: string | undefined,
	maxChars: number,
): string | undefined;
export function clampString(
	value: unknown,
	maxChars: number,
): string | undefined {
	if (typeof value !== "string") return undefined;
	return value.length <= maxChars ? value : value.slice(0, maxChars);
}
