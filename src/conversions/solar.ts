import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SLOW_DATA_TIMEOUT_MS,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { toValidNumber } from "../utils/validation.js";
import { instanceList } from "./instanceOptions.js";

interface SolarChargerConfig {
	signalkId: string;
	instanceId: number;
	panelInstanceId: number;
}

export default function createSolarConversion(
	_app: SignalKApp,
): ConversionModule {
	const solarKeys = ["voltage", "current", "panelCurrent", "panelVoltage"];
	const sharedTimeouts = solarKeys.map(() => SLOW_DATA_TIMEOUT_MS);

	return {
		title: "Solar Panels (PGN 127508)",
		optionKey: "SOLAR",
		category: "electrical",
		context: VESSELS_SELF_CONTEXT,

		testOptions: {
			chargers: [
				{
					signalkId: "bimini",
					instanceId: 10,
					panelInstanceId: 11,
				},
			],
		},

		conversions: (options: unknown) => {
			const chargers = instanceList<SolarChargerConfig>(options, "chargers");
			if (chargers.length === 0) return null;

			return chargers.map((charger) => ({
				keys: solarKeys.map(
					(key) => `electrical.solar.${charger.signalkId}.${key}`,
				),
				timeouts: sharedTimeouts,
				callback: (
					voltage: unknown,
					current: unknown,
					panelCurrent: unknown,
					panelVoltage: unknown,
				): N2KMessage[] => {
					const res: N2KMessage[] = [];

					const voltageValue = toValidNumber(voltage);
					const currentValue = toValidNumber(current);
					const panelCurrentValue = toValidNumber(panelCurrent);
					const panelVoltageValue = toValidNumber(panelVoltage);

					if (voltageValue !== null || currentValue !== null) {
						res.push({
							prio: N2K_DEFAULT_PRIORITY,
							pgn: 127508,
							dst: N2K_BROADCAST_DST,
							fields: {
								instance: charger.instanceId,
								voltage: voltageValue ?? undefined,
								current: currentValue ?? undefined,
							},
						});
					}

					if (panelVoltageValue !== null || panelCurrentValue !== null) {
						res.push({
							prio: N2K_DEFAULT_PRIORITY,
							pgn: 127508,
							dst: N2K_BROADCAST_DST,
							fields: {
								instance: charger.panelInstanceId,
								voltage: panelVoltageValue ?? undefined,
								current: panelCurrentValue ?? undefined,
							},
						});
					}

					return res;
				},
				tests: [
					{
						input: [13, 5, 2, 45.0],
						expected: [
							{
								prio: 2,
								pgn: 127508,
								dst: 255,
								fields: {
									instance: 10,
									voltage: 13,
									current: 5,
								},
							},
							{
								prio: 2,
								pgn: 127508,
								dst: 255,
								fields: {
									instance: 11,
									voltage: 45,
									current: 2,
								},
							},
						],
					},
				],
			}));
		},
	};
}
