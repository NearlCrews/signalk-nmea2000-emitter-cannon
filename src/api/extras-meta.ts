import type { ConversionModule } from "../types/index.js";
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
