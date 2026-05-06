import {
	DEFAULT_DATA_TIMEOUT_MS,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	JSONSchema,
	SignalKApp,
	SubConversionModule,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isValidNumber } from "../utils/validation.js";

interface ExhaustTempEngineConfig {
	signalkId: string | number;
	tempInstanceId: number;
}

interface EngineConfig {
	signalkId: string | number;
	instanceId: number;
}

interface ExhaustTempOptions {
	engines: ExhaustTempEngineConfig[];
	enabled?: boolean;
	resend?: number;
}

interface EngineParamsOptions {
	engines: EngineConfig[];
	enabled?: boolean;
	resend?: number;
}

export default function createEngineParametersConversions(
	app: SignalKApp,
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
			title: "Temperature, exhaust (130312)",
			optionKey: "EXHAUST_TEMPERATURE",
			context: "vessels.self",
			properties: (): JSONSchema["properties"] => ({
				engines: {
					title: "Engine Mapping",
					type: "array",
					items: {
						type: "object",
						properties: {
							signalkId: {
								title: "Signal K engine id",
								type: "string",
							},
							tempInstanceId: {
								title: "NMEA2000 Temperature Instance Id",
								type: "number",
							},
						},
					},
				},
			}),

			testOptions: {
				engines: [
					{
						signalkId: 10,
						tempInstanceId: 1,
					},
				],
			},

			conversions: (options: unknown) => {
				const engineOptions = options as ExhaustTempOptions;
				if (!engineOptions?.engines) {
					return null;
				}

				return engineOptions.engines.map((engine) => ({
					keys: [`propulsion.${engine.signalkId}.exhaustTemperature`],
					callback: ((temperature: number | null) => {
						try {
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
						} catch (err) {
							app.error(errMessage(err));
							return [];
						}
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
			title: "Engine Parameters (127489,127488)",
			optionKey: "ENGINE_PARAMETERS",
			context: "vessels.self",
			properties: (): JSONSchema["properties"] => ({
				engines: {
					title: "Engine Mapping",
					type: "array",
					items: {
						type: "object",
						properties: {
							signalkId: {
								title: "Signal K engine id",
								type: "string",
							},
							instanceId: {
								title: "NMEA2000 Engine Instance Id",
								type: "number",
							},
						},
					},
				},
			}),

			testOptions: {
				engines: [
					{
						signalkId: 0,
						instanceId: 1,
					},
				],
			},

			conversions: (options: unknown) => {
				const engineOptions = options as EngineParamsOptions;
				if (!engineOptions?.engines) {
					return null;
				}

				const engParTimeouts = engParKeys.map(() => DEFAULT_DATA_TIMEOUT_MS);
				const engRapidTimeouts = engRapidKeys.map(
					() => DEFAULT_DATA_TIMEOUT_MS,
				);

				const dyn = engineOptions.engines.map((engine) => ({
					keys: engParKeys.map(
						(key) => `propulsion.${engine.signalkId}.${key}`,
					),
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
						try {
							const oilPressure = isValidNumber(oilPres) ? oilPres / 100 : null;
							const oilTemperature = isValidNumber(oilTemp) ? oilTemp : null;
							const temperature = isValidNumber(temp) ? temp : null;
							const alternatorPotential = isValidNumber(altVolt)
								? altVolt
								: null;
							const fuelRateConverted = isValidNumber(fuelRate)
								? fuelRate * 3600 * 1000
								: null;
							const totalEngineHours = isValidNumber(runTime) ? runTime : null;
							const coolantPressure = isValidNumber(coolPres)
								? coolPres / 100
								: null;
							const fuelPressure = isValidNumber(fuelPres)
								? fuelPres / 100
								: null;
							const engineLoad = isValidNumber(engLoad) ? engLoad * 100 : null;
							const engineTorque = isValidNumber(engTorque)
								? engTorque * 100
								: null;

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
						} catch (err) {
							app.error(errMessage(err));
							return [];
						}
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
							input: [
								102733, 210, 220, 13.1, 100, 201123, 202133, 11111111, 0.5, 1.0,
							],
							expected: [
								{
									prio: 2,
									pgn: 127489,
									dst: 255,
									fields: {
										instance: "Dual Engine Starboard",
										oilPressure: 1000,
										oilTemperature: 210,
										temperature: 220,
										alternatorPotential: 13.1,
										fuelRate: -2355.2,
										totalEngineHours: "55:52:03",
										coolantPressure: 2000,
										fuelPressure: 111000,
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

				const rapid = engineOptions.engines.map((engine) => ({
					keys: engRapidKeys.map(
						(key) => `propulsion.${engine.signalkId}.${key}`,
					),
					timeouts: engRapidTimeouts,
					callback: ((
						revolutions: number | null,
						boostPressure: number | null,
						trimState: number | null,
					) => {
						try {
							const speed = isValidNumber(revolutions)
								? revolutions * 60
								: null;
							const boostPres = isValidNumber(boostPressure)
								? boostPressure / 100
								: null;
							const tiltTrim = isValidNumber(trimState)
								? trimState * 100
								: null;

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
						} catch (err) {
							app.error(errMessage(err));
							return [];
						}
					}) as ConversionCallback<
						[number | null, number | null, number | null]
					>,
					tests: [
						{
							input: [1001, 20345, 0.5],
							expected: [
								{
									prio: 2,
									pgn: 127488,
									dst: 255,
									fields: {
										instance: "Dual Engine Starboard",
										speed: 10908,
										boostPressure: 200,
										tiltTrim: 50,
									},
								},
							],
						},
					],
				}));

				return [...dyn, ...rapid] as SubConversionModule<unknown[]>[];
			},
		},
	];
}
