import { MAX_N2K_INSTANCE } from "../constants.js";

const TWO_PI = Math.PI * 2;

export function isValidNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** True when a value is an encodable WGS 84 latitude in degrees. */
export function isValidLatitude(value: unknown): value is number {
	return isValidNumber(value) && value >= -90 && value <= 90;
}

/** True when a value is an encodable WGS 84 longitude in degrees. */
export function isValidLongitude(value: unknown): value is number {
	return isValidNumber(value) && value >= -180 && value <= 180;
}

/** True for a non-null, non-array object literal. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

// Keep this pattern usable by both JavaScript RegExp and the HTML pattern
// attribute. The escaped hyphen is required by the HTML pattern attribute's
// Unicode Sets mode.
export const SIGNALK_ID_SEGMENT_PATTERN = String.raw`[A-Za-z0-9_\-]+`;
const SIGNALK_ID_SEGMENT_REGEX = new RegExp(`^${SIGNALK_ID_SEGMENT_PATTERN}$`);

/**
 * True for a safe single-segment identifier used in a Signal K path.
 *
 * Signal K schema groups traditionally document alphanumeric instance ids,
 * but established providers also publish hyphenated and underscored ids. The
 * Venus plugin, for example, emits secondary battery channels as
 * `<instance>-second`. Accept those existing paths while continuing to reject
 * dots, slashes, whitespace, and other characters that could turn an id into
 * a path or malformed configuration.
 */
export function isValidSignalKId(value: unknown): value is string {
	return typeof value === "string" && SIGNALK_ID_SEGMENT_REGEX.test(value);
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

/** Return a finite number only when it is inside an inclusive wire range. */
export function toFiniteInRange(value: unknown, min: number, max: number): number | undefined {
	return isValidNumber(value) && value >= min && value <= max ? value : undefined;
}

/** Convert a canonical Signal K relative-humidity ratio to NMEA 2000 percent. */
export function toRelativeHumidityPercent(value: unknown): number | null {
	return isValidNumber(value) && value >= 0 && value <= 1 ? value * 100 : null;
}

// Clamps a number into the inclusive [min, max] range. Replaces the hand-rolled
// Math.max(min, Math.min(max, x)) idiom used across the codebase.
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// Shared reader for the per-conversion `instance` and `n2kSource` extras that
// the temperature (130312/130316) and humidity (130313) factories support. The
// plugin-manager flattens each conversion's `extras` record onto the options
// object, so both keys are read top-level (not nested under the optionKey). A
// missing or invalid key falls back to the per-source default; the instance is
// clamped to the encodable uint8 data range so a hand-typed out-of-range value
// cannot wrap into the reserved / not-available sentinels on the wire.
export function resolveInstanceAndSource(
	options: unknown,
	defaultInstance: number,
	defaultSource: string,
): { instance: number; source: string } {
	const o = (options ?? {}) as { instance?: unknown; n2kSource?: unknown };
	const rawInstance = isValidNumber(o.instance) ? o.instance : defaultInstance;
	const instance = clamp(Math.trunc(rawInstance), 0, MAX_N2K_INSTANCE);
	const source =
		typeof o.n2kSource === "string" && o.n2kSource.trim() !== "" ? o.n2kSource : defaultSource;
	return { instance, source };
}

// Modulo-wraps any real angle into [0, 2π); a single-turn shift would corrupt
// inputs outside [-2π, 2π].
function normalizeAngle(angle: number): number {
	return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

// Unsigned NMEA 2000 angle fields (heading, COG, bearing, set) are uint16
// values in [0, 2 pi): an out-of-range input wraps by the field modulus
// (65536 raw units), not by 2 pi, so a negative or >2 pi angle would encode
// as a wrong direction. Normalize before the field. null and undefined pass
// through unchanged; a non-finite number returns undefined. Both null and
// undefined encode as the "not available" sentinel on the wire.
export function toUnsignedAngle(value: number | null | undefined): number | null | undefined {
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
export function clampString(value: string | undefined, maxChars: number): string | undefined;
export function clampString(value: unknown, maxChars: number): string | undefined {
	if (typeof value !== "string") return undefined;
	return value.length <= maxChars ? value : value.slice(0, maxChars);
}
