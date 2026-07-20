import { MAX_N2K_INSTANCE } from "../constants.js";
import { clamp, isPlainObject, isValidNumber, isValidSignalKId } from "../utils/validation.js";

/**
 * Read a per-instance config array (engines, batteries, chargers, tanks, ...)
 * off a factory module's untyped `options`. Returns `[]` unless the keyed value
 * is actually an array, so a malformed-but-truthy config (e.g. an object where
 * an array was expected) can never reach `.map` and throw. Non-object rows are
 * also discarded before callers access fields on them. Callers normalize the
 * fields they consume because extras are intentionally untyped.
 */
export function instanceList<T>(options: unknown, key: string): T[] {
	const coll =
		options && typeof options === "object" ? (options as Record<string, unknown>)[key] : undefined;
	return Array.isArray(coll) ? (coll.filter(isPlainObject) as T[]) : [];
}

/** Validate a Signal K schema id segment, including established numeric ids. */
export function isValidInstanceSignalKId(value: unknown): value is string | number {
	return (
		isValidSignalKId(value) ||
		(typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
	);
}

/** Normalize an NMEA 2000 instance without admitting reserved byte values. */
export function normalizedN2kInstance(
	value: unknown,
	max: number = MAX_N2K_INSTANCE,
): number | undefined {
	return isValidNumber(value) ? clamp(Math.trunc(value), 0, max) : undefined;
}

/** Parse a three-segment Signal K tank path without restricting schema-valid ids. */
export function parseSignalKTankPath(
	value: unknown,
): { type: string; id: string; path: string } | null {
	if (typeof value !== "string") return null;
	const segments = value.split(".");
	const type = segments[1];
	const id = segments[2];
	if (segments.length !== 3 || segments[0] !== "tanks" || !type || !id) return null;
	return { type, id, path: value };
}
