import {
	DEFAULT_DATA_TIMEOUT_MS,
	M3_TO_L,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SLOW_DATA_TIMEOUT_MS,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	N2KMessage,
	SignalKApp,
	SubConversionModule,
} from "../types/index.js";
import { isPlainObject, isValidNumber, toFiniteInRange } from "../utils/validation.js";
import { isValidInstanceSignalKId, parseSignalKTankPath } from "./instanceOptions.js";

const MAX_TIME_TO_EMPTY_SECONDS = 4_294_967.292;
const MAX_DISTANCE_TO_EMPTY_METERS = 42_949_672.92;
const MAX_ESTIMATED_FUEL_LITERS = 65_532;
const TIME_RESOLUTION_SECONDS = 0.001;
const DISTANCE_RESOLUTION_METERS = 0.01;
const FUEL_RESOLUTION_LITERS = 1;
const VESSEL_TRIP_REFRESH_INTERVAL_MS = 1_000;

interface FuelTankConfig {
	signalkPath: string;
}

interface EngineConfig {
	signalkId: string | number;
}

function normalizedFuelTankConfig(config: unknown): FuelTankConfig | null {
	if (!isPlainObject(config) || typeof config.signalkPath !== "string") return null;
	const tankPath = parseSignalKTankPath(config.signalkPath);
	return tankPath?.type === "fuel" ? { signalkPath: tankPath.path } : null;
}

function normalizedEngineConfig(config: unknown): EngineConfig | null {
	if (!isPlainObject(config) || !isValidInstanceSignalKId(config.signalkId)) return null;
	return { signalkId: config.signalkId };
}

