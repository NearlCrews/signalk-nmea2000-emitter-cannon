export const N2K_DEFAULT_PRIORITY = 2;
export const N2K_BROADCAST_DST = 255;
// Use N2K_DEFAULT_SID for related-PGN groups so receivers can correlate
// (e.g. attitude / heading / direction-data sets sharing one sample instant).
// Use N2K_SID_ZERO for standalone single-shot PGNs that never need correlation.
export const N2K_DEFAULT_SID = 87;
export const N2K_SID_ZERO = 0;
export const N2K_DEFAULT_INSTANCE = 100;
export const DEFAULT_DATA_TIMEOUT_MS = 10000;
// 1-minute freshness window for slow-cadence data sources where the
// data-path is expected to update much less often than the 10s default.
// Used by battery/solar/tank gauges, route metadata, and nav notification
// freshness windows that ride alongside per-key 10s data timeouts.
export const SLOW_DATA_TIMEOUT_MS = 60000;
// 1-hour freshness for "static" PGNs (engine rated speed, VIN, software
// version): these fields change on the timescale of vessel commissioning,
// not navigation, so a long freshness window prevents the conversion from
// silently dropping mid-run while the original SK value remains valid.
export const STATIC_DATA_TIMEOUT_MS = 60 * 60 * 1000;
export const DEFAULT_GLOBAL_RESEND_SECONDS = 5;
// Emit cadence for "static" PGNs (PGN 127498 engine identity). 60s keeps the
// value present on the bus for MFDs that drop entries after a few minutes of
// silence; pairs with STATIC_DATA_TIMEOUT_MS above.
export const STATIC_EMIT_INTERVAL_MS = 60000;
export const VESSELS_SELF_CONTEXT = "vessels.self";
export const STREAM_DEBOUNCE_MS = 10;

// Volume unit conversions used when emitting PGN 127489 (Engine Parameters
// Dynamic) and PGN 127497 (Trip Parameters Engine). Signal K publishes fuel
// volumes in m^3 and fuel rates in m^3/s; canboat expects litres and L/hour.
export const M3_TO_L = 1000;
export const M3PS_TO_LPH = 3600 * 1000;

// Source/output dispatch keys. Centralised so the union types in plugin.ts
// and the runtime dispatch in plugin-manager.ts stay in lockstep.
export const SOURCE_TYPE = {
	ON_DELTA: "onDelta",
	ON_VALUE_CHANGE: "onValueChange",
	SUBSCRIPTION: "subscription",
	TIMER: "timer",
} as const;
export type SourceType = (typeof SOURCE_TYPE)[keyof typeof SOURCE_TYPE];

export const OUTPUT_TYPE = {
	TO_N2K: "to-n2k",
} as const;
