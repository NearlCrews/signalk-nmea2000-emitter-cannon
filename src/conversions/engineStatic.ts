import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SOURCE_TYPE,
	STATIC_EMIT_INTERVAL_MS,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
	SubConversionModule,
} from "../types/index.js";
import { toValidNumber } from "../utils/validation.js";

// PGN 127498 is static engine identity: rated speed, VIN, software version.
// There is no canonical Signal K source for these fields (no v1-schema
// propulsion.<id>.ratedEngineSpeed / VIN / softwareVersion path exists), so
// the values come from plugin config via `extras` and the conversion publishes
// on a slow timer.

interface EngineStaticEngineConfig {
	signalkId: string | number;
	instanceId: number;
	ratedEngineSpeed?: number;
	VIN?: string;
	softwareVersion?: string;
}

interface EngineStaticOptions {
	engines?: EngineStaticEngineConfig[];
	enabled?: boolean;
	resend?: number;
}

// canboat ENGINE_INSTANCE enum labels, used to derive test expectations from
// the same engine entries that drive the runtime emit. Extend if a test needs
// a port/starboard instance beyond 1.
const INSTANCE_LABELS: Record<number, string> = {
	0: "Single Engine or Dual Engine Port",
	1: "Dual Engine Starboard",
};

function buildPgn(engine: EngineStaticEngineConfig): N2KMessage[] {
	const ratedEngineSpeed = toValidNumber(engine.ratedEngineSpeed);
	const vin = typeof engine.VIN === "string" ? engine.VIN : "";
	const softwareId =
		typeof engine.softwareVersion === "string" ? engine.softwareVersion : "";

	// An all-blank PGN 127498 would replace useful metadata published by another
	// device on the bus.
	if (ratedEngineSpeed === null && !vin && !softwareId) {
		return [];
	}

	const fields: N2KMessage["fields"] = {
		instance: engine.instanceId,
		vin,
		softwareId,
	};
	if (ratedEngineSpeed !== null) {
		fields.ratedEngineSpeed = ratedEngineSpeed;
	}

	return [
		{
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 127498,
			dst: N2K_BROADCAST_DST,
			fields,
		},
	];
}

function expectedFromEngine(engine: EngineStaticEngineConfig): N2KMessage[] {
	const ratedEngineSpeed = toValidNumber(engine.ratedEngineSpeed);
	const vin = typeof engine.VIN === "string" ? engine.VIN : "";
	const softwareId =
		typeof engine.softwareVersion === "string" ? engine.softwareVersion : "";
	if (ratedEngineSpeed === null && !vin && !softwareId) return [];
	const fields: N2KMessage["fields"] = {
		instance: INSTANCE_LABELS[engine.instanceId] ?? engine.instanceId,
	};
	if (ratedEngineSpeed !== null) fields.ratedEngineSpeed = ratedEngineSpeed;
	if (vin) fields.vin = vin;
	if (softwareId) fields.softwareId = softwareId;
	return [{ prio: 2, pgn: 127498, dst: 255, fields }];
}

export default function createEngineStaticConversion(
	_app: SignalKApp,
): ConversionModule {
	return {
		title: "Engine Configuration Parameters (PGN 127498)",
		optionKey: "ENGINE_STATIC",
		category: "engine",
		presets: ["engine-set"],

		testOptions: {
			engines: [
				{
					signalkId: "0",
					instanceId: 0,
					ratedEngineSpeed: 3600,
					VIN: "ABC123456789",
					softwareVersion: "v2.1.3",
				},
				{
					signalkId: "1",
					instanceId: 1,
					ratedEngineSpeed: 2800,
					softwareVersion: "v1.0.0",
				},
			],
		},

		conversions: (options): SubConversionModule[] | null => {
			const engineOptions = options as EngineStaticOptions;
			const engines = Array.isArray(engineOptions?.engines)
				? engineOptions.engines
				: [];
			if (engines.length === 0) return null;

			return engines.map((engine): SubConversionModule => {
				// Config is immutable across the start/stop lifecycle, so build
				// the PGN once at construction time instead of re-validating
				// every 60 s timer tick.
				const pgnMessages = buildPgn(engine);
				return {
					sourceType: SOURCE_TYPE.TIMER,
					interval: STATIC_EMIT_INTERVAL_MS,
					callback: (): N2KMessage[] => pgnMessages,
					tests: [
						{
							input: [],
							expected: expectedFromEngine(engine),
						},
					],
				};
			});
		},
	};
}
