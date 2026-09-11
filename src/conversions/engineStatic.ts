import {
	MAX_N2K_ENGINE_SPEED_RPM,
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
import { clampString, isPlainObject, isValidNumber, toFiniteInRange } from "../utils/validation.js";
import {
	instanceList,
	isValidInstanceSignalKId,
	normalizedN2kInstance,
} from "./instanceOptions.js";

// PGN 127498 vin and softwareId are STRING_LAU per canboat (length-prefixed,
// variable, with no canboat-declared cap). We bound them anyway as a safety
// belt against the canboatjs encoder's 500-byte per-PGN buffer: 17 chars for
// VIN matches the SAE J1939 / ISO 3779 VIN width, 32 chars for softwareId is
// a project convention for a build identifier. See clampString.
const MAX_VIN_CHARS = 17;
const MAX_SOFTWARE_ID_CHARS = 32;

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

function normalizedEngineStaticConfig(config: unknown): EngineStaticEngineConfig | null {
	if (!isPlainObject(config) || !isValidInstanceSignalKId(config.signalkId)) return null;
	const instanceId = normalizedN2kInstance(config.instanceId);
	if (instanceId === undefined) return null;
	return {
		signalkId: config.signalkId,
		instanceId,
		...(isValidNumber(config.ratedEngineSpeed)
			? { ratedEngineSpeed: config.ratedEngineSpeed }
			: {}),
		...(typeof config.VIN === "string" ? { VIN: config.VIN } : {}),
		...(typeof config.softwareVersion === "string"
			? { softwareVersion: config.softwareVersion }
			: {}),
	};
}

// canboat ENGINE_INSTANCE enum labels, used to derive test expectations from
// the same engine entries that drive the runtime emit. canboat only defines
// 0 and 1 as named labels; instanceIds beyond 1 fall through as numbers, and
// the test fixture exercises that fallback too.
const INSTANCE_LABELS: Record<number, string> = {
	0: "Single Engine or Dual Engine Port",
	1: "Dual Engine Starboard",
};

function buildPgn(engine: EngineStaticEngineConfig): N2KMessage[] {
	// ratedEngineSpeed is the same unsigned 0.25 rpm field as PGN 127488 speed,
	// and it comes straight from a hand-typed config panel rather than from a
	// provider. A trailing zero on 3600 makes 36000, which wraps to 3232 RPM
	// rather than being refused, so an MFD would show a redline the engine
	// cannot reach.
	const ratedEngineSpeed =
		toFiniteInRange(engine.ratedEngineSpeed, 0, MAX_N2K_ENGINE_SPEED_RPM) ?? null;
	const vinRaw = typeof engine.VIN === "string" ? engine.VIN : "";
	const softwareIdRaw = typeof engine.softwareVersion === "string" ? engine.softwareVersion : "";
	const vin = clampString(vinRaw, MAX_VIN_CHARS);
	const softwareId = clampString(softwareIdRaw, MAX_SOFTWARE_ID_CHARS);

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
	// Bound independently of toFiniteInRange, for the same reason the strings
	// are truncated independently below. normalizedEngineStaticConfig has
	// already rejected a non-finite value, so only the range is left to check.
	const rated = engine.ratedEngineSpeed;
	const ratedEngineSpeed =
		rated !== undefined && rated >= 0 && rated <= MAX_N2K_ENGINE_SPEED_RPM ? rated : null;
	const vinRaw = typeof engine.VIN === "string" ? engine.VIN : "";
	const softwareIdRaw = typeof engine.softwareVersion === "string" ? engine.softwareVersion : "";
	// Truncate independently of clampString so the embedded round-trip test
	// catches a regression in clampString itself: if the oracle used
	// clampString too, a bug that truncated to the wrong width would change
	// both buildPgn and the expected in lockstep and the test would still
	// pass.
	const vin = vinRaw.slice(0, MAX_VIN_CHARS);
	const softwareId = softwareIdRaw.slice(0, MAX_SOFTWARE_ID_CHARS);
	if (ratedEngineSpeed === null && !vin && !softwareId) return [];
	const fields: N2KMessage["fields"] = {
		instance: INSTANCE_LABELS[engine.instanceId] ?? engine.instanceId,
	};
	if (ratedEngineSpeed !== null) fields.ratedEngineSpeed = ratedEngineSpeed;
	if (vin) fields.vin = vin;
	if (softwareId) fields.softwareId = softwareId;
	return [{ prio: 2, pgn: 127498, dst: 255, fields }];
}

export default function createEngineStaticConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Engine Configuration Parameters (PGN 127498)",
		optionKey: "ENGINE_STATIC",
		category: "engine",
		presets: ["engine-set"],
		allowResend: false,

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
				{
					// Regression: PGN 127498 vin and softwareId (both STRING_LAU)
					// must be clamped (17 and 32 chars) before reaching canboatjs
					// so its 500-byte encoder buffer cannot overflow on
					// user-supplied extras. Both inputs below exceed those caps
					// so the round-trip exercises the clampString path. The
					// instanceId is bumped to 2 to keep instance ids unique
					// across the fixture and to exercise the INSTANCE_LABELS
					// number-fallback path.
					signalkId: "2",
					instanceId: 2,
					VIN: "VIN1234567890123456789",
					softwareVersion: "plugin-firmware-build-1234567890-abcdefghijklmnop",
				},
				{
					// Regression: ratedEngineSpeed is typed by hand into the config
					// panel, and the unsigned 0.25 rpm field wraps rather than
					// refusing an oversized value. A trailing zero on 3600 makes
					// 36000, which used to reach the bus as 3232 RPM. It is now left
					// not-available, so only the software version is carried.
					signalkId: "3",
					instanceId: 3,
					ratedEngineSpeed: 36000,
					softwareVersion: "v3.0.0",
				},
			],
		},

		conversions: (options): SubConversionModule[] | null => {
			const engines = instanceList<unknown>(options, "engines")
				.map(normalizedEngineStaticConfig)
				.filter((engine): engine is EngineStaticEngineConfig => engine !== null);
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
