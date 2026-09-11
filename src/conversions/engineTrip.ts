import {
	DEFAULT_DATA_TIMEOUT_MS,
	M3_TO_L,
	M3PS_TO_LPH,
	MAX_N2K_FUEL_RATE_LPH,
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

const TRIP_KEYS = [
	"trip.fuelUsed",
	"trip.fuelRate.average",
	"trip.fuelRate.economy",
	"trip.fuelRate.instantaneousEconomy",
] as const;

// PGN 127497 tripFuelUsed is unsigned 16-bit at 1 L, not the 32-bit field its
// cumulative-total role suggests, so a long-range tank total wraps: 70000 L
// reaches the receiver as 4464 L. The three sibling rate fields share the
// signed 0.1 L/h definition that MAX_N2K_FUEL_RATE_LPH describes.
const MAX_TRIP_FUEL_USED_L = 65532;

interface EngineTripConfig {
	signalkId: string | number;
	instanceId: number;
}

function normalizedEngineTripConfig(config: unknown): EngineTripConfig | null {
	if (!isPlainObject(config) || !isValidInstanceSignalKId(config.signalkId)) return null;
	const instanceId = normalizedN2kInstance(config.instanceId);
	return instanceId === undefined ? null : { signalkId: config.signalkId, instanceId };
}

type TripInputs = [number | null, number | null, number | null, number | null];

export default function createEngineTripConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Engine Trip Parameters (PGN 127497)",
		optionKey: "ENGINE_TRIP",
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

		conversions: (options): SubConversionModule[] | null => {
			const engines = instanceList<unknown>(options, "engines")
				.map(normalizedEngineTripConfig)
				.filter((engine): engine is EngineTripConfig => engine !== null);
			if (engines.length === 0) return null;

			const timeouts = TRIP_KEYS.map(() => DEFAULT_DATA_TIMEOUT_MS);

			return engines.map((engine): SubConversionModule => {
				const callback: ConversionCallback<TripInputs> = (
					fuelUsed,
					fuelRateAverage,
					fuelRateEconomy,
					instantaneousFuelEconomy,
				) => {
					// Bound each field after its unit conversion, in the litres and
					// L/h the wire carries rather than the m^3 and m^3/s Signal K
					// publishes. Every one of these wraps rather than rejecting, so
					// an out-of-range value would arrive as a smaller, plausible
					// number instead of as not-available.
					const tripFuelUsed = isValidNumber(fuelUsed)
						? (toFiniteInRange(fuelUsed * M3_TO_L, 0, MAX_TRIP_FUEL_USED_L) ?? null)
						: null;
					const fuelRateAverageLph = isValidNumber(fuelRateAverage)
						? (toFiniteInRange(
								fuelRateAverage * M3PS_TO_LPH,
								-MAX_N2K_FUEL_RATE_LPH,
								MAX_N2K_FUEL_RATE_LPH,
							) ?? null)
						: null;
					const fuelRateEconomyLph = isValidNumber(fuelRateEconomy)
						? (toFiniteInRange(
								fuelRateEconomy * M3PS_TO_LPH,
								-MAX_N2K_FUEL_RATE_LPH,
								MAX_N2K_FUEL_RATE_LPH,
							) ?? null)
						: null;
					const instantaneousFuelEconomyLph = isValidNumber(instantaneousFuelEconomy)
						? (toFiniteInRange(
								instantaneousFuelEconomy * M3PS_TO_LPH,
								-MAX_N2K_FUEL_RATE_LPH,
								MAX_N2K_FUEL_RATE_LPH,
							) ?? null)
						: null;

					// All-null payload would otherwise replace a useful entry
					// from another producer on the bus.
					if (
						tripFuelUsed === null &&
						fuelRateAverageLph === null &&
						fuelRateEconomyLph === null &&
						instantaneousFuelEconomyLph === null
					) {
						return [];
					}

					return [
						{
							prio: N2K_DEFAULT_PRIORITY,
							pgn: 127497,
							dst: N2K_BROADCAST_DST,
							fields: {
								instance: engine.instanceId,
								tripFuelUsed: tripFuelUsed ?? undefined,
								fuelRateAverage: fuelRateAverageLph ?? undefined,
								fuelRateEconomy: fuelRateEconomyLph ?? undefined,
								instantaneousFuelEconomy: instantaneousFuelEconomyLph ?? undefined,
							},
						},
					];
				};
				return {
					keys: TRIP_KEYS.map((key) => `propulsion.${engine.signalkId}.${key}`),
					timeouts,
					callback,
					tests: [
						// All four trip fields present.
						{
							input: [
								0.025, // 25 L total
								0.000002, // 0.000002 m^3/s = 7.2 L/hour average
								0.000003, // 0.000003 m^3/s = 10.8 L/hour economy
								0.000004, // 0.000004 m^3/s = 14.4 L/hour instantaneous
							],
							expected: [
								{
									prio: 2,
									pgn: 127497,
									dst: 255,
									fields: {
										instance: "Dual Engine Starboard",
										tripFuelUsed: 25,
										fuelRateAverage: 7.2,
										fuelRateEconomy: 10.8,
										instantaneousFuelEconomy: 14.4,
									},
								},
							],
						},
						// Only the cumulative trip total is published; fuelRate.* missing.
						{
							input: [0.05, null, null, null],
							expected: [
								{
									prio: 2,
									pgn: 127497,
									dst: 255,
									fields: {
										instance: "Dual Engine Starboard",
										tripFuelUsed: 50,
									},
								},
							],
						},
						// Every field missing: no PGN emitted.
						{
							input: [null, null, null, null],
							expected: [],
						},
						// Regression on all four fields at once. 70 m^3 is 70000 L and
						// wrapped to 4464 L, and 0.001 m^3/s is 3600 L/h on each rate
						// field and wrapped to -2953.6 L/h. Nothing usable is left, so
						// the frame is dropped rather than sent with four fabricated
						// numbers.
						{
							input: [70, 0.001, 0.001, 0.001],
							expected: [],
						},
					],
				};
			});
		},
	};
}
