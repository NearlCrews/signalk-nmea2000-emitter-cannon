import {
	DEFAULT_DATA_TIMEOUT_MS,
	MAX_N2K_SPEED_MPS,
	WEATHER_DATA_TIMEOUT_MS,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber, toFiniteInRange, toUnsignedAngle } from "../utils/validation.js";
import { buildWind130306Message } from "./windData.js";

const EMPTY_EMIT: N2KMessage[] = [];

/**
 * Bridges the forecast wind that `signalk-virtual-weather-sensors` publishes to
 * a Garmin-compatible true-wind frame on PGN 130306 (reference
 * "True (water referenced)"). This model-specific compatibility choice is
 * intended for Garmin True Wind fields, but enum-level behavior depends on the
 * receiving chartplotter model and firmware.
 *
 * The weather plugin publishes the forecast wind as a ground-true wind: a
 * speed-over-ground and a compass DIRECTION (`environment.wind.directionTrue`,
 * referenced to true north). The relative angle needs the vessel's true
 * heading, so this conversion subtracts heading from direction:
 * TWA = directionTrue - headingTrue. Without a true heading there is no angle
 * to compute, so nothing is emitted.
 *
 * Encoding ground-referenced forecast wind with the water reference is a
 * display compatibility approximation. This conversion is opt-in and intended
 * only for a vessel without real wind or water-speed sensors feeding PGN
 * 130306.
 */
export default function createWindWeatherTrueConversion(
	_app: SignalKApp,
): ConversionModule<[number | null, number | null, number | null]> {
	return {
		title: "Garmin Forecast True Wind Compatibility (PGN 130306)",
		optionKey: "WIND_WEATHER_TRUE",
		category: "environment",
		keys: [
			"environment.wind.directionTrue",
			"navigation.headingTrue",
			"environment.wind.speedOverGround",
		],
		timeouts: [WEATHER_DATA_TIMEOUT_MS, DEFAULT_DATA_TIMEOUT_MS, WEATHER_DATA_TIMEOUT_MS],
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

			const windSpeed = toFiniteInRange(speed, 0, MAX_N2K_SPEED_MPS);
			// Relative TWA; see toUnsignedAngle for the [0, 2pi) wrap.
			return [
				buildWind130306Message(
					toUnsignedAngle(directionTrue - headingTrue),
					windSpeed,
					"True (water referenced)",
				),
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
							reference: "True (water referenced)",
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
							reference: "True (water referenced)",
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
							reference: "True (water referenced)",
						},
					},
				],
			},
			{
				// No true heading -> cannot compute a relative angle
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
