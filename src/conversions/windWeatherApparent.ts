import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_DEFAULT_SID,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber, normalizeAngle } from "../utils/validation.js";

/**
 * Bridges the synthetic apparent wind that `signalk-virtual-weather-sensors`
 * publishes on its producer namespace (`environment.weather.windSpeedApparent`
 * / `windAngleApparent`) to PGN 130306. That plugin deliberately keeps this
 * value off the canonical `environment.wind.*` leaves a real anemometer owns,
 * so this conversion is opt-in (disabled by default) and should only be
 * enabled on a vessel with no real masthead anemometer feeding PGN 130306.
 */
export default function createWindWeatherApparentConversion(
	_app: SignalKApp,
): ConversionModule<[number | null, number | null]> {
	return {
		title: "Weather Forecast Apparent Wind (PGN 130306)",
		optionKey: "WIND_WEATHER_APPARENT",
		category: "environment",
		keys: [
			"environment.weather.windAngleApparent",
			"environment.weather.windSpeedApparent",
		],
		callback: ((angle: number | null, speed: number | null) => {
			if (!isValidNumber(angle) && !isValidNumber(speed)) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 130306,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_DEFAULT_SID,
						windSpeed: isValidNumber(speed) ? speed : undefined,
						windAngle: isValidNumber(angle) ? normalizeAngle(angle) : undefined,
						reference: "Apparent",
					},
				},
			];
		}) as ConversionCallback<[number | null, number | null]>,

		tests: [
			{
				input: [2.0944, 1.2],
				expected: [
					{
						prio: 2,
						pgn: 130306,
						dst: 255,
						fields: {
							sid: 87,
							windSpeed: 1.2,
							windAngle: 2.0944,
							reference: "Apparent",
						},
					},
				],
			},
			{
				input: [-2.0944, 1.5],
				expected: [
					{
						prio: 2,
						pgn: 130306,
						dst: 255,
						fields: {
							sid: 87,
							windSpeed: 1.5,
							windAngle: 4.1888,
							reference: "Apparent",
						},
					},
				],
			},
			{
				input: [null, null],
				expected: [],
			},
		],
	};
}
