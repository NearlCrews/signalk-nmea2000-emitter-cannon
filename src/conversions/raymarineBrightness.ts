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
	// groupLabel is the human-readable NMEA 2000 group label string (e.g.
	// "Helm 1"). The previous name `instanceId` collided with the numeric
	// instance ids used by battery/engine/solar/exhaust editors.
	groupLabel: string;
}

function isBrightnessGroup(v: unknown): v is BrightnessGroup {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		typeof obj.signalkId === "string" && typeof obj.groupLabel === "string"
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
			title: `Raymarine Display Brightness ${group.groupLabel} (PGN 126720)`,
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
						// Fields match canboat's "Seatalk1: Display Brightness"
						// variant (proprietaryId "Display" = 140, command1
						// "Settings" = 12, command NUMBER match 0). The earlier
						// shape (proprietaryId "0x0c8c", command "Brightness",
						// stray unknown1, missing command1/shared) did not match
						// any variant, so canboatjs could not encode a frame a
						// Raymarine MFD would recognize.
						fields: {
							manufacturerCode: "Raymarine",
							industryCode: "Marine Industry",
							proprietaryId: "Display",
							command1: "Settings",
							group: group.groupLabel || "Helm 2",
							shared: "Shared",
							command: 0,
							brightness: brightness * 100,
							unknown2: 0,
						},
					},
				];
			},
			tests: [
				{
					input: [0.85],
					// Expected is the canboatjs-decoded frame: the command NUMBER
					// (emitted as 0) decodes back to its label "Brightness".
					expected: [
						{
							prio: 2,
							pgn: 126720,
							dst: 255,
							fields: {
								manufacturerCode: "Raymarine",
								industryCode: "Marine Industry",
								proprietaryId: "Display",
								command1: "Settings",
								group: "Helm 2",
								shared: "Shared",
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
		// Without testOptions the harness calls conversions({}) -> [], so the
		// embedded round-trip test never runs. Supply one group so the 126720
		// frame is exercised against the canboatjs encoder/decoder.
		testOptions: {
			groups: [{ signalkId: "0", groupLabel: "Helm 2" }],
		},
		conversions,
	};
}
