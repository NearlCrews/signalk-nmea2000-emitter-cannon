import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KFieldValue, N2KMessage } from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

// Signal K publishes a trim-tab position as a ratio; the wire field is a
// signed percent. Module scope, not per callback: nothing here is per
// invocation.
function normalizeTabPosition(position: unknown): number | null {
	if (!isValidNumber(position) || position < -1 || position > 1) return null;
	return Math.round(position * 100);
}

export default function createSmallCraftStatusConversion(): ConversionModule {
	return {
		title: "Small Craft Status (PGN 130576)",
		optionKey: "SMALL_CRAFT_STATUS",
		category: "system",
		// canboat 130576 carries only portTrimTab + starboardTrimTab; the
		// other SK paths (trim, displacement, performance.*) belong to
		// different PGNs.
		//
		// steering.trimTab.{port,starboard} is not part of the canonical
		// Signal K v1 schema; it is the established convention used by
		// trim-tab-aware upstream providers. Requires such a provider.
		keys: ["steering.trimTab.port", "steering.trimTab.starboard"],
		timeouts: [5000, 5000],
		callback: (trimTabPort: unknown, trimTabStbd: unknown): N2KMessage[] => {
			if (trimTabPort == null && trimTabStbd == null) {
				return [];
			}

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
			{
				input: [1.01, -1.01],
				expected: [],
			},
			{
				input: [2, 0.25],
				expected: [
					{
						prio: 2,
						pgn: 130576,
						dst: 255,
						fields: { starboardTrimTab: 25 },
					},
				],
			},
		],
	};
}
