import {
	MAX_TANK_INSTANCE,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SLOW_DATA_TIMEOUT_MS,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { clamp, isPlainObject, isValidNumber, toFiniteInRange } from "../utils/validation.js";
import { instanceList, parseSignalKTankPath } from "./instanceOptions.js";

// PGN 127505 capacity is unsigned 32-bit at 0.1 L, so it tops out at
// 429,496,729.2 L. Signal K publishes cubic metres, hence the /1000.
const MAX_TANK_CAPACITY_M3 = 429_496.7292;

const typeMapping: Record<string, string> = {
	fuel: "Fuel",
	blackWater: "Black water",
	freshWater: "Water",
	wasteWater: "Gray water",
	greyWater: "Gray water",
	grayWater: "Gray water",
	liveWell: "Live well",
	lubrication: "Oil",
	gas: "Fuel",
};

interface TankConfig {
	signalkPath: string;
	instanceId: number;
	type: string;
}

function normalizedTankConfig(config: unknown): TankConfig | null {
	if (!isPlainObject(config) || typeof config.signalkPath !== "string") return null;
	const tankPath = parseSignalKTankPath(config.signalkPath);
	if (
		tankPath === null ||
		typeMapping[tankPath.type] === undefined ||
		!isValidNumber(config.instanceId)
	) {
		return null;
	}
	return {
		signalkPath: tankPath.path,
		instanceId: clamp(Math.trunc(config.instanceId), 0, MAX_TANK_INSTANCE),
		type: typeMapping[tankPath.type] ?? "",
	};
}

export default function createTanksConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Tank Levels (PGN 127505)",
		optionKey: "TANKS",
		category: "tanks",
		presets: ["engine-set"],
		context: VESSELS_SELF_CONTEXT,

		testOptions: {
			tanks: [
				{
					signalkPath: "tanks.fuel.0",
					instanceId: 1,
				},
			],
		},

		conversions: (options: unknown) => {
			const tanks = instanceList<unknown>(options, "tanks")
				.map(normalizedTankConfig)
				.filter((tank): tank is TankConfig => tank !== null);
			if (tanks.length === 0) return null;

			return tanks.map((tank) => {
				return {
					keys: [`${tank.signalkPath}.currentLevel`, `${tank.signalkPath}.capacity`],
					timeouts: [SLOW_DATA_TIMEOUT_MS, SLOW_DATA_TIMEOUT_MS],
					callback: (currentLevel: unknown, capacity: unknown): N2KMessage[] => {
						// currentLevel is a Signal K ratio, so anything outside [0, 1] is
						// a provider publishing percent. Scaling that by 100 overflows
						// the signed 0.004 % field and wraps: 100 becomes 10000, which
						// decodes as 38.528 %. Reject it rather than emit a fake level.
						const level = toFiniteInRange(currentLevel, 0, 1) ?? null;
						const cap = toFiniteInRange(capacity, 0, MAX_TANK_CAPACITY_M3) ?? null;

						if (level === null && cap === null) {
							return [];
						}

						return [
							{
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 127505,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: tank.instanceId,
									type: tank.type,
									...(level === null ? {} : { level: level * 100 }),
									...(cap === null ? {} : { capacity: cap * 1000 }),
								},
							},
						];
					},
					tests: [
						{
							input: [0.35, 0.012],
							expected: [
								{
									prio: 2,
									pgn: 127505,
									dst: 255,
									fields: {
										instance: 1,
										type: "Fuel",
										level: 35,
										capacity: 12,
									},
								},
							],
						},
						{
							input: [0.35, null],
							expected: [
								{
									prio: 2,
									pgn: 127505,
									dst: 255,
									fields: { instance: 1, type: "Fuel", level: 35 },
								},
							],
						},
						{
							input: [null, 0.012],
							expected: [
								{
									prio: 2,
									pgn: 127505,
									dst: 255,
									fields: { instance: 1, type: "Fuel", capacity: 12 },
								},
							],
						},
					],
				};
			});
		},
	};
}
