import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	PluginOptions,
	SignalKApp,
	SignalKPlugin,
	SubConversionModule,
} from "../types/index.js";

interface BrightnessGroup {
	signalkId: string;
	instanceId: string;
}

export default function createRaymarineBrightnessConversion(
	_app: SignalKApp,
	_plugin: SignalKPlugin,
): ConversionModule {
	const conversions = (
		options: PluginOptions["RAYMARINE_BRIGHTNESS"],
	): SubConversionModule<[number | null]>[] => {
		const groups = options?.groups as BrightnessGroup[] | undefined;

		if (!groups || !Array.isArray(groups) || groups.length === 0) {
			return [];
		}

		return groups.map((group: BrightnessGroup) => ({
			title: `Raymarine Display Brightness ${group.instanceId} (126720)`,
			optionKey: "RAYMARINE_BRIGHTNESS",
			keys: [`electrical.displays.raymarine.${group.signalkId}.brightness`],
			callback: (brightness: number | null) => {
				if (typeof brightness !== "number") {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 126720,
						dst: N2K_BROADCAST_DST,
						fields: {
							manufacturerCode: "Raymarine",
							industryCode: "Marine Industry",
							proprietaryId: "0x0c8c",
							group: group.instanceId || "Helm 2",
							unknown1: 1,
							command: "Brightness",
							brightness: (brightness || 0) * 100,
							unknown2: 0,
						},
					},
				];
			},
			tests: [
				{
					input: [0.85],
					expected: [
						{
							prio: 2,
							pgn: 126720,
							dst: 255,
							fields: {
								manufacturerCode: "Raymarine",
								industryCode: "Marine Industry",
								proprietaryId: "0x0c8c",
								group: "Helm 2",
								unknown1: 1,
								command: "Brightness",
								brightness: 85,
								unknown2: 0,
							},
						},
					],
				},
			],
		}));
	};

	return {
		title: "Raymarine Display Brightness (126720)",
		optionKey: "RAYMARINE_BRIGHTNESS",
		conversions,
	} as ConversionModule;
}
