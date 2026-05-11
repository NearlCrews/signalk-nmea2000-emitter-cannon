import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	N2KFieldValue,
	N2KMessage,
} from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

export default function createSmallCraftStatusConversion(): ConversionModule {
	return {
		title: "Small Craft Status (130576)",
		optionKey: "SMALL_CRAFT_STATUS",
		// canboat 130576 carries only portTrimTab + starboardTrimTab; the
		// other SK paths (trim, displacement, performance.*) belong to
		// different PGNs.
		keys: ["steering.trimTab.port", "steering.trimTab.starboard"],
		timeouts: [5000, 5000],
		callback: (trimTabPort: unknown, trimTabStbd: unknown): N2KMessage[] => {
			if (trimTabPort == null && trimTabStbd == null) {
				return [];
			}

			const normalizeTabPosition = (position: unknown): number | null => {
				if (!isValidNumber(position)) return null;
				return Math.round(position * 100);
			};

			const portTabPercent = normalizeTabPosition(trimTabPort);
			const stbdTabPercent = normalizeTabPosition(trimTabStbd);

			if (portTabPercent === null && stbdTabPercent === null) return [];

			const fields: Record<string, N2KFieldValue> = {};
			if (portTabPercent !== null) fields.portTrimTab = portTabPercent;
			if (stbdTabPercent !== null) fields.starboardTrimTab = stbdTabPercent;

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 130576,
					dst: N2K_BROADCAST_DST,
					fields,
				},
			];
		},
		tests: [
			{
				input: [0.5, -0.25],
				expected: [
					{
						prio: 2,
						pgn: 130576,
						dst: 255,
						fields: {
							portTrimTab: 50,
							starboardTrimTab: -25,
						},
					},
				],
			},
			{
				input: [1, -1],
				expected: [
					{
						prio: 2,
						pgn: 130576,
						dst: 255,
						fields: {
							portTrimTab: 100,
							starboardTrimTab: -100,
						},
					},
				],
			},
		],
	};
}
