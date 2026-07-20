import { DEFAULT_DATA_TIMEOUT_MS, N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

const MIN_COMPONENT_SPEED = -32.767;
const MAX_COMPONENT_SPEED = 32.764;

function component(value: unknown): number | undefined {
	return isValidNumber(value) && value >= MIN_COMPONENT_SPEED && value <= MAX_COMPONENT_SPEED
		? value
		: undefined;
}

export default function createVesselSpeedComponentsConversion(): ConversionModule {
	return {
		title: "Vessel Speed Components (PGN 130578)",
		optionKey: "VESSEL_SPEED_COMPONENTS",
		category: "navigation",
		keys: ["navigation.speedThroughWaterLongitudinal", "navigation.speedThroughWaterTransverse"],
		timeouts: [DEFAULT_DATA_TIMEOUT_MS, DEFAULT_DATA_TIMEOUT_MS],
		callback: (longitudinal: unknown, transverse: unknown): N2KMessage[] => {
			const longitudinalSpeedWaterReferenced = component(longitudinal);
			const transverseSpeedWaterReferenced = component(transverse);
			if (
				longitudinalSpeedWaterReferenced === undefined &&
				transverseSpeedWaterReferenced === undefined
			) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 130578,
					dst: N2K_BROADCAST_DST,
					fields: {
						longitudinalSpeedWaterReferenced,
						transverseSpeedWaterReferenced,
					},
				},
			];
		},
		tests: [
			{
				input: [4.125, -0.75],
				expected: [
					{
						prio: 2,
						pgn: 130578,
						dst: 255,
						fields: {
							longitudinalSpeedWaterReferenced: 4.125,
							transverseSpeedWaterReferenced: -0.75,
						},
					},
				],
			},
			{
				input: [null, 0.5],
				expected: [
					{
						prio: 2,
						pgn: 130578,
						dst: 255,
						fields: { transverseSpeedWaterReferenced: 0.5 },
					},
				],
			},
			{
				input: [-33, Number.POSITIVE_INFINITY],
				expected: [],
			},
		],
	};
}
