import type { ConversionModule, SignalKApp } from "../types/index.js";
import { createWind130306Conversion } from "./windData.js";

/**
 * Bridges the synthetic apparent wind that `signalk-virtual-weather-sensors`
 * publishes on its producer namespace (`environment.weather.windSpeedApparent`
 * / `windAngleApparent`) to PGN 130306. That plugin deliberately keeps this
 * value off the canonical `environment.wind.*` leaves a real anemometer owns,
 * so this conversion is opt-in (disabled by default) and should only be
 * enabled on a vessel with no real masthead anemometer feeding PGN 130306.
 */
export default function createWindWeatherApparentConversion(
	app: SignalKApp,
): ConversionModule {
	return createWind130306Conversion(app, {
		title: "Weather Forecast Apparent Wind (PGN 130306)",
		optionKey: "WIND_WEATHER_APPARENT",
		keys: [
			"environment.weather.windAngleApparent",
			"environment.weather.windSpeedApparent",
		],
		reference: "Apparent",
		category: "environment",
	});
}
