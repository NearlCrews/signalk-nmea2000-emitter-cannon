import {
	DEFAULT_DATA_TIMEOUT_MS,
	M3PS_TO_LPH,
	MAX_N2K_ENGINE_SPEED_RPM,
	MAX_N2K_FUEL_RATE_LPH,
	MAX_N2K_VOLTAGE_V,
	MAX_OIL_TEMPERATURE_K,
	MAX_PRESSURE_PA,
	MAX_TEMPERATURE_K,
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
import { isPlainObject, isValidNumber, toFiniteInRange } from "../utils/validation.js";
import {
	instanceList,
	isValidInstanceSignalKId,
	normalizedN2kInstance,
} from "./instanceOptions.js";

// Two PGN 127489 ceilings that no sibling PGN shares, so they live here rather
// than in constants.js. The oilTemperature bound does have a sibling (the
// PGN 127493 field of the same name), so it lives in constants.js as
// MAX_OIL_TEMPERATURE_K.
//
// fuelPressure is unsigned 16-bit at 1000 Pa, ten times wider than the 100 Pa
// field MAX_PRESSURE_PA describes.
const MAX_FUEL_PRESSURE_PA = 65_532_000;
// totalEngineHours is an unsigned 32-bit DURATION at 1 s: 136 years. It still
// wraps rather than refusing, and a provider publishing milliseconds crosses
// the ceiling at about 1193 engine hours, which an older engine has long
// passed.
const MAX_ENGINE_RUNTIME_S = 4_294_967_292;

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
					// Without a freshness window mapRxJS retains the last reading
					// forever, so a dead probe would keep rebroadcasting it. Every
					// sibling per-instance conversion declares one.
					timeouts: [DEFAULT_DATA_TIMEOUT_MS],
					callback: ((temperature: number | null) => {
						// PGN 130312 tops out at 655.32 K (382 C). A dry-stack exhaust
						// gas probe reads well past that under load, and the unsigned
						// field wraps rather than rejecting: 773 K would go on the bus
						// as 117.64 K, a fabricated low reading at the exact moment
						// exhaust temperature matters.
						const exhaustK = toFiniteInRange(temperature, 0, MAX_TEMPERATURE_K);
						if (exhaustK === undefined) {
							return [];
						}
						return [
							{
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 130312,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: engine.tempInstanceId,
									actualTemperature: exhaustK,
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
						// Every field on this PGN wraps rather than refusing an
						// out-of-range value, so each one is bounded to the range its own
						// wire definition allows. The three resolutions differ: the two
						// 100 Pa pressures share MAX_PRESSURE_PA, fuel pressure is ten
						// times wider, and oil temperature is ten times coarser than the
						// 0.01 K coolant field beside it.
						const oilPressure = toFiniteInRange(oilPres, 0, MAX_PRESSURE_PA) ?? null;
						// A sender publishing Celsius rather than the Kelvin the Signal K
						// spec calls for sends -5 on a cold morning, which reached the
						// receiver as 6548.6 K.
						const oilTemperature = toFiniteInRange(oilTemp, 0, MAX_OIL_TEMPERATURE_K) ?? null;
						// Coolant temperature is the same unsigned 0.01 K field the
						// exhaust module above guards, and it wraps the same way: -5 K
						// reached the receiver as 650.36 K, or 377 C, hot enough to trip
						// a high-temperature alarm on a cold engine.
						const temperature = toFiniteInRange(temp, 0, MAX_TEMPERATURE_K) ?? null;
						// The same signed 0.01 V field as PGN 127508 voltage: 400 V
						// reached the receiver as -255.36 V.
						const alternatorPotential =
							toFiniteInRange(altVolt, -MAX_N2K_VOLTAGE_V, MAX_N2K_VOLTAGE_V) ?? null;
						// PGN 127489 fuelRate is signed 16-bit at 0.1 L/h. Bound the
						// converted L/h rather than the m^3/s input: 3600 L/h wrapped
						// onto the bus as -2953.6 L/h.
						const fuelRateConverted = isValidNumber(fuelRate)
							? (toFiniteInRange(
									fuelRate * M3PS_TO_LPH,
									-MAX_N2K_FUEL_RATE_LPH,
									MAX_N2K_FUEL_RATE_LPH,
								) ?? null)
							: null;
						// runTime in milliseconds rather than the spec's seconds crosses
						// the 32-bit ceiling at about 1193 engine hours: 4300000000
						// reached the receiver as 1397 hours.
						const totalEngineHours = toFiniteInRange(runTime, 0, MAX_ENGINE_RUNTIME_S) ?? null;
						const coolantPressure = toFiniteInRange(coolPres, 0, MAX_PRESSURE_PA) ?? null;
						const fuelPressure = toFiniteInRange(fuelPres, 0, MAX_FUEL_PRESSURE_PA) ?? null;
						// engineLoad and engineTorque are Signal K ratios feeding signed
						// 8-bit 1 % fields. A provider publishing percent instead of the
						// spec ratio scales to 5000, wraps, and shows a 50 percent load
						// as -120 percent, so anything outside the ratio range is
						// rejected (matches tanks.ts and raymarineBrightness.ts).
						const engineLoadRatio = toFiniteInRange(engLoad, 0, 1);
						const engineLoad = engineLoadRatio === undefined ? null : engineLoadRatio * 100;
						const engineTorqueRatio = toFiniteInRange(engTorque, 0, 1);
						const engineTorque = engineTorqueRatio === undefined ? null : engineTorqueRatio * 100;

						// All-null payload would otherwise replace a useful entry
						// from another producer on the bus. The two discrete-status
						// arrays are always present and always empty, so they carry no
						// data of their own and cannot keep the frame alive.
						if (
							oilPressure === null &&
							oilTemperature === null &&
							temperature === null &&
							alternatorPotential === null &&
							fuelRateConverted === null &&
							totalEngineHours === null &&
							coolantPressure === null &&
							fuelPressure === null &&
							engineLoad === null &&
							engineTorque === null
						) {
							return [];
						}

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
						{
							// Regression on the four wrapping fields. A cold-start coolant
							// reading of -5 K reached the receiver as 650.36 K (377 C), a
							// fuel rate of 0.001 m^3/s is 3600 L/h and wrapped to
							// -2953.6 L/h, and a provider publishing load and torque as
							// percent instead of the spec ratio turned 50 percent into
							// -120 percent and 100 percent into 16 percent. All four now
							// encode as not-available, which the receiver reads as a
							// missing value rather than a fabricated one.
							input: [102733, 210, -5, 13.1, 0.001, 201123, 202133, 11111111, 50, 100],
							expected: [
								{
									prio: 2,
									pgn: 127489,
									dst: 255,
									fields: {
										instance: "Dual Engine Starboard",
										oilPressure: 102700,
										oilTemperature: 210,
										alternatorPotential: 13.1,
										totalEngineHours: "55:52:03",
										coolantPressure: 202100,
										fuelPressure: 11111000,
										discreteStatus1: [],
										discreteStatus2: [],
									},
								},
							],
						},
						{
							// Regression on the six remaining fields, which wrap the same
							// way the four above do. A negative oil or coolant pressure
							// reached the receiver as 6453600 Pa, a fuel pressure of
							// 70000000 Pa as 4464000 Pa, an alternator reading of 400 V
							// as -255.36 V, an oil temperature published in Celsius as
							// 6548.6 K, and a run time in milliseconds as 1397 hours
							// rather than 1194. Only the in-range coolant temperature and
							// fuel rate survive.
							input: [-100000, -5, 350, 400, 0.0001, 4300000000, -100000, 70000000, 0.5, 1.0],
							expected: [
								{
									prio: 2,
									pgn: 127489,
									dst: 255,
									fields: {
										instance: "Dual Engine Starboard",
										temperature: 350,
										fuelRate: 360,
										discreteStatus1: [],
										discreteStatus2: [],
										engineLoad: 50,
										engineTorque: 100,
									},
								},
							],
						},
						{
							// Every field out of range at once. Now that all ten are
							// guarded this is reachable from bad data rather than only
							// from an absent path, and the frame would otherwise carry
							// nothing but an instance and two empty status arrays.
							input: [-100000, -5, -5, 400, 0.001, 4300000000, -100000, 70000000, 50, 100],
							expected: [],
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
						// PGN 127488 speed is unsigned 16-bit at 0.25 rpm. Signal K
						// permits a negative revolutions for astern rotation, which the
						// field cannot carry: -30 Hz went on the bus as 14584 RPM, well
						// past any marine engine's redline. Bound the converted RPM and
						// leave the field not-available rather than dropping the whole
						// frame, which would take boostPressure and tiltTrim with it.
						const speed = isValidNumber(revolutions)
							? (toFiniteInRange(revolutions * 60, 0, MAX_N2K_ENGINE_SPEED_RPM) ?? null)
							: null;
						// The same unsigned 100 Pa field as the two PGN 127489 pressures,
						// and it wraps the same way: a negative reading from a failing
						// sensor reached the receiver as 6533300 Pa, or 65 bar of boost.
						const boostPres = toFiniteInRange(boostPressure, 0, MAX_PRESSURE_PA) ?? null;
						// trimState is a Signal K ratio feeding a signed 8-bit 1 % field,
						// so it carries the same provider-units hazard as engineLoad
						// above and takes the same guard. Trim runs both ways, so the
						// range is [-1, 1] rather than [0, 1].
						const tiltTrimRatio = toFiniteInRange(trimState, -1, 1);
						const tiltTrim = tiltTrimRatio === undefined ? null : tiltTrimRatio * 100;

						// All-null payload would otherwise replace a useful entry
						// from another producer on the bus.
						if (speed === null && boostPres === null && tiltTrim === null) {
							return [];
						}

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
						{
							// Regression: -30 rev/s is astern rotation, which Signal K
							// permits and PGN 127488 cannot carry. It went on the bus as
							// 14584 RPM. A trimState of 50 is a provider publishing
							// percent instead of the spec ratio, which wrapped to
							// -120 percent. boostPressure is in range and still emitted,
							// so the frame is not dropped wholesale.
							input: [-30, 20345, 50],
							expected: [
								{
									prio: 2,
									pgn: 127488,
									dst: 255,
									fields: {
										instance: "Dual Engine Starboard",
										boostPressure: 20300,
									},
								},
							],
						},
						{
							// Regression: boost pressure is the same unsigned 100 Pa
							// field as the two PGN 127489 pressures. A negative reading
							// from a failing sensor reached the receiver as 6533300 Pa,
							// or 65 bar. The in-range speed and trim still go out.
							input: [30, -20345, 0.5],
							expected: [
								{
									prio: 2,
									pgn: 127488,
									dst: 255,
									fields: {
										instance: "Dual Engine Starboard",
										speed: 1800,
										tiltTrim: 50,
									},
								},
							],
						},
						{
							// All three out of range at once, which the guards above make
							// reachable from bad data rather than only from an absent
							// path. The frame would otherwise carry nothing but an
							// instance.
							input: [-30, -20345, 50],
							expected: [],
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
