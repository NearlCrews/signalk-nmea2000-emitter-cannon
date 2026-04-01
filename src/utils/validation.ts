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
 * Check if a value is a valid non-empty string
 * @param value - Value to check
 * @returns True if value is a non-empty string
 */
export function isValidString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Check if a value is a valid boolean
 * @param value - Value to check
 * @returns True if value is a boolean
 */
export function isValidBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
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
 * Coerce a value to a valid string or return null
 * @param value - Value to coerce
 * @returns The string if valid, null otherwise
 */
export function toValidString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}
