import { MAX_N2K_INSTANCE } from "../constants.js";
import type { ConversionModule } from "../types/index.js";
import type { ConversionLifecycle, ExtrasMeta } from "./types.js";

const EXTRAS_BY_OPTION_KEY: Record<string, ExtrasMeta> = {
	BATTERY: { type: "batteryMapping", minRows: 0 },
	ENGINE_PARAMETERS: { type: "engineMapping", minRows: 0 },
	// PGN 127497 trip parameters: one row per engine, same shape as
	// ENGINE_PARAMETERS' mapping (SK engine id to N2K instance).
	ENGINE_TRIP: { type: "engineMapping", minRows: 0 },
	// PGN 127498 carries static engine identity: rated speed (RPM), VIN, and
	// software version. There is no canonical SK source for these fields, so
	// the user enters them per engine in plugin config. As of v1.5.5 this is
	// a per-engine table (one row per propulsion instance) rather than a
	// single flat field set; the conversion factory falls back to a single
	// "main" row when it encounters a legacy v1.5.4 flat-scalar payload.
	ENGINE_STATIC: { type: "engineStaticMapping", minRows: 0 },
	TANKS: { type: "tankMapping", minRows: 0 },
	SOLAR: { type: "solarMapping", minRows: 0 },
	RAYMARINE_BRIGHTNESS: { type: "brightnessMapping", minRows: 0 },
	EXHAUST_TEMPERATURE: { type: "exhaustMapping", minRows: 0 },
	NOTIFICATIONS: {
		type: "field",
		key: "excludePaths",
		label: "Exclude Paths",
		control: "text",
		default: "",
	},
};

// Per-conversion warning surfaced above the card in the admin panel.
// Plugin-manager.getConversionMetadata() copies the matching entry (if any)
// onto each ConversionMetadata as `description`. Use for regulatory or
// compatibility notes that the user should see before enabling.
//
// AIS_SAFETY_MESSAGE: PGN 129802 broadcast is regulated. Mirrors the comment
// in src/conversions/aisExtended.ts above the PGN 129802 conversion and the
// AIS section of the README.
const CONVERSION_DESCRIPTIONS: Record<string, string> = {
	AIS_SAFETY_MESSAGE:
		"Do not enable unless this vessel has a licensed AIS transceiver whose MMSI matches the value broadcast on the bus. Software-only emission of AIS safety messages violates ITU-R M.1371 and may breach licence terms (e.g. US FCC ship station rules). Use Notifications (PGN 126985) for non-AIS alerts.",
	WIND_WEATHER_APPARENT:
		"Bridges the synthetic apparent wind from signalk-virtual-weather-sensors (forecast wind plus vessel motion) to PGN 130306. Leave disabled if a real masthead anemometer feeds apparent wind: emitting both puts competing values on the bus.",
};

export function descriptionFor(optionKey: string): string | undefined {
	return CONVERSION_DESCRIPTIONS[optionKey];
}

// Neutral one-line "what does this PGN do" copy. Rendered as a non-warning
// subtitle on each card so a non-NMEA reader can distinguish the engine PGNs
// (static identity vs dynamic params vs cumulative trip) and the two battery
// PGNs (basic vs detailed) at a glance. Only populated for cases where the
// title alone is ambiguous; conversions with self-evident titles (Wind,
// Depth, etc.) intentionally have no entry.
const CONVERSION_PURPOSES: Record<string, string> = {
	ENGINE_PARAMETERS:
		"Live engine telemetry (RPM, temperatures, fuel rate, alternator). Streams per delta from propulsion.<id>.* paths.",
	ENGINE_STATIC:
		"Static engine identity (rated RPM, VIN, software version). Published once per minute from plugin config: SK has no canonical source for these fields.",
	ENGINE_TRIP:
		"Cumulative trip fuel totals and average rates. Streams per delta from propulsion.<id>.trip.* paths.",
	BATTERY:
		"Basic battery status (voltage, current, temperature) plus detailed status (state-of-charge, time-remaining). The basic frame is what most chartplotters consume; the detailed frame serves Victron Cerbo, Maretron N2K-View, and the SK data browser.",
};

export function purposeFor(optionKey: string): string | undefined {
	return CONVERSION_PURPOSES[optionKey];
}