function normalizedConfigRows<T>(
	options: unknown,
	key: string,
	normalize: (row: unknown) => T | null,
): T[] | null {
	const collection =
		options && typeof options === "object" ? (options as Record<string, unknown>)[key] : undefined;
	if (collection === undefined) return [];
	if (!Array.isArray(collection)) return null;

	const normalized: T[] = [];
	for (const row of collection) {
		// Nullish entries are empty placeholders, not configured consumers.
		if (row === null || row === undefined) continue;
		const value = normalize(row);
		if (value === null) return null;
		normalized.push(value);
	}
	return normalized;
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string): T[] {
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = keyFor(value);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function toWireResolution(value: unknown, max: number, resolution: number): number | undefined {
	const valid = toFiniteInRange(value, 0, max);
	if (valid === undefined) return undefined;
	return Math.round(valid / resolution) * resolution;
}

export default function createVesselTripConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Vessel Trip Parameters (PGN 127496)",
		optionKey: "VESSEL_TRIP",
		category: "engine",
		presets: ["engine-set"],
		context: VESSELS_SELF_CONTEXT,
		// A cached range estimate must not be replayed after its tank, rate, or
		// speed inputs stop updating. The refresh schedule rechecks input age.
		allowResend: false,
		refreshInterval: VESSEL_TRIP_REFRESH_INTERVAL_MS,

		testOptions: {
			fuelTanks: [{ signalkPath: "tanks.fuel.0" }, { signalkPath: "tanks.fuel.1" }],
			engines: [{ signalkId: "main" }, { signalkId: "aux" }],
		},

		conversions: (options): SubConversionModule[] | null => {
			const configuredFuelTanks = normalizedConfigRows(
				options,
				"fuelTanks",
				normalizedFuelTankConfig,
			);
			if (configuredFuelTanks === null) return null;
			const fuelTanks = uniqueBy(configuredFuelTanks, (tank) => tank.signalkPath);
			if (fuelTanks.length === 0) return null;

			const configuredEngines = normalizedConfigRows(options, "engines", normalizedEngineConfig);
			if (configuredEngines === null) return null;
			const engines = uniqueBy(configuredEngines, (engine) => String(engine.signalkId));

			const keys = fuelTanks.flatMap((tank) => [
				`${tank.signalkPath}.currentVolume`,
				`${tank.signalkPath}.currentLevel`,
				`${tank.signalkPath}.capacity`,
			]);
			const timeouts = fuelTanks.flatMap(() => [
				SLOW_DATA_TIMEOUT_MS,
				SLOW_DATA_TIMEOUT_MS,
				undefined,
			]);

			for (const engine of engines) {
				keys.push(`propulsion.${engine.signalkId}.fuel.rate`);
				timeouts.push(DEFAULT_DATA_TIMEOUT_MS);
			}
			if (engines.length > 0) {
				keys.push("navigation.speedOverGround");
				timeouts.push(DEFAULT_DATA_TIMEOUT_MS);
			}

			const callback: ConversionCallback = (...values: unknown[]): N2KMessage[] => {
				let remainingCubicMeters = 0;
				for (let index = 0; index < fuelTanks.length; index++) {
					const valueIndex = index * 3;
					const currentVolume = values[valueIndex];
					const currentLevel = values[valueIndex + 1];
					const capacity = values[valueIndex + 2];

					if (isValidNumber(currentVolume) && currentVolume >= 0) {
						remainingCubicMeters += currentVolume;
						continue;
					}
					if (
						isValidNumber(currentLevel) &&
						currentLevel >= 0 &&
						currentLevel <= 1 &&
						isValidNumber(capacity) &&
						capacity >= 0
					) {
						remainingCubicMeters += currentLevel * capacity;
						continue;
					}

					// A partial tank aggregate understates fuel remaining, so wait until
					// every configured tank has a complete, current value.
					return [];
				}

				const estimatedFuelRemaining = toWireResolution(
					remainingCubicMeters * M3_TO_L,
					MAX_ESTIMATED_FUEL_LITERS,
					FUEL_RESOLUTION_LITERS,
				);
				if (estimatedFuelRemaining === undefined) return [];

				const fields: N2KMessage["fields"] = { estimatedFuelRemaining };
				if (engines.length > 0) {
					const engineOffset = fuelTanks.length * 3;
					let totalFuelRate = 0;
					let allEngineRatesAvailable = true;
					for (let index = 0; index < engines.length; index++) {
						const fuelRate = values[engineOffset + index];
						if (!isValidNumber(fuelRate) || fuelRate < 0) {
							allEngineRatesAvailable = false;
							break;
						}
						totalFuelRate += fuelRate;
					}

					// Missing one configured engine rate can overstate range. Keep the
					// safe remaining-fuel field, but omit time and distance until every
					// engine is present and the aggregate consumption is positive.
					if (allEngineRatesAvailable && isValidNumber(totalFuelRate) && totalFuelRate > 0) {
						const rawTimeToEmpty = remainingCubicMeters / totalFuelRate;
						const timeToEmpty = toWireResolution(
							rawTimeToEmpty,
							MAX_TIME_TO_EMPTY_SECONDS,
							TIME_RESOLUTION_SECONDS,
						);
						if (timeToEmpty !== undefined) fields.timeToEmpty = timeToEmpty;

						const speedOverGround = values[engineOffset + engines.length];
						if (isValidNumber(speedOverGround) && speedOverGround >= 0) {
							const distanceToEmpty = toWireResolution(
								rawTimeToEmpty * speedOverGround,
								MAX_DISTANCE_TO_EMPTY_METERS,
								DISTANCE_RESOLUTION_METERS,
							);
							if (distanceToEmpty !== undefined) fields.distanceToEmpty = distanceToEmpty;
						}
					}
				}

				// tripRunTime stays unavailable. Neither Canboat nor Signal K defines
				// a safe mapping from navigation.trip.lastReset to propulsion runtime.
				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127496,
						dst: N2K_BROADCAST_DST,
						fields,
					},
				];
			};

			return [
				{
					keys,
					timeouts,
					// These inputs may legitimately originate on NMEA 2000. PGN
					// 127496 does not decode back to any of them, so permitting the
					// configured paths cannot create an emitter feedback loop.
					allowNmea2000InputPaths: keys,
					callback,
					tests: [
						{
							input: [0.02, null, null, null, 0.5, 0.032, 0.000006, 0.000004, 4],
							expected: [
								{
									prio: 2,
									pgn: 127496,
									dst: 255,
									fields: {
										timeToEmpty: "01:00:00",
										distanceToEmpty: 14400,
										estimatedFuelRemaining: 36,
									},
								},
							],
						},
						{
							input: [0.02, null, null, null, 0.5, 0.032, 0.000006, null, 4],
							expected: [
								{
									prio: 2,
									pgn: 127496,
									dst: 255,
									fields: { estimatedFuelRemaining: 36 },
								},
							],
						},
						{
							input: [0.02, null, null, null, 0.5, 0.032, 0, 0, 4],
							expected: [
								{
									prio: 2,
									pgn: 127496,
									dst: 255,
									fields: { estimatedFuelRemaining: 36 },
								},
							],
						},
						{
							input: [0.02, null, null, null, null, null, 0.000006, 0.000004, 4],
							expected: [],
						},
						{
							input: [40, null, null, 30, null, null, 0.000006, 0.000004, 4],
							expected: [],
						},
					],
				},
			];
		},
	};
}
