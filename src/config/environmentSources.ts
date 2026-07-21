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

export function resolveSourceOption<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): T {
	return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}
