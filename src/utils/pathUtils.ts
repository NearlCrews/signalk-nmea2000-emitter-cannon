/**
 * Utility functions for working with Signal K paths and property names
 */

/**
 * Convert a Signal K path to a property name for configuration
 * Removes dots to create a valid property name
 *
 * @param path - Signal K path like 'propulsion.engine.temperature'
 * @returns Property name like 'propulsionenginetemperature'
 */
export function pathToPropName(path: string): string {
  return path.replace(/\./g, "");
}

/**
 * Check if a value is defined (not undefined)
 *
 * @param value - Value to check
 * @returns true if value is not undefined
 */
export function isDefined<T>(value: T | undefined): value is T {
  return typeof value !== "undefined";
}
