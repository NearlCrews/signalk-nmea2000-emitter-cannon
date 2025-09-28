/**
 * Utility functions for NMEA 2000 message processing and validation
 */

import type { N2KMessage, N2KFieldValue } from '../types/nmea2000.js'
import { N2KValidationError } from '../types/nmea2000.js'

/**
 * Validate that a message conforms to the N2K message structure
 * 
 * @param message - Message to validate
 * @returns Validated N2K message
 * @throws N2KValidationError if message is invalid
 */
export function validateN2KMessage(message: unknown): N2KMessage {
  if (!message || typeof message !== 'object') {
    throw new N2KValidationError('Message must be an object')
  }

  const msg = message as Record<string, unknown>

  // Validate required fields
  if (typeof msg.prio !== 'number' || msg.prio < 0 || msg.prio > 7) {
    throw new N2KValidationError('prio must be a number between 0 and 7', 'prio')
  }

  if (typeof msg.pgn !== 'number' || msg.pgn < 0) {
    throw new N2KValidationError('pgn must be a positive number', 'pgn')
  }

  if (typeof msg.dst !== 'number' || msg.dst < 0 || msg.dst > 255) {
    throw new N2KValidationError('dst must be a number between 0 and 255', 'dst')
  }

  if (!msg.fields || typeof msg.fields !== 'object') {
    throw new N2KValidationError('fields must be an object', 'fields')
  }

  // Validate optional src field
  if (msg.src !== undefined && (typeof msg.src !== 'number' || msg.src < 0 || msg.src > 255)) {
    throw new N2KValidationError('src must be a number between 0 and 255', 'src')
  }

  // Validate fields values
  const fields = msg.fields as Record<string, unknown>
  for (const [key, value] of Object.entries(fields)) {
    if (!isValidN2KFieldValue(value)) {
      throw new N2KValidationError(`Invalid field value for ${key}`, key)
    }
  }

  const result: N2KMessage = {
    prio: msg.prio,
    pgn: msg.pgn,
    dst: msg.dst,
    fields: fields as Record<string, N2KFieldValue>
  }

  if (msg.src !== undefined) {
    result.src = msg.src as number
  }

  return result
}

/**
 * Check if a value is valid for N2K message fields
 * 
 * @param value - Value to check
 * @returns true if value is valid N2K field value
 */
export function isValidN2KFieldValue(value: unknown): value is N2KFieldValue {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isValidN2KFieldValue)
  }
  return false
}

/**
 * Create a standardized N2K message with validation
 * 
 * @param pgn - Parameter Group Number
 * @param fields - Message fields
 * @param options - Optional message options
 * @returns Validated N2K message
 */
export function createN2KMessage(
  pgn: number,
  fields: Record<string, N2KFieldValue>,
  options: {
    prio?: number
    dst?: number
    src?: number
  } = {}
): N2KMessage {
  const message = {
    prio: options.prio ?? 2,
    pgn,
    dst: options.dst ?? 255,
    src: options.src,
    fields
  }

  return validateN2KMessage(message)
}

/**
 * Convert a raw N2K message to a clean format
 * Removes extra properties that may have been added by processing
 * 
 * @param message - Raw message object
 * @returns Clean N2K message
 */
export function cleanN2KMessage(message: Record<string, unknown>): N2KMessage {
  // Remove processing artifacts that may be added by canboat
  const cleaned = { ...message }
  delete cleaned.description
  delete cleaned.src
  delete cleaned.timestamp
  delete cleaned.input
  delete cleaned.id

  return validateN2KMessage(cleaned)
}

/**
 * Check if two N2K messages are equivalent
 * 
 * @param msg1 - First message
 * @param msg2 - Second message
 * @returns true if messages are equivalent
 */
export function messagesEqual(msg1: N2KMessage, msg2: N2KMessage): boolean {
  if (msg1.prio !== msg2.prio || msg1.pgn !== msg2.pgn || msg1.dst !== msg2.dst) {
    return false
  }

  const fields1 = msg1.fields
  const fields2 = msg2.fields
  const keys1 = Object.keys(fields1).sort()
  const keys2 = Object.keys(fields2).sort()

  if (keys1.length !== keys2.length) return false
  
  for (let i = 0; i < keys1.length; i++) {
    const key1 = keys1[i]
    const key2 = keys2[i]
    if (!key1 || !key2 || key1 !== key2) return false
    if (!deepEqual(fields1[key1], fields2[key2])) return false
  }

  return true
}

/**
 * Deep equality check for N2K field values
 * 
 * @param a - First value
 * @param b - Second value
 * @returns true if values are deeply equal
 */
function deepEqual(a: N2KFieldValue, b: N2KFieldValue): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return a === b
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((val, idx) => deepEqual(val, b[idx]))
  }
  
  return false
}

/**
 * Format N2K message for logging
 * 
 * @param message - Message to format
 * @returns Formatted string representation
 */
export function formatN2KMessage(message: N2KMessage): string {
  return `PGN ${message.pgn} (prio:${message.prio}, dst:${message.dst}): ${JSON.stringify(message.fields)}`
}

/**
 * Extract PGN number from message
 * 
 * @param message - N2K message
 * @returns PGN number
 */
export function getPGN(message: N2KMessage): number {
  return message.pgn
}

/**
 * Check if message is a broadcast message
 * 
 * @param message - N2K message
 * @returns true if message is broadcast (dst = 255)
 */
export function isBroadcast(message: N2KMessage): boolean {
  return message.dst === 255
}
