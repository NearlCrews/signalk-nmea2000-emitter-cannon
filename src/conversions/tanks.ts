import {
	MAX_TANK_INSTANCE,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SLOW_DATA_TIMEOUT_MS,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import {
	clamp,
	isPlainObject,
	isValidNumber,
	isValidSignalKId,
	toValidNumber,
} from "../utils/validation.js";
import { instanceList } from "./instanceOptions.js";

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
	const segments = config.signalkPath.split(".");
	if (
		segments.length !== 3 ||
		segments[0] !== "tanks" ||
		typeMapping[segments[1] ?? ""] === undefined ||
		!isValidSignalKId(segments[2]) ||
		!isValidNumber(config.instanceId)
	) {
		return null;
	}
	return {
		signalkPath: config.signalkPath,
		instanceId: clamp(Math.trunc(config.instanceId), 0, MAX_TANK_INSTANCE),
		type: typeMapping[segments[1] ?? ""] ?? "",
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
						const level = toValidNumber(currentLevel);
						const cap = toValidNumber(capacity);

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
									level: level !== null ? level * 100 : null,
									capacity: cap !== null ? cap * 1000 : null,
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
					],
				};
			});
		},
	};
}
