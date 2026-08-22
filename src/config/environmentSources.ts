import { N2K_DEFAULT_INSTANCE } from "../constants.js";

// The complete Canboat TemperatureSource and HumiditySource enums. They live in
// this runtime-neutral module so conversions and panel metadata share one list
// without importing the complete PGN database into either production bundle.
export const TEMPERATURE_SOURCE_VALUES = [
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
] as const;

export const HUMIDITY_SOURCE_VALUES = ["Inside", "Outside"] as const;

export interface TemperatureDefinition {
	n2kSource: string;
	source: string;
	instance: number;
	option: string;
}

/**
 * Canonical Signal K input and default NMEA 2000 identity for each temperature
 * conversion. Runtime emission and configuration validation share this table so
 * source-plus-instance collision checks cannot drift from the wire defaults.
 */
export const TEMPERATURE_DEFINITIONS: readonly TemperatureDefinition[] = [
	{
		n2kSource: "Sea Temperature",
		source: "environment.water.temperature",
		instance: 100,
		option: "SEA",
	},
	{
		n2kSource: "Outside Temperature",
		source: "environment.outside.temperature",
		instance: 101,
		option: "OUTSIDE",
	},
	{
		n2kSource: "Inside Temperature",
		source: "environment.inside.temperature",
		instance: 102,
		option: "INSIDE",
	},
	{
		n2kSource: "Engine Room Temperature",
		source: "environment.inside.engineRoom.temperature",
		instance: 103,
		option: "ENGINEROOM",
	},
	{
		n2kSource: "Main Cabin Temperature",
		source: "environment.inside.mainCabin.temperature",
		instance: 104,
		option: "MAINCABIN",
	},
	{
		n2kSource: "Refrigeration Temperature",
		source: "environment.inside.refrigerator.temperature",
		instance: 105,
		option: "REFRIGERATOR",
	},
	{
		n2kSource: "Heating System Temperature",
		source: "environment.inside.heating.temperature",
		instance: 106,
		option: "HEATINGSYSTEM",
	},
	{
		n2kSource: "Dew Point Temperature",
		source: "environment.outside.dewPointTemperature",
		instance: 107,
		option: "DEWPOINT",
	},
	{
		n2kSource: "Apparent Wind Chill Temperature",
		source: "environment.outside.apparentWindChillTemperature",
		instance: 108,
		option: "APPARENTWINDCHILL",
	},
	{
		n2kSource: "Theoretical Wind Chill Temperature",
		source: "environment.outside.theoreticalWindChillTemperature",
		instance: 109,
		option: "THEORETICALWINDCHILL",
	},
	{
		n2kSource: "Heat Index Temperature",
		source: "environment.outside.heatIndexTemperature",
		instance: 110,
		option: "HEATINDEX",
	},
	{
		n2kSource: "Freezer Temperature",
		source: "environment.inside.freezer.temperature",
		instance: 111,
		option: "FREEZER",
	},
];

// The single source of truth for both the humidity runtime defaults and the
// PGN 130313 source-plus-instance collision check in config/validation.ts. The
// two have to agree: a table that disagreed with the runtime would compare a
// pair the plugin never emits and miss a real collision. Instance 100 is the
// base of the block the environmental sensors use, matching
// TEMPERATURE_DEFINITIONS above.
export const HUMIDITY_DEFAULT_IDENTITIES = {
	HUMIDITY_OUTSIDE: { source: "Outside", instance: N2K_DEFAULT_INSTANCE },
	HUMIDITY_INSIDE: { source: "Inside", instance: N2K_DEFAULT_INSTANCE },
} as const;

export function resolveSourceOption<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): T {
	return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}