// Hint of how the most common MFD vendor (Garmin) treats each PGN. Used to
// render a small badge on the card so a Garmin-only install knows which
// enabled conversions actually display vs which are emitted for other
// consumers (Victron, Maretron, B&G autopilots). Default is "consumes" when
// no entry exists; only populate exceptions.
const CONVERSION_COMPATIBILITY: Record<
	string,
	{ garmin: "consumes" | "ignores" | "partial"; note?: string }
> = {
	// Garmin reads PGN 127508 only; PGN 127506 is consumed by Victron Cerbo,
	// Maretron N2K-View, and the SK data browser.
	BATTERY: {
		garmin: "partial",
		note: "Garmin reads voltage/current (127508), not state-of-charge (127506).",
	},
	// Seatalk proprietary; Raymarine-only.
	RAYMARINE_ALARMS: { garmin: "ignores", note: "Seatalk proprietary." },
	RAYMARINE_BRIGHTNESS: { garmin: "ignores", note: "Seatalk proprietary." },
	// Garmin Reactor reads attitude/heave via SteadyCast internal channel;
	// most Garmin chartplotters do not list these PGNs in their Rx tables.
	ATTITUDE: {
		garmin: "partial",
		note: "Reactor autopilots consume via SteadyCast; chartplotters typically ignore.",
	},
	HEAVE: {
		garmin: "partial",
		note: "Reactor autopilots consume via SteadyCast; chartplotters typically ignore.",
	},
	// AIS safety broadcast: regulated. Many MFDs accept inbound but a
	// software-only emit is non-compliant; some firmwares drop the frame.
	AIS_SAFETY_MESSAGE: {
		garmin: "partial",
		note: "Garmin GPSMAP reads inbound 129802 (2025-04 firmware); software emission is regulated.",
	},
};

export function compatibilityFor(
	optionKey: string,
): { garmin: "consumes" | "ignores" | "partial"; note?: string } | undefined {
	return CONVERSION_COMPATIBILITY[optionKey];
}

// Per-optionKey legacy-PGN metadata. PGN 130312 (the TEMPERATURE_* keys) is
// handled by prefix in lifecycleFor, not listed here, because it spans many
// per-source optionKeys.
const CONVERSION_LIFECYCLE: Record<string, ConversionLifecycle> = {
	// PGN 130310: canboat marks this "Environmental Parameters (obsolete)".
	SEA_TEMP: {
		supersededBy: "PGN 130316 (water temperature) and PGN 130314 (pressure)",
		note: "PGN 130310 is obsolete in the NMEA 2000 spec and should no longer be generated. Enable only for older MFDs that read this combined frame and not the modern split PGNs.",
	},
	// PGN 130311: canboat notes it "should no longer be generated".
	ENVIRONMENT_PARAMETERS: {
		supersededBy: "PGN 130314 (Actual Pressure)",
		note: "PGN 130311 is deprecated in the NMEA 2000 spec in favour of the dedicated PGNs 130312 to 130316. Enable only for older MFDs that read this frame.",
	},
};

// PGN 130312 is a softer legacy case than 130310/130311: canboat does not
// flag it obsolete, but PGN 130316 (Temperature, Extended Range) supersedes
// it with wider range and resolution. Both are emitted by default.
const TEMPERATURE_LEGACY: ConversionLifecycle = {
	supersededBy: "PGN 130316 (the TEMPERATURE2_* conversions)",
	note: "PGN 130312 is superseded by the extended-range PGN 130316. Both are emitted by default; disable this only if every MFD on the bus reads 130316.",
};

export function lifecycleFor(optionKey: string): ConversionLifecycle | undefined {
	// TEMPERATURE_* keys emit the legacy PGN 130312. TEMPERATURE2_* keys emit
	// the modern PGN 130316 and must not match: startsWith("TEMPERATURE_")
	// already excludes them because "TEMPERATURE2_" differs at the "2".
	if (optionKey.startsWith("TEMPERATURE_")) {
		return TEMPERATURE_LEGACY;
	}
	return CONVERSION_LIFECYCLE[optionKey];
}

// Build select options from a list of NMEA 2000 source-type strings, with a
// leading "use the default" entry (empty string clears the override so the
// conversion follows its per-path default source).
function sourceOptions(values: string[]): { value: string; label: string }[] {
	return [
		{ value: "", label: "Default (per Signal K path)" },
		...values.map((v) => ({ value: v, label: v })),
	];
}

