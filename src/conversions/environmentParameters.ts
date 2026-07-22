import {
	HUMIDITY_SOURCE_VALUES,
	resolveSourceOption,
	TEMPERATURE_SOURCE_VALUES,
} from "../config/environmentSources.js";
import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, N2K_SID_ZERO } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { toFiniteInRange, toRelativeHumidityPercent } from "../utils/validation.js";

const DEFAULT_TEMPERATURE_SOURCE = "Outside Temperature";
const DEFAULT_HUMIDITY_SOURCE = "Outside";
const MAX_TEMPERATURE_K = 655.32;
const MAX_PRESSURE_PA = 6_553_200;
const ENVIRONMENT_PATHS = [
	"environment.outside.temperature",
	"environment.outside.relativeHumidity",
	"environment.outside.humidity",
	"environment.outside.pressure",
];

function sourcesFromOptions(options: Record<string, unknown>): {
	temperatureSource: string;
	humiditySource: string;
} {
	return {
		temperatureSource: resolveSourceOption(
			options.temperatureSource,
			TEMPERATURE_SOURCE_VALUES,
			DEFAULT_TEMPERATURE_SOURCE,
		),
		humiditySource: resolveSourceOption(
			options.humiditySource,
			HUMIDITY_SOURCE_VALUES,
			DEFAULT_HUMIDITY_SOURCE,
		),
	};
}

function createEnvironmentMessage(
	temperature: unknown,
	relativeHumidity: unknown,
	humidity: unknown,
	pressure: unknown,
	temperatureSource: string,
	humiditySource: string,
): N2KMessage[] {
	const temperatureK = toFiniteInRange(temperature, 0, MAX_TEMPERATURE_K) ?? null;
	const relativeHumidityPercent = toRelativeHumidityPercent(relativeHumidity);
	const fallbackHumidityPercent = toRelativeHumidityPercent(humidity);
	const humidityPercent = relativeHumidityPercent ?? fallbackHumidityPercent;
	const atmosphericPressure = toFiniteInRange(pressure, 0, MAX_PRESSURE_PA) ?? null;

	if (temperatureK === null && humidityPercent === null && atmosphericPressure === null) return [];

	return [
		{
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 130311,
			dst: N2K_BROADCAST_DST,
			fields: {
				sid: N2K_SID_ZERO,
				temperatureSource,
				humiditySource,
				temperature: temperatureK,
				humidity: humidityPercent,
				atmosphericPressure,
			},
		},
	];
}

export default function createEnvironmentParametersConversion(
	_app: SignalKApp,
): ConversionModule<unknown[]> {
	return {
		title: "Environmental Parameters (PGN 130311)",
		optionKey: "ENVIRONMENT_PARAMETERS",
		category: "environment",
		keys: ENVIRONMENT_PATHS,
		testOptions: [{}, { temperatureSource: "Dew Point Temperature", humiditySource: "Inside" }],
		conversions: (options) => {
			const { temperatureSource, humiditySource } = sourcesFromOptions(options);

			return [
				{
					keys: ENVIRONMENT_PATHS,
					callback: (temperature, relativeHumidity, humidity, pressure) =>
						createEnvironmentMessage(
							temperature,
							relativeHumidity,
							humidity,
							pressure,
							temperatureSource,
							humiditySource,
						),
					tests: [
						{
							input: [295.15, 0.625, null, 101300],
							expected: [
								(testOptions: Record<string, unknown>) => ({
									prio: 2,
									pgn: 130311,
									dst: 255,
									fields: {
										sid: 0,
										...sourcesFromOptions(testOptions),
										temperature: 295.15,
										humidity: 62.5,
										atmosphericPressure: 101300,
									},
								}),
							],
						},
						{
							input: [null, null, null, 101300],
							expected: [
								(testOptions: Record<string, unknown>) => ({
									prio: 2,
									pgn: 130311,
									dst: 255,
									fields: {
										sid: 0,
										...sourcesFromOptions(testOptions),
										atmosphericPressure: 101300,
									},
								}),
							],
						},
					],
				},
			];
		},
	};
}
