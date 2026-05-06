import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	JSONSchema,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
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
	app: SignalKApp,
): ConversionModule {
	const solarKeys = ["voltage", "current", "panelCurrent", "panelVoltage"];
	const sharedTimeouts = solarKeys.map(() => SOLAR_TIMEOUT_MS);

	return {
		title: "Solar as Battery (127508)",
		optionKey: "SOLAR",
		context: "vessels.self",
		properties: (): JSONSchema["properties"] => ({
			chargers: {
				title: "Solar Mapping",
				type: "array",
				items: {
					type: "object",
					required: ["signalkId", "instanceId", "panelInstanceId"],
					properties: {
						signalkId: {
							title: "Signal K Solar id",
							type: "string",
						},
						instanceId: {
							title: "NMEA2000 Battery Instance Id",
							description: "Used for current/voltage",
							type: "number",
						},
						panelInstanceId: {
							title: "NMEA2000 Battery Panel Instance Id",
							description: "Used for panel current/voltage",
							type: "number",
						},
					},
				},
			},
		}),

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
					try {
						const res: N2KMessage[] = [];

						const voltageValue = toValidNumber(voltage);
						const currentValue = toValidNumber(current);
						const panelCurrentValue = toValidNumber(panelCurrent);
						const panelVoltageValue = toValidNumber(panelVoltage);

						// Solar charger output (battery instance)
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

						// Solar panel input (panel instance)
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
					} catch (err) {
						app.error(errMessage(err));
						return [];
					}
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
