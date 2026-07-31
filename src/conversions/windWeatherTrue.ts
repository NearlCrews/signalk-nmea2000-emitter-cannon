import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, N2K_DEFAULT_SID } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber, toFiniteOrUndefined, toUnsignedAngle } from "../utils/validation.js";

const EMPTY_EMIT: N2KMessage[] = [];

/**
 * Bridges the forecast wind that `signalk-virtual-weather-sensors` publishes to
 * a boat-referenced TRUE wind on PGN 130306 (reference "True (boat referenced)"),
 * so a chartplotter that fills its True Wind Speed/Angle fields from that
 * reference (Garmin in particular) has a true wind to display.
 *
 * The weather plugin publishes the forecast wind as a ground-true wind: a
 * speed-over-ground and a compass DIRECTION (`environment.wind.directionTrue`,
 * referenced to true north). A boat-referenced true wind instead needs the
 * angle relative to the bow, so this conversion subtracts the vessel's true
 * heading from the wind direction: TWA = directionTrue - headingTrue. Without a
 * true heading there is no boat-referenced angle to compute, so nothing is
 * emitted (the ground-referenced WIND_TRUE_GROUND conversion still carries the
 * same wind keyed to North).
 *
 * Like the weather apparent-wind conversion this is opt-in (disabled by default)
 * and intended for a vessel with no real masthead anemometer feeding PGN 130306.
 */
export default function createWindWeatherTrueConversion(
	_app: SignalKApp,
): ConversionModule<[number | null, number | null, number | null]> {
	return {
		title: "Weather Forecast True Wind (PGN 130306)",
		optionKey: "WIND_WEATHER_TRUE",
		category: "environment",
		keys: [
			"environment.wind.directionTrue",
			"navigation.headingTrue",
			"environment.wind.speedOverGround",
		],
		// Heading is a supporting input. This conversion emits wind PGN 130306,
		// so consuming heading PGN 127250 cannot echo the heading back to NMEA 2000.
		allowNmea2000InputPaths: ["navigation.headingTrue"],
		callback: ((
			directionTrue: number | null,
			headingTrue: number | null,
			speed: number | null,
		): N2KMessage[] => {
			if (!isValidNumber(directionTrue) || !isValidNumber(headingTrue)) {
				return EMPTY_EMIT;
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 130306,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_DEFAULT_SID,
						windSpeed: toFiniteOrUndefined(speed),
						// Boat-referenced TWA; see toUnsignedAngle for the [0, 2pi) wrap.
						windAngle: toUnsignedAngle(directionTrue - headingTrue),
						reference: "True (boat referenced)",
					},
				},
			];
		}) as ConversionCallback<[number | null, number | null, number | null]>,

		tests: [
			{
				// directionTrue 120 deg, heading 0 -> TWA 120 deg
				input: [2.0944, 0, 1.2],
				expected: [
					{
						prio: 2,
						pgn: 130306,
						dst: 255,
						fields: {
							sid: 87,
							windSpeed: 1.2,
							windAngle: 2.0944,
							reference: "True (boat referenced)",
						},
					},
				],
			},
			{
				// Wrap-around: directionTrue 0.5 - heading 1.0 = -0.5 -> 5.7832 rad
				input: [0.5, 1.0, 2.0],
				expected: [
					{
						prio: 2,
						pgn: 130306,
						dst: 255,
						fields: {
							sid: 87,
							windSpeed: 2.0,
							windAngle: 5.7832,
							reference: "True (boat referenced)",
						},
					},
				],
			},
			{
				// Angle only when wind speed is absent
				input: [2.0944, 0, null],
				expected: [
					{
						prio: 2,
						pgn: 130306,
						dst: 255,
						fields: {
							sid: 87,
							windAngle: 2.0944,
							reference: "True (boat referenced)",
						},
					},
				],
			},
			{
				// No true heading -> cannot compute a boat-referenced angle
				input: [2.0944, null, 1.2],
				expected: [],
			},
			{
				// No wind direction -> nothing to emit
				input: [null, 0, 1.2],
				expected: [],
			},
		],
	};
}
