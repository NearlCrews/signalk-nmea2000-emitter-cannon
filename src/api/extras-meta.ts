import type { ConversionModule } from "../types/index.js";
import type { ExtrasMeta } from "./types.js";

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
export const CONVERSION_DESCRIPTIONS: Record<string, string> = {
	AIS_SAFETY_MESSAGE:
		"Do not enable unless this vessel has a licensed AIS transceiver whose MMSI matches the value broadcast on the bus. Software-only emission of AIS safety messages violates ITU-R M.1371 and may breach licence terms (e.g. US FCC ship station rules). Use Notifications (PGN 126985) for non-AIS alerts.",
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
export const CONVERSION_PURPOSES: Record<string, string> = {
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
export const CONVERSION_COMPATIBILITY: Record<
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

// Temperature instance editor: applies to every TEMPERATURE_* / TEMPERATURE2_* key.
const TEMPERATURE_INSTANCE_META: ExtrasMeta = {
	type: "field",
	key: "instance",
	label: "NMEA 2000 Temperature Instance",
	control: "number",
};

export function metaFor(conversion: ConversionModule): ExtrasMeta {
	const k = conversion.optionKey;
	if (k.startsWith("TEMPERATURE_") || k.startsWith("TEMPERATURE2_")) {
		return TEMPERATURE_INSTANCE_META;
	}
	return EXTRAS_BY_OPTION_KEY[k] ?? { type: "none" };
}

/**
 * Pure sanity check: every key in EXTRAS_BY_OPTION_KEY and
 * CONVERSION_DESCRIPTIONS must match a loaded conversion's optionKey. Returns
 * the list of orphaned keys for the caller to log via whatever channel it
 * prefers (debug, error, test harness).
 */
export function findOrphanExtrasMetaKeys(
	loaded: readonly ConversionModule[],
): string[] {
	const loadedKeys = new Set(loaded.map((c) => c.optionKey));
	const checked = new Set([
		...Object.keys(EXTRAS_BY_OPTION_KEY),
		...Object.keys(CONVERSION_DESCRIPTIONS),
		...Object.keys(CONVERSION_PURPOSES),
		...Object.keys(CONVERSION_COMPATIBILITY),
	]);
	return [...checked].filter((key) => !loadedKeys.has(key));
}
