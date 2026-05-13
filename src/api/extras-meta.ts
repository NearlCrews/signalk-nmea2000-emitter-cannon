import type { ConversionModule, SignalKApp } from "../types/index.js";
import type { ExtrasMeta } from "./types.js";

const EXTRAS_BY_OPTION_KEY: Record<string, ExtrasMeta> = {
	BATTERY: { type: "batteryMapping", minRows: 0 },
	ENGINE_PARAMETERS: { type: "engineMapping", minRows: 0 },
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
	// PGN 127498 carries static engine identity: rated speed (RPM), VIN,
	// and software version. There is no canonical SK source for these
	// fields, so the user enters them in plugin config.
	ENGINE_STATIC: {
		type: "fields",
		fields: [
			{
				key: "ratedEngineSpeed",
				label: "Rated Engine Speed (RPM)",
				control: "number",
				default: 0,
			},
			{
				key: "VIN",
				label: "Vehicle Identification Number",
				control: "text",
				default: "",
			},
			{
				key: "softwareVersion",
				label: "Software Version",
				control: "text",
				default: "",
			},
		],
	},
};

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
 * Developer-only sanity check: any optionKey in EXTRAS_BY_OPTION_KEY must
 * correspond to a real loaded conversion. A typo or a renamed/removed
 * conversion would otherwise silently leave a dead entry in the table that
 * never matches and is never exercised by the panel.
 *
 * Logs via app.debug so production deployments stay quiet; warnings only
 * surface when DEBUG is enabled. Does not fail loud: an extras-meta drift
 * does not break runtime emission, it only breaks the per-card editor UI
 * for the misspelled key.
 */
export function validateExtrasMetaKeys(
	app: SignalKApp,
	loaded: readonly ConversionModule[],
): void {
	const loadedKeys = new Set(loaded.map((c) => c.optionKey));
	for (const key of Object.keys(EXTRAS_BY_OPTION_KEY)) {
		if (!loadedKeys.has(key)) {
			app.debug(`extras-meta has entry for unknown optionKey '${key}'`);
		}
	}
}
