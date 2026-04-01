/**
 * Date/time utilities for NMEA 2000 message creation
 */

/**
 * Calculate NMEA 2000 date value (days since Unix epoch)
 * @param date - Date object to convert
 * @returns Days since January 1, 1970
 */
export function toN2KDate(date: Date = new Date()): number {
  return Math.trunc(date.getTime() / 86400 / 1000);
}

/**
 * Calculate NMEA 2000 time value (seconds since midnight UTC)
 * @param date - Date object to convert
 * @returns Seconds since midnight UTC
 */
export function toN2KTime(date: Date = new Date()): number {
  return date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
}

/**
 * Get both date and time values for NMEA 2000 messages
 * @param date - Date object to convert (defaults to current time)
 * @returns Object with date and time properties
 */
export function toN2KDateTime(date: Date = new Date()): { date: number; time: number } {
  return {
    date: toN2KDate(date),
    time: toN2KTime(date),
  };
}
