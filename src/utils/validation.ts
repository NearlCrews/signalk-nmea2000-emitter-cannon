/**
 * Validation utilities for conversion modules
 */

/**
 * Check if a value is a valid finite number (not NaN, not Infinity)
 * @param value - Value to check
 * @returns True if value is a finite number
 */
export function isValidNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * Coerce a value to a valid number or return null
 * @param value - Value to coerce
 * @returns The number if valid, null otherwise
 */
export function toValidNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	return null;
}

/**
 * Normalize an angle to the 0–2π range. Handles inputs outside
 * [-2π, 2π] via a full modulo wrap — the prior implementation added one
 * turn only, which silently corrupted angles below -2π.
 *
 * @param angle - Angle in radians (any real value)
 * @returns Angle normalized to [0, 2π)
 */
export function normalizeAngle(angle: number): number {
	const twoPi = Math.PI * 2;
	return ((angle % twoPi) + twoPi) % twoPi;
}
