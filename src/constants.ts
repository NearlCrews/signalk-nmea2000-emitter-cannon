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
// The unsigned 16-bit 100 Pa pressure field on PGN 130310, PGN 130311, and the
// PGN 127489 oilPressure and coolantPressure fields. PGN 130314 is not bounded
// by this: its pressure field is signed 32-bit at 0.1 Pa, so this ceiling is
// about 32 times tighter than that wire allows. That is harmless for
// atmospheric pressure and keeps one bound across the group. PGN 127489
// fuelPressure is not bounded by this either: it is 1000 Pa resolution, ten
// times wider, and carries its own ceiling in engineParameters.ts.
export const MAX_PRESSURE_PA = 6_553_200;
/** PGN 129029 satellite count: unsigned 8-bit, with 253 through 255 reserved. */
export const MAX_SATELLITE_COUNT = 252;
// PGN 129539 DOP fields are signed 16-bit values at 0.01 resolution. Although
// the wire type is signed to reserve sentinel values, physical DOP is nonnegative.
export const MAX_N2K_DOP = 327.64;
// The signed 16-bit 0.0001 rad angle field, shared by PGN 127257 attitude
// (yaw, pitch, roll), PGN 127245 rudder (position, angleOrder), PGN 127250
// (deviation, variation), PGN 127258 variation, PGN 128000 leewayAngle, and
// PGN 129540 elevation.
//
// This is 3.1415, not Math.PI, and not canboat's own stated RangeMax of
// 3.1415926. canboat's decoder discards any field whose raw value exceeds
// RangeMax / Resolution, and 3.1415926 / 0.0001 is 31415.926: raw 31416
// (3.1416 rad) is thrown away by the receiver, so raw 31415 (3.1415 rad) is
// the largest angle that survives a round trip. A guard written against
// Math.PI still admits everything in (3.1415, pi], which encodes onto the bus
// and then vanishes at the far end, so this bound must not be "corrected"
// upward. The negative side reaches the full int16 floor of -3.2768 because
// canboat applies no matching RangeMin check, but the bound is kept symmetric
// so one number describes the field.
// biome-ignore lint/suspicious/noApproximativeNumericConstant: this bound is deliberately below Math.PI. Substituting Math.PI is the exact regression the comment above warns against.
export const MAX_N2K_ANGLE_SIGNED_RADIANS = 3.1415;
// The unsigned counterpart: the 16-bit 0.0001 rad direction field carried by
// PGN 127250 heading, PGN 129026 and PGN 130577 cog, PGN 130577 heading,
// PGN 129291 set, PGN 130306 windAngle, the PGN 129284 and PGN 129302
// bearings, and PGN 129540 azimuth.
//
// Same reasoning as the signed bound above, one turn wider. canboat states a
// RangeMax of 6.2831852, and 6.2831852 / 0.0001 is 62831.852, so raw 62832 is
// discarded by the receiver. Every angle that rounds onto that raw value is
// lost, which is the last 0.002 degrees below north: a compass reading 359.999
// degrees (6.2831678 rad) reached the chartplotter as "heading not available"
// rather than as north. Normalizing an angle into [0, 2pi) does not avoid that
// band, because the band sits at the top of the interval, so the wrap has to
// land below this bound too. Clamping costs at most 0.005 degrees.
export const MAX_N2K_ANGLE_UNSIGNED_RADIANS = 6.2831;
// The unsigned 16-bit 0.1 K temperature field on the PGN 127489 and PGN 127493
// oilTemperature fields, ten times coarser than the 0.01 K field
// MAX_TEMPERATURE_K describes. canboat states a RangeMax of 6553.2, but
// 6553.2 / 0.1 evaluates to 65531.99999999999 in IEEE 754, so the decoder drops
// raw 65532 as well: 6553.1 is the largest value that actually round-trips.
// Same floating-point artifact as MAX_N2K_VOLTAGE_V.
export const MAX_OIL_TEMPERATURE_K = 6553.1;
// The signed 16-bit 0.01 m heave field on PGN 127252. It wraps rather than
// refusing: a provider publishing millimetres sends 1.5 m as 1500, which
// reaches the receiver as 189.28 m, and -400 arrives as +255.36 m, so heave
// down is reported as heave up. 327.63 rather than canboat's stated
// 327.64 for the MAX_N2K_VOLTAGE_V floating-point reason; the negative side
// reaches the int16 floor but is kept symmetric so one number describes it.
export const MAX_N2K_HEAVE_M = 327.63;
// The signed 32-bit 3.125e-8 rad/s rate field on PGN 127251. A value past it
// wraps with a sign change: 100 rad/s reaches the receiver as -34.217728 rad/s,
// so a starboard turn is reported as a port turn to every autopilot on the bus.
export const MAX_N2K_RATE_OF_TURN_RAD_PER_S = 67.108863875;
// The unsigned 16-bit 0.25 rpm engine speed field, shared by PGN 127488 speed
// and PGN 127498 ratedEngineSpeed. Signal K permits a negative
// propulsion.<id>.revolutions for astern rotation, which this field cannot
// carry: -30 Hz wraps onto the bus as 14584 RPM.
export const MAX_N2K_ENGINE_SPEED_RPM = 16383;
// The signed 16-bit 0.1 L/h fuel rate field, shared by PGN 127489 fuelRate and
// the three PGN 127497 trip rate fields. 3600 L/h wraps to -2953.6 L/h.
export const MAX_N2K_FUEL_RATE_LPH = 3276.4;
// The signed 16-bit 0.01 V field, shared by PGN 127508 voltage and PGN 127489
// alternatorPotential. canboat states a RangeMax of 327.64, but 327.64 / 0.01
// evaluates to 32763.999999999996 in IEEE 754, so the decoder drops raw 32764
// as well: 327.63 is the largest value that actually round-trips.
export const MAX_N2K_VOLTAGE_V = 327.63;
// The signed 16-bit 0.1 A field on PGN 127508, shared by the battery and solar
// conversions. It wraps rather than refusing an oversized value: a provider
// publishing milliamps sends 23.1 A as 23100, which reaches the receiver as
// -3114.4 A. Numerically equal to MAX_N2K_FUEL_RATE_LPH because both fields are
// signed 16-bit at 0.1, but they measure different quantities and are named
// separately so neither bound drifts with the other.
export const MAX_N2K_CURRENT_A = 3276.4;
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
