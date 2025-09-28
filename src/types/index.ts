/**
 * Type definitions for Signal K to NMEA 2000 conversion plugin
 */

// Re-export all types from individual modules
export type * from './signalk.js'
export type * from './nmea2000.js' 
export type * from './plugin.js'

// Common utility types
export type UnknownRecord = Record<string, unknown>
export type SignalKValue = string | number | boolean | null | undefined | SignalKValue[] | UnknownRecord
export type N2KFieldValue = string | number | boolean | null | undefined | N2KFieldValue[]

// Type guards for runtime validation
export function isSignalKValue(value: unknown): value is SignalKValue {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isSignalKValue)
  if (typeof value === 'object') {
    return Object.values(value).every(isSignalKValue)
  }
  return false
}

export function isN2KFieldValue(value: unknown): value is N2KFieldValue {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isN2KFieldValue)
  return false
}
