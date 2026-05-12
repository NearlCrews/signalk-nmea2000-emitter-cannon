import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	ConversionOptions,
	SignalKApp,
	SignalKPlugin,
	SubConversionModule,
} from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

interface BrightnessGroup {
	signalkId: string;
	instanceId: string;
}

function isBrightnessGroup(v: unknown): v is BrightnessGroup {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		typeof obj.signalkId === "string" && typeof obj.instanceId === "string"
	);
}

export default function createRaymarineBrightnessConversion(
	_app: SignalKApp,
	_plugin: SignalKPlugin,
): ConversionModule<[number | null]> {
	const conversions = (
		options: ConversionOptions,
	): SubConversionModule<[number | null]>[] => {
		const raw = options.groups;
		if (!Array.isArray(raw) || raw.length === 0) {
			return [];
		}
		const groups = raw.filter(isBrightnessGroup);
		if (groups.length === 0) {
			return [];
		}

		return groups.map((group) => ({
			title: `Raymarine Display Brightness ${group.instanceId} (PGN 126720)`,
			keys: [`electrical.displays.raymarine.${group.signalkId}.brightness`],
			callback: (brightness: number | null) => {
				if (!isValidNumber(brightness)) {
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
							brightness: brightness * 100,
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
		title: "Raymarine Display Brightness (PGN 126720)",
		optionKey: "RAYMARINE_BRIGHTNESS",
		category: "comms",
		presets: ["raymarine"],
		conversions,
	};
}
