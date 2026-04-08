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
 * Normalize an angle to the 0–2π range
 * @param angle - Angle in radians (may be negative)
 * @returns Angle normalized to [0, 2π)
 */
export function normalizeAngle(angle: number): number {
	return angle < 0 ? angle + Math.PI * 2 : angle;
}
