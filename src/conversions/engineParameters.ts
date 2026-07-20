import {
	DEFAULT_DATA_TIMEOUT_MS,
	M3PS_TO_LPH,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
	SubConversionModule,
} from "../types/index.js";
import { isPlainObject, isValidNumber, toValidNumber } from "../utils/validation.js";
import {
	instanceList,
	isValidInstanceSignalKId,
	normalizedN2kInstance,
} from "./instanceOptions.js";

interface ExhaustTempEngineConfig {
	signalkId: string | number;
	tempInstanceId: number;
}

interface EngineConfig {
	signalkId: string | number;
	instanceId: number;
}

function normalizedExhaustConfig(config: unknown): ExhaustTempEngineConfig | null {
	if (!isPlainObject(config) || !isValidInstanceSignalKId(config.signalkId)) return null;
	const tempInstanceId = normalizedN2kInstance(config.tempInstanceId);
	return tempInstanceId === undefined ? null : { signalkId: config.signalkId, tempInstanceId };
}

function normalizedEngineConfig(config: unknown): EngineConfig | null {
	if (!isPlainObject(config) || !isValidInstanceSignalKId(config.signalkId)) return null;
	const instanceId = normalizedN2kInstance(config.instanceId);
	return instanceId === undefined ? null : { signalkId: config.signalkId, instanceId };
}

