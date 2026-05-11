import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { toValidNumber } from "../utils/validation.js";

interface SolarChargerConfig {
	signalkId: string;
	instanceId: number;
	panelInstanceId: number;
}

interface SolarOptions {
	chargers: SolarChargerConfig[];
	enabled?: boolean;
	resend?: number;
}

const SOLAR_TIMEOUT_MS = 60000;

export default function createSolarConversion(
	_app: SignalKApp,
): ConversionModule {
	const solarKeys = ["voltage", "current", "panelCurrent", "panelVoltage"];
	const sharedTimeouts = solarKeys.map(() => SOLAR_TIMEOUT_MS);

	return {
		title: "Solar as Battery (127508)",
		optionKey: "SOLAR",
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
			const solarOptions = options as SolarOptions;
			if (!solarOptions?.chargers) {
				return null;
			}

			return solarOptions.chargers.map((charger) => ({
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
								voltage: voltageValue,
								current: currentValue,
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
								voltage: panelVoltageValue,
								current: panelCurrentValue,
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
