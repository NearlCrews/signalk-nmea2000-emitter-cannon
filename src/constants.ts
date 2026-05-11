export const N2K_DEFAULT_PRIORITY = 2;
export const N2K_BROADCAST_DST = 255;
// Use N2K_DEFAULT_SID for related-PGN groups so receivers can correlate
// (e.g. attitude / heading / direction-data sets sharing one sample instant).
// Use N2K_SID_ZERO for standalone single-shot PGNs that never need correlation.
export const N2K_DEFAULT_SID = 87;
export const N2K_SID_ZERO = 0;
export const N2K_DEFAULT_INSTANCE = 100;
export const DEFAULT_DATA_TIMEOUT_MS = 10000;
export const DEFAULT_GLOBAL_RESEND_SECONDS = 5;
export const VESSELS_SELF_CONTEXT = "vessels.self";
export const STREAM_DEBOUNCE_MS = 10;

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
export type OutputType = (typeof OUTPUT_TYPE)[keyof typeof OUTPUT_TYPE];
