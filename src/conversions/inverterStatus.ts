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

interface InverterConfig {
	signalkId: string;
	instanceId: number;
	acInstanceId: number;
	dcInstanceId: number;
}

const OPERATING_STATE: Record<string, string> = {
	inverting: "Invert",
	faulted: "Fault",
	disabled: "Disabled",
};

function normalizedConfig(config: unknown): InverterConfig | null {
	if (!isPlainObject(config) || !isValidInstanceSignalKId(config.signalkId)) return null;
	const instanceId = normalizedN2kInstance(config.instanceId);
	const acInstanceId = normalizedN2kInstance(config.acInstanceId);
	const dcInstanceId = normalizedN2kInstance(config.dcInstanceId);
	if (instanceId === undefined || acInstanceId === undefined || dcInstanceId === undefined) {
		return null;
	}
	return {
		signalkId: String(config.signalkId),
		instanceId,
		acInstanceId,
		dcInstanceId,
	};
}

export default function createInverterStatusConversion(): ConversionModule {
	return {
		title: "Inverter Status (PGN 127509)",
		optionKey: "INVERTER_STATUS",
		category: "electrical",
		context: VESSELS_SELF_CONTEXT,
		testOptions: {
			inverters: [{ signalkId: "main", instanceId: 2, acInstanceId: 1, dcInstanceId: 3 }],
		},
		conversions: (options: unknown): SubConversionModule[] | null => {
			const inverters = instanceList<unknown>(options, "inverters")
				.map(normalizedConfig)
				.filter((config): config is InverterConfig => config !== null);
			if (inverters.length === 0) return null;

			return inverters.map(
				(inverter): SubConversionModule => ({
					keys: [`electrical.inverters.${inverter.signalkId}.inverterMode`],
					timeouts: [SLOW_DATA_TIMEOUT_MS],
					callback: (mode: unknown): N2KMessage[] => {
						const operatingState = typeof mode === "string" ? OPERATING_STATE[mode] : undefined;
						if (operatingState === undefined) return [];
						return [
							{
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 127509,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: inverter.instanceId,
									acInstance: inverter.acInstanceId,
									dcInstance: inverter.dcInstanceId,
									operatingState,
									inverterEnable:
										mode === "inverting" ? "On" : mode === "disabled" ? "Off" : undefined,
								},
							},
						];
					},
					tests: [
						{
							input: ["inverting"],
							expected: [
								{
									prio: 2,
									pgn: 127509,
									dst: 255,
									fields: {
										instance: 2,
										acInstance: 1,
										dcInstance: 3,
										operatingState: "Invert",
										inverterEnable: "On",
									},
								},
							],
						},
						{ input: ["standby"], expected: [] },
					],
				}),
			);
		},
	};
}
