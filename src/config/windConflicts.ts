/** Real and forecast conversions that compete for the same display values. */
export const COMPETING_WIND_PRODUCERS: ReadonlyArray<readonly [string, string, string]> = [
	["WIND", "WIND_WEATHER_APPARENT", "apparent wind"],
	["WIND", "WIND_WEATHER_TRUE", "real and forecast wind"],
	["WIND_TRUE", "WIND_WEATHER_APPARENT", "real and forecast wind"],
	["WIND_TRUE", "WIND_WEATHER_TRUE", "true-wind display data"],
];

/** Return every conversion that is incompatible with `optionKey`. */
export function competingWindProducers(optionKey: string): string[] {
	const competitors = new Set<string>();
	for (const [primaryKey, alternateKey] of COMPETING_WIND_PRODUCERS) {
		if (optionKey === primaryKey) competitors.add(alternateKey);
		if (optionKey === alternateKey) competitors.add(primaryKey);
	}
	return [...competitors];
}
