export const N2K_DEFAULT_PRIORITY = 2;
export const N2K_BROADCAST_DST = 255;
// Use N2K_DEFAULT_SID for related-PGN groups so receivers can correlate
// (e.g. attitude / heading / direction-data sets sharing one sample instant).
// Use N2K_SID_ZERO for standalone single-shot PGNs that never need correlation.
export const N2K_DEFAULT_SID = 87;
export const N2K_SID_ZERO = 0;
export const N2K_DEFAULT_INSTANCE = 100;
// PGN 127505 (Fluid Level) instance is a 4-bit field; values above 13 are
// reserved or not-available and would silently wrap on the wire.
export const MAX_TANK_INSTANCE = 13;
// The 8-bit instance field on the temperature (130312/130316) and humidity
// (130313) PGNs: 253-255 are reserved / not-available, so 252 is the highest
// value that encodes as real data. A user-typed instance above this would wrap
// into the sentinel range. (Raymarine displays only render instances 0-9.)
export const MAX_N2K_INSTANCE = 252;
// The unsigned 16-bit 0.01 m/s speed field, shared by PGN 130306 wind speed,
// PGN 129026 SOG, and PGN 129291 drift. Raw values 65533-65535 are reserved or
// unavailable, so 655.32 is the largest real value. The encoder truncates a
// value past the field width rather than rejecting it, so a negative or
// oversized speed silently wraps into a plausible-looking reading: every one of
// these fields has to be range-checked before it is emitted.
export const MAX_N2K_SPEED_MPS = 655.32;
// The unsigned 16-bit 0.01 K temperature field, shared by PGN 130310, 130311,
// and 130312. Wraps the same way, so it carries the same obligation. 655.32 K
// is 382 C, which a dry-stack exhaust gas probe exceeds under load: that is
// exactly why PGN 130316 exists.
export const MAX_TEMPERATURE_K = 655.32;
/** PGN 130316 widens the same quantity to 24 bits at 0.001 K. */
export const MAX_TEMPERATURE_EXTENDED_K = 16_777.212;
// The unsigned 16-bit 100 Pa pressure field on PGN 130310 and 130311. PGN
// 130314 is not bounded by this: its pressure field is signed 32-bit at 0.1 Pa,
// so this ceiling is about 32 times tighter than that wire allows. That is
// harmless for atmospheric pressure and keeps one bound across the group.
export const MAX_PRESSURE_PA = 6_553_200;
/** PGN 129029 satellite count: unsigned 8-bit, with 253 through 255 reserved. */
export const MAX_SATELLITE_COUNT = 252;
// PGN 129539 DOP fields are signed 16-bit values at 0.01 resolution. Although
// the wire type is signed to reserve sentinel values, physical DOP is nonnegative.
export const MAX_N2K_DOP = 327.64;
export const DEFAULT_DATA_TIMEOUT_MS = 10000;
// 1-minute freshness window for slow-cadence data sources where the
// data-path is expected to update much less often than the 10s default.
// Used by battery/solar/tank gauges, route metadata, and nav notification
// freshness windows that ride alongside per-key 10s data timeouts.
export const SLOW_DATA_TIMEOUT_MS = 60000;
// signalk-virtual-weather-sensors can rebroadcast cached weather as slowly as
// every 60 seconds. Allow two full configured intervals plus scheduler jitter
// before forecast wind expires, while still removing it after the producer
// stops. Live masthead and heading inputs retain the 10-second default.
export const WEATHER_DATA_TIMEOUT_MS = 125000;
export const DEFAULT_GLOBAL_RESEND_SECONDS = 5;
// Emit cadence for "static" PGNs (PGN 127498 engine identity). 60s keeps the
// value present on the bus for MFDs that drop entries after a few minutes of
// silence.
export const STATIC_EMIT_INTERVAL_MS = 60000;
export const VESSELS_SELF_CONTEXT = "vessels.self";
export const STREAM_DEBOUNCE_MS = 10;

// Volume unit conversions used when emitting PGN 127489 (Engine Parameters
// Dynamic) and PGN 127497 (Trip Parameters Engine). Signal K publishes fuel
// volumes in m^3 and fuel rates in m^3/s; canboat expects litres and L/hour.
export const M3_TO_L = 1000;
export const M3PS_TO_LPH = 3600 * 1000;

// Source dispatch keys. Centralised so the SourceType union in plugin.ts and
// the runtime dispatch table in plugin-manager.ts stay in lockstep.
export const SOURCE_TYPE = {
	ON_DELTA: "onDelta",
	ON_VALUE_CHANGE: "onValueChange",
	SUBSCRIPTION: "subscription",
	TIMER: "timer",
} as const;
export type SourceType = (typeof SOURCE_TYPE)[keyof typeof SOURCE_TYPE];