// The full canboat TemperatureSource enum, in enum order. Hand-maintained (not
// imported) on purpose: @canboat/ts-pgns re-exports the entire PGN database
// through a CJS barrel that bundlers cannot tree-shake, so a value import would
// bloat both the runtime and panel bundles. Keep in sync with TemperatureSource
// in @canboat/ts-pgns/dist/enums.d.ts. Exposing the full set lets a user relabel
// any temperature so it shows on an MFD that only renders certain sources (e.g.
// Raymarine Axiom only displays "Inside Temperature", separating sensors by
// instance).
const TEMPERATURE_SOURCE_VALUES = [
	"Sea Temperature",
	"Outside Temperature",
	"Inside Temperature",
	"Engine Room Temperature",
	"Main Cabin Temperature",
	"Live Well Temperature",
	"Bait Well Temperature",
	"Refrigeration Temperature",
	"Heating System Temperature",
	"Dew Point Temperature",
	"Apparent Wind Chill Temperature",
	"Theoretical Wind Chill Temperature",
	"Heat Index Temperature",
	"Freezer Temperature",
	"Exhaust Gas Temperature",
	"Shaft Seal Temperature",
];

// The two-value canboat HumiditySource enum, hand-maintained for the same
// bundle-safety reason as TEMPERATURE_SOURCE_VALUES above.
const HUMIDITY_SOURCE_VALUES = ["Inside", "Outside"];

// The instance field is an 8-bit NMEA 2000 value; bound the editor to the
// encodable data range so a typo cannot land in the reserved sentinels.
const INSTANCE_FIELD = {
	key: "instance",
	control: "number" as const,
	min: 0,
	max: MAX_N2K_INSTANCE,
};

// Instance + source-type editor: applies to every TEMPERATURE_* / TEMPERATURE2_*
// key. `n2kSource` overrides the emitted source string; `instance` (0-9 for
// Raymarine) distinguishes multiple sensors of the same source.
const TEMPERATURE_META: ExtrasMeta = {
	type: "fields",
	fields: [
		{ ...INSTANCE_FIELD, label: "NMEA 2000 Temperature Instance" },
		{
			key: "n2kSource",
			label: "NMEA 2000 Source Type",
			control: "select",
			default: "",
			options: sourceOptions(TEMPERATURE_SOURCE_VALUES),
		},
	],
};

// Instance + source-type editor for the two humidity conversions.
const HUMIDITY_META: ExtrasMeta = {
	type: "fields",
	fields: [
		{ ...INSTANCE_FIELD, label: "NMEA 2000 Humidity Instance" },
		{
			key: "n2kSource",
			label: "NMEA 2000 Source Type",
			control: "select",
			default: "",
			options: sourceOptions(HUMIDITY_SOURCE_VALUES),
		},
	],
};

export function metaFor(conversion: ConversionModule): ExtrasMeta {
	const k = conversion.optionKey;
	if (k.startsWith("TEMPERATURE_") || k.startsWith("TEMPERATURE2_")) {
		return TEMPERATURE_META;
	}
	if (k.startsWith("HUMIDITY_")) {
		return HUMIDITY_META;
	}
	return EXTRAS_BY_OPTION_KEY[k] ?? { type: "none" };
}

/**
 * Pure sanity check: every literal optionKey used by the per-conversion
 * metadata maps (EXTRAS_BY_OPTION_KEY, CONVERSION_DESCRIPTIONS,
 * CONVERSION_PURPOSES, CONVERSION_COMPATIBILITY, CONVERSION_LIFECYCLE) must
 * match a loaded conversion's optionKey. Returns the list of orphaned keys
 * for the caller to log via whatever channel it prefers (debug, error, test
 * harness). Prefix-matched entries (TEMPERATURE_*) are intentionally not
 * checked here.
 */
export function findOrphanExtrasMetaKeys(loaded: readonly ConversionModule[]): string[] {
	const loadedKeys = new Set(loaded.map((c) => c.optionKey));
	const checked = new Set([
		...Object.keys(EXTRAS_BY_OPTION_KEY),
		...Object.keys(CONVERSION_DESCRIPTIONS),
		...Object.keys(CONVERSION_PURPOSES),
		...Object.keys(CONVERSION_COMPATIBILITY),
		...Object.keys(CONVERSION_LIFECYCLE),
	]);
	return [...checked].filter((key) => !loadedKeys.has(key));
}
