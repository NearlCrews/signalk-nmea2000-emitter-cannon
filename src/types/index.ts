/**
 * Type definitions for Signal K to NMEA 2000 conversion plugin
 */

export type * from "./nmea2000.js";
export type * from "./plugin.js";
// Value-level re-exports (type guards, runtime helpers)
export { isConversionOptions } from "./plugin.js";
// Re-export all types from individual modules
export type * from "./signalk.js";

// Common utility types
export type UnknownRecord = Record<string, unknown>;
