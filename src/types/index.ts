/**
 * Type definitions for Signal K to NMEA 2000 conversion plugin
 */

export type * from "./nmea2000.js";
export type * from "./plugin.js";
// Re-export all types from individual modules
export type * from "./signalk.js";

// Common utility types
export type UnknownRecord = Record<string, unknown>;
export type SignalKValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SignalKValue[]
  | UnknownRecord;

// Note: N2KFieldValue is exported from nmea2000.ts via "export type * from"

// Type guards for runtime validation
export function isSignalKValue(value: unknown): value is SignalKValue {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return true;
  if (Array.isArray(value)) return value.every(isSignalKValue);
  if (typeof value === "object") {
    return Object.values(value).every(isSignalKValue);
  }
  return false;
}

import type { N2KFieldValue } from "./nmea2000.js";
export function isN2KFieldValue(value: unknown): value is N2KFieldValue {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return true;
  if (Array.isArray(value)) return value.every(isN2KFieldValue);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).every(isN2KFieldValue);
  }
  return false;
}
