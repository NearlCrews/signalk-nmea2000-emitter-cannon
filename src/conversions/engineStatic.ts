import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { toValidNumber } from "../utils/validation.js";

// PGN 127498 is static engine identity: rated speed, VIN, software version.
// There is no canonical Signal K source for these fields (no v1-schema
// propulsion.<id>.ratedEngineSpeed / VIN / softwareVersion path exists),
// so the values come from plugin config via `extras` and the conversion
// publishes on a slow timer.
const STATIC_EMIT_INTERVAL_MS = 60_000;

interface EngineStaticConfig {
	ratedEngineSpeed?: number;
	VIN?: string;
	softwareVersion?: string;
}

export default function createEngineStaticConversion(
	_app: SignalKApp,
): ConversionModule {
	let cfg: EngineStaticConfig = {};
	return {
		title: "Engine Configuration Parameters (PGN 127498)",
		optionKey: "ENGINE_STATIC",
		category: "engine",
		presets: ["engine-set"],
		sourceType: "timer",
		interval: STATIC_EMIT_INTERVAL_MS,
		onOptionsLoaded: (options) => {
			const next: EngineStaticConfig = {};
			const rated = toValidNumber(options.ratedEngineSpeed);
			if (rated !== null) next.ratedEngineSpeed = rated;
			if (typeof options.VIN === "string" && options.VIN) {
				next.VIN = options.VIN;
			}
			if (
				typeof options.softwareVersion === "string" &&
				options.softwareVersion
			) {
				next.softwareVersion = options.softwareVersion;
			}
			cfg = next;
		},
		callback: (): N2KMessage[] => {
			if (
				cfg.ratedEngineSpeed === undefined &&
				!cfg.VIN &&
				!cfg.softwareVersion
			) {
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
						ratedEngineSpeed: cfg.ratedEngineSpeed,
						vin: cfg.VIN ?? "",
						softwareId: cfg.softwareVersion ?? "",
					},
				},
			];
		},
		tests: [
			{
				testOptions: {
					ratedEngineSpeed: 3600,
					VIN: "ABC123456789",
					softwareVersion: "v2.1.3",
				},
				input: [],
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
				testOptions: {
					ratedEngineSpeed: 2800,
					softwareVersion: "v1.0.0",
				},
				input: [],
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
