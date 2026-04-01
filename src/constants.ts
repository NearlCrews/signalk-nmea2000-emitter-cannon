/**
 * NMEA 2000 message constants
 */

/**
 * Default message priority for data messages
 * Priority 2 is standard for sensor/navigation data
 */
export const N2K_DEFAULT_PRIORITY = 2;

/**
 * Broadcast destination address
 */
export const N2K_BROADCAST_DST = 255;

/**
 * Default sequence identifier
 * Used for message correlation across related PGNs
 */
export const N2K_DEFAULT_SID = 87;

/**
 * Alternative SID for some message types
 */
export const N2K_SID_ZERO = 0;

/**
 * Default instance ID for sensors without specific instance
 */
export const N2K_DEFAULT_INSTANCE = 100;

/**
 * Default timeout for data freshness in milliseconds
 */
export const DEFAULT_DATA_TIMEOUT_MS = 10000;

/**
 * Rate limiting interval for high-frequency messages in milliseconds
 */
export const RATE_LIMIT_INTERVAL_MS = 1000;
