import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	N2KFieldValue,
	N2KMessage,
} from "../types/index.js";
import { isValidNumber, toValidNumber } from "../utils/validation.js";

const TRIM_TAB_FULL_DEFLECTION_RAD = 0.52;

export default function createSmallCraftStatusConversion(): ConversionModule {
	return {
		title: "Small Craft Status (130576)",
		optionKey: "SMALL_CRAFT_STATUS",
		keys: [
			"steering.trimTab.port",
			"steering.trimTab.starboard",
			"propulsion.main.trimAngle",
			"design.displacement",
			"performance.velocityMadeGood",
			"performance.polarSpeed",
			"performance.polarSpeedRatio",
		],
		timeouts: [5000, 5000, 5000, 60000, 5000, 5000, 5000], // 5s for dynamic, 1min for static
		callback: (
			trimTabPort: unknown,
			trimTabStbd: unknown,
			trimAngle: unknown,
			displacement: unknown,
			vmg: unknown,
			polarSpeed: unknown,
			polarRatio: unknown,
		): N2KMessage[] => {
			if (
				trimTabPort == null &&
				trimTabStbd == null &&
				trimAngle == null &&
				vmg == null &&
				polarSpeed == null
			) {
				return [];
			}

			// Heuristic: small absolute values are interpreted as radians and
			// scaled to percent against full-deflection; larger values are
			// already in percent.
			const normalizeTabPosition = (position: unknown): number | null => {
				if (!isValidNumber(position)) return null;
				if (Math.abs(position) < Math.PI) {
					return Math.round((position / TRIM_TAB_FULL_DEFLECTION_RAD) * 100);
				}
				return Math.round(position);
			};

			const portTabPercent = normalizeTabPosition(trimTabPort);
			const stbdTabPercent = normalizeTabPosition(trimTabStbd);

			const fields: Record<string, N2KFieldValue> = {
				colorCode: "Red",
			};

			if (portTabPercent !== null) fields.portTrimTab = portTabPercent;
			if (stbdTabPercent !== null) fields.starboardTrimTab = stbdTabPercent;

			const validTrimAngle = toValidNumber(trimAngle);
			if (validTrimAngle !== null) fields.trim = validTrimAngle;

			const validDisplacement = toValidNumber(displacement);
			if (validDisplacement !== null) fields.displacement = validDisplacement;

			const validVmg = toValidNumber(vmg);
			if (validVmg !== null) fields.velocityMadeGoodToWaypoint = validVmg;

			const validPolarSpeed = toValidNumber(polarSpeed);
			if (validPolarSpeed !== null) fields.polarSpeed = validPolarSpeed;

			const validPolarRatio = toValidNumber(polarRatio);
			if (validPolarRatio !== null) fields.polarSpeedRatio = validPolarRatio;

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
				input: [0.1, -0.05, 0.0349, 5000, 4.2, 5.1, 0.82], // Small angles in radians
				expected: [
					{
						prio: 2,
						pgn: 130576,
						dst: 255,
						fields: {
							portTrimTab: 19, // ~19% (0.1/0.52 * 100)
							starboardTrimTab: -10, // ~-10%
						},
					},
				],
			},
			{
				input: [15, -8, null, null, 3.8, null, null], // Already in percentage
				expected: [
					{
						prio: 2,
						pgn: 130576,
						dst: 255,
						fields: {
							portTrimTab: 15,
							starboardTrimTab: -8,
						},
					},
				],
			},
			{
				input: [null, null, null, null, 2.5, 4.0, 0.625], // Just performance data
				expected: [
					{
						prio: 2,
						pgn: 130576,
						dst: 255,
						fields: {},
					},
				],
			},
		],
	};
}
