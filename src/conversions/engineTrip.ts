import {
	DEFAULT_DATA_TIMEOUT_MS,
	M3_TO_L,
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
import { isValidNumber } from "../utils/validation.js";
import { instanceList } from "./instanceOptions.js";

const TRIP_KEYS = [
	"trip.fuelUsed",
	"trip.fuelRate.average",
	"trip.fuelRate.economy",
	"trip.fuelRate.instantaneousEconomy",
] as const;

interface EngineTripConfig {
	signalkId: string | number;
	instanceId: number;
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
			const engines = instanceList<EngineTripConfig>(options, "engines");
			if (engines.length === 0) return null;

			const timeouts = TRIP_KEYS.map(() => DEFAULT_DATA_TIMEOUT_MS);

			return engines.map((engine): SubConversionModule => {
				const callback: ConversionCallback<TripInputs> = (
					fuelUsed,
					fuelRateAverage,
					fuelRateEconomy,
					instantaneousFuelEconomy,
				) => {
					const tripFuelUsed = isValidNumber(fuelUsed) ? fuelUsed * M3_TO_L : null;
					const fuelRateAverageLph = isValidNumber(fuelRateAverage)
						? fuelRateAverage * M3PS_TO_LPH
						: null;
					const fuelRateEconomyLph = isValidNumber(fuelRateEconomy)
						? fuelRateEconomy * M3PS_TO_LPH
						: null;
					const instantaneousFuelEconomyLph = isValidNumber(instantaneousFuelEconomy)
						? instantaneousFuelEconomy * M3PS_TO_LPH
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
					],
				};
			});
		},
	};
}