export default function createEngineParametersConversions(
	_app: SignalKApp,
): ConversionModule<unknown[]>[] {
	// discrete status fields are not yet implemented
	const engParKeys = [
		"oilPressure",
		"oilTemperature",
		"temperature",
		"alternatorVoltage",
		"fuel.rate",
		"runTime",
		"coolantPressure",
		"fuel.pressure",
		"engineLoad",
		"engineTorque",
	];

	const engRapidKeys = ["revolutions", "boostPressure", "drive.trimState"];

	return [
		{
			title: "Exhaust Temperature (PGN 130312)",
			optionKey: "EXHAUST_TEMPERATURE",
			category: "engine",
			presets: ["engine-set"],
			context: VESSELS_SELF_CONTEXT,

			testOptions: {
				engines: [
					{
						signalkId: 10,
						tempInstanceId: 1,
					},
				],
			},

			conversions: (options: unknown) => {
				const engines = instanceList<unknown>(options, "engines")
					.map(normalizedExhaustConfig)
					.filter((engine): engine is ExhaustTempEngineConfig => engine !== null);
				if (engines.length === 0) return null;

				return engines.map((engine) => ({
					keys: [`propulsion.${engine.signalkId}.exhaustTemperature`],
					callback: ((temperature: number | null) => {
						if (!isValidNumber(temperature)) {
							return [];
						}
						return [
							{
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 130312,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: engine.tempInstanceId,
									actualTemperature: temperature,
									source: "Exhaust Gas Temperature",
								},
							},
						];
					}) as ConversionCallback<[number | null]>,
					tests: [
						{
							input: [281.2],
							expected: [
								{
									prio: 2,
									pgn: 130312,
									dst: 255,
									fields: {
										instance: 1,
										actualTemperature: 281.2,
										source: "Exhaust Gas Temperature",
									},
								},
							],
						},
					],
				}));
			},
		},
		{
			title: "Engine Parameters (PGNs 127488, 127489)",
			optionKey: "ENGINE_PARAMETERS",
			category: "engine",
			presets: ["engine-set"],
			context: VESSELS_SELF_CONTEXT,

			testOptions: {
				engines: [
					{
						signalkId: 0,
						instanceId: 1,
					},
				],
			},

			conversions: (options: unknown) => {
				const engines = instanceList<unknown>(options, "engines")
					.map(normalizedEngineConfig)
					.filter((engine): engine is EngineConfig => engine !== null);
				if (engines.length === 0) return null;

				const engParTimeouts = engParKeys.map(() => DEFAULT_DATA_TIMEOUT_MS);
				const engRapidTimeouts = engRapidKeys.map(() => DEFAULT_DATA_TIMEOUT_MS);

				const dyn = engines.map((engine) => ({
					keys: engParKeys.map((key) => `propulsion.${engine.signalkId}.${key}`),
					timeouts: engParTimeouts,
					callback: ((
						oilPres: number | null,
						oilTemp: number | null,
						temp: number | null,
						altVolt: number | null,
						fuelRate: number | null,
						runTime: number | null,
						coolPres: number | null,
						fuelPres: number | null,
						engLoad: number | null,
						engTorque: number | null,
					) => {
						const oilPressure = toValidNumber(oilPres);
						const oilTemperature = toValidNumber(oilTemp);
						const temperature = toValidNumber(temp);
						const alternatorPotential = toValidNumber(altVolt);
						const fuelRateConverted = isValidNumber(fuelRate) ? fuelRate * M3PS_TO_LPH : null;
						const totalEngineHours = toValidNumber(runTime);
						const coolantPressure = toValidNumber(coolPres);
						const fuelPressure = toValidNumber(fuelPres);
						const engineLoad = isValidNumber(engLoad) ? engLoad * 100 : null;
						const engineTorque = isValidNumber(engTorque) ? engTorque * 100 : null;

						return [
							{
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 127489,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: engine.instanceId,
									oilPressure,
									oilTemperature,
									temperature,
									alternatorPotential,
									fuelRate: fuelRateConverted,
									totalEngineHours,
									coolantPressure,
									fuelPressure,
									discreteStatus1: [],
									discreteStatus2: [],
									engineLoad,
									engineTorque,
								},
							},
						];
					}) as ConversionCallback<
						[
							number | null,
							number | null,
							number | null,
							number | null,
							number | null,
							number | null,
							number | null,
							number | null,
							number | null,
							number | null,
						]
					>,
					tests: [
						{
							input: [102733, 210, 220, 13.1, 0.0001, 201123, 202133, 11111111, 0.5, 1.0],
							expected: [
								{
									prio: 2,
									pgn: 127489,
									dst: 255,
									fields: {
										instance: "Dual Engine Starboard",
										oilPressure: 102700,
										oilTemperature: 210,
										temperature: 220,
										alternatorPotential: 13.1,
										fuelRate: 360,
										totalEngineHours: "55:52:03",
										coolantPressure: 202100,
										fuelPressure: 11111000,
										discreteStatus1: [],
										discreteStatus2: [],
										engineLoad: 50,
										engineTorque: 100,
									},
								},
							],
						},
					],
				}));

				const rapid = engines.map((engine) => ({
					keys: engRapidKeys.map((key) => `propulsion.${engine.signalkId}.${key}`),
					timeouts: engRapidTimeouts,
					callback: ((
						revolutions: number | null,
						boostPressure: number | null,
						trimState: number | null,
					) => {
						const speed = isValidNumber(revolutions) ? revolutions * 60 : null;
						const boostPres = toValidNumber(boostPressure);
						const tiltTrim = isValidNumber(trimState) ? trimState * 100 : null;

						return [
							{
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 127488,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: engine.instanceId,
									speed,
									boostPressure: boostPres,
									tiltTrim,
								},
							},
						];
					}) as ConversionCallback<[number | null, number | null, number | null]>,
					tests: [
						{
							// 30 rev/s = 1800 RPM, a realistic cruising engine speed that
							// fits the 0.25 RPM u16 field without overflow.
							input: [30, 20345, 0.5],
							expected: [
								{
									prio: 2,
									pgn: 127488,
									dst: 255,
									fields: {
										instance: "Dual Engine Starboard",
										speed: 1800,
										boostPressure: 20300,
										tiltTrim: 50,
									},
								},
							],
						},
					],
				}));

				// Cast required by the bivariance bridge in src/types/plugin.ts (34-39):
				// SubConversionModule callbacks are contravariant on input tuple, so
				// merging differently-typed sub-modules needs `unknown[]`.
				return [...dyn, ...rapid] as SubConversionModule<unknown[]>[];
			},
		},
	];
}
