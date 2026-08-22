import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SLOW_DATA_TIMEOUT_MS,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SubConversionModule } from "../types/index.js";
import { isPlainObject } from "../utils/validation.js";
import {
	instanceList,
	isValidInstanceSignalKId,
	normalizedN2kInstance,
} from "./instanceOptions.js";

interface ChargerConfig {
	signalkId: string;
	instanceId: number;
	batteryInstanceId: number;
}

const OPERATING_STATE: Record<string, string> = {
	bulk: "Bulk",
	acceptance: "Absorption",
	overcharge: "Overcharge",
	equalize: "Equalise",
	float: "Float",
};

const CHARGE_MODE: Record<string, string> = {
	standalone: "Standalone",
	master: "Primary",
	slave: "Secondary",
};

function normalizedConfig(config: unknown): ChargerConfig | null {
	if (!isPlainObject(config)) return null;
	if (!isValidInstanceSignalKId(config.signalkId)) return null;
	const instanceId = normalizedN2kInstance(config.instanceId);
	const batteryInstanceId = normalizedN2kInstance(config.batteryInstanceId);
	if (instanceId === undefined || batteryInstanceId === undefined) return null;
	return {
		signalkId: String(config.signalkId),
		instanceId,
		batteryInstanceId,
	};
}

export default function createChargerStatusConversion(): ConversionModule {
	return {
		title: "Charger Status (PGN 127507)",
		optionKey: "CHARGER_STATUS",
		category: "electrical",
		context: VESSELS_SELF_CONTEXT,
		testOptions: {
			chargers: [{ signalkId: "shore", instanceId: 4, batteryInstanceId: 1 }],
		},
		conversions: (options: unknown): SubConversionModule[] | null => {
			const chargers = instanceList<unknown>(options, "chargers")
				.map(normalizedConfig)
				.filter((config): config is ChargerConfig => config !== null);
			if (chargers.length === 0) return null;

			return chargers.map(
				(charger): SubConversionModule => ({
					keys: [
						`electrical.chargers.${charger.signalkId}.chargingMode`,
						`electrical.chargers.${charger.signalkId}.chargerRole`,
					],
					timeouts: [SLOW_DATA_TIMEOUT_MS, SLOW_DATA_TIMEOUT_MS],
					callback: (chargingMode: unknown, chargerRole: unknown): N2KMessage[] => {
						const operatingState =
							typeof chargingMode === "string" ? OPERATING_STATE[chargingMode] : undefined;
						const chargeMode =
							typeof chargerRole === "string" ? CHARGE_MODE[chargerRole] : undefined;
						if (operatingState === undefined && chargeMode === undefined) return [];

						return [
							{
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 127507,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: charger.instanceId,
									batteryInstance: charger.batteryInstanceId,
									operatingState,
									chargeMode,
								},
							},
						];
					},
					tests: [
						{
							input: ["acceptance", "master"],
							expected: [
								{
									prio: 2,
									pgn: 127507,
									dst: 255,
									fields: {
										instance: 4,
										batteryInstance: 1,
										operatingState: "Absorption",
										chargeMode: "Primary",
									},
								},
							],
						},
						{
							input: ["equalize", "slave"],
							expected: [
								{
									prio: 2,
									pgn: 127507,
									dst: 255,
									fields: {
										instance: 4,
										batteryInstance: 1,
										operatingState: "Equalise",
										chargeMode: "Secondary",
									},
								},
							],
						},
						{
							input: ["unknown", "standby"],
							expected: [],
						},
					],
				}),
			);
		},
	};
}
