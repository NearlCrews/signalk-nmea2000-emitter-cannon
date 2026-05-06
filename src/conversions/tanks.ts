import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	JSONSchema,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { toValidNumber } from "../utils/validation.js";

const TANK_TIMEOUT_MS = 60000;

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

interface TankOptions {
	tanks: TankConfig[];
	enabled?: boolean;
	resend?: number;
}

export default function createTanksConversion(
	app: SignalKApp,
): ConversionModule {
	return {
		title: "Tank Levels (127505)",
		optionKey: "TANKS",
		context: "vessels.self",
		properties: (): JSONSchema["properties"] | undefined => {
			// Get tanks from Signal K self vessel data
			const self = app.getSelfPath("") as Record<string, unknown> | undefined;
			const tanks = self?.tanks as Record<string, unknown> | undefined;
			const tankPaths: string[] = [];

			if (tanks && typeof tanks === "object") {
				Object.keys(tanks).forEach((type) => {
					const tankType = tanks[type] as Record<string, unknown> | undefined;
					if (tankType && typeof tankType === "object") {
						Object.keys(tankType).forEach((instance) => {
							tankPaths.push(`tanks.${type}.${instance}`);
						});
					}
				});
			}

			return tankPaths.length === 0
				? undefined
				: {
						tanks: {
							title: "Tank Mapping",
							type: "array",
							items: {
								type: "object",
								properties: {
									signalkPath: {
										title: "Tank Path",
										type: "string",
										enum: tankPaths,
									},
									instanceId: {
										title: "NMEA2000 Tanks Instance Id",
										type: "number",
									},
								},
							},
						},
					};
		},

		testOptions: {
			tanks: [
				{
					signalkPath: "tanks.fuel.0",
					instanceId: 1,
				},
			],
		},

		conversions: (options: unknown) => {
			const tankOptions = options as TankOptions;
			if (!tankOptions?.tanks) {
				return null;
			}

			const validConversions = tankOptions.tanks.map((tank) => {
				const split = tank.signalkPath.split(".");
				const tankType = split[1];

				if (!tankType) {
					const msg = `Invalid tank path: ${tank.signalkPath}`;
					app.error(msg);
					return null;
				}

				const type = typeMapping[tankType];

				if (type) {
					return {
						keys: [
							`${tank.signalkPath}.currentLevel`,
							`${tank.signalkPath}.capacity`,
						],
						timeouts: [TANK_TIMEOUT_MS, TANK_TIMEOUT_MS],
						callback: (
							currentLevel: unknown,
							capacity: unknown,
						): N2KMessage[] => {
							try {
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
											type,
											level: level !== null ? level * 100 : null,
											capacity: cap !== null ? cap * 1000 : null,
										},
									},
								];
							} catch (err) {
								app.error(errMessage(err));
								return [];
							}
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

			return validConversions.filter(
				(conv): conv is NonNullable<typeof conv> => conv !== null,
			);
		},
	};
}
