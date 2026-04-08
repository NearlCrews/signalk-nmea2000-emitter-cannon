import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";

export default function createEngineStaticConversion(
	_app: SignalKApp,
): ConversionModule<[number | null, string | null, string | null]> {
	return {
		title: "Engine Configuration Parameters (127498)",
		optionKey: "ENGINE_STATIC",
		keys: [
			"propulsion.main.ratedEngineSpeed",
			"propulsion.main.VIN",
			"propulsion.main.softwareVersion",
		],
		timeouts: [3600000, 3600000, 3600000], // 1 hour - static data
		callback: ((
			ratedEngineSpeed: number | null,
			VIN: string | null,
			softwareVersion: string | null,
		) => {
			// Send static data even if only one field is available
			if (ratedEngineSpeed == null && VIN == null && softwareVersion == null) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 127498,
					dst: N2K_BROADCAST_DST,
					fields: {
						engineInstance: 0,
						typeOfEngine: "Gasoline",
						locationOfEngine: "Main",
						engineGeometry: "In-line",
						ratedEngineSpeed:
							typeof ratedEngineSpeed === "number"
								? ratedEngineSpeed
								: undefined,
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
							ratedEngineSpeed: 3600,
							vin: "ABC123456789",
							softwareId: "v2.1.3",
						},
					},
				],
			},
			{
				input: [2800, null, "v1.0.0"], // Missing VIN
				expected: [
					{
						prio: 2,
						pgn: 127498,
						dst: 255,
						fields: {
							ratedEngineSpeed: 2800,
							softwareId: "v1.0.0",
						},
					},
				],
			},
		],
	};
}
