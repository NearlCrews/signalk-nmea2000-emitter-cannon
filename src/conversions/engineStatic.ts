import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	STATIC_DATA_TIMEOUT_MS,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { toValidNumber } from "../utils/validation.js";

export default function createEngineStaticConversion(
	_app: SignalKApp,
): ConversionModule<[number | null, string | null, string | null]> {
	return {
		title: "Engine Configuration Parameters (PGN 127498)",
		optionKey: "ENGINE_STATIC",
		category: "engine",
		presets: ["engine-set"],
		keys: [
			"propulsion.main.ratedEngineSpeed",
			"propulsion.main.VIN",
			"propulsion.main.softwareVersion",
		],
		timeouts: [
			STATIC_DATA_TIMEOUT_MS,
			STATIC_DATA_TIMEOUT_MS,
			STATIC_DATA_TIMEOUT_MS,
		],
		callback: ((
			ratedEngineSpeed: number | null,
			VIN: string | null,
			softwareVersion: string | null,
		) => {
			if (ratedEngineSpeed == null && VIN == null && softwareVersion == null) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 127498,
					dst: N2K_BROADCAST_DST,
					fields: {
						// TODO: single-engine only; extend with an `engines` config
						// like ENGINE_PARAMETERS to support multi-engine vessels.
						instance: 0,
						ratedEngineSpeed: toValidNumber(ratedEngineSpeed) ?? undefined,
						vin: typeof VIN === "string" ? VIN : "",
						softwareId:
							typeof softwareVersion === "string" ? softwareVersion : "",
					},
				},
			];
		}) as ConversionCallback<[number | null, string | null, string | null]>,
		tests: [
			{
				input: [3600, "ABC123456789", "v2.1.3"],
				expected: [
					{
						prio: 2,
						pgn: 127498,
						dst: 255,
						fields: {
							instance: "Single Engine or Dual Engine Port",
							ratedEngineSpeed: 3600,
							vin: "ABC123456789",
							softwareId: "v2.1.3",
						},
					},
				],
			},
			{
				input: [2800, null, "v1.0.0"],
				expected: [
					{
						prio: 2,
						pgn: 127498,
						dst: 255,
						fields: {
							instance: "Single Engine or Dual Engine Port",
							ratedEngineSpeed: 2800,
							softwareId: "v1.0.0",
						},
					},
				],
			},
		],
	};
}
