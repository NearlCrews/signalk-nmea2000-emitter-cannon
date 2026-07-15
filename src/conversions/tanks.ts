import {
	MAX_TANK_INSTANCE,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SLOW_DATA_TIMEOUT_MS,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { clamp, toValidNumber } from "../utils/validation.js";
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
}

export default function createTanksConversion(app: SignalKApp): ConversionModule {
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
			const tanks = instanceList<TankConfig>(options, "tanks");
			if (tanks.length === 0) return null;

			const validConversions = tanks.map((tank) => {
				const split = tank.signalkPath.split(".");
				const tankType = split[1];

				if (!tankType) {
					const msg = `Invalid tank path: ${tank.signalkPath}`;
					app.error(msg);
					return null;
				}

				const type = typeMapping[tankType];

				if (type) {
					// PGN 127505 instance is a 4-bit field (0-13 valid). Clamp once
					// so an out-of-range mapping cannot silently wrap (e.g. 20 -> 4)
					// onto a different tank gauge.
					const instance = clamp(tank.instanceId, 0, MAX_TANK_INSTANCE);
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
										instance,
										type,
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
				} else {
					const msg = `unknown tank type: ${tankType}`;
					app.error(msg);
					return null;
				}
			});

			return validConversions.filter((conv): conv is NonNullable<typeof conv> => conv !== null);
		},
	};
}
