import { DEFAULT_GLOBAL_RESEND_SECONDS } from "../constants.js";
import type { Config, ConversionConfig } from "./schema.js";

export function migrateLegacyConfig(raw: unknown): Config {
	let migrated: Config;

	if (
		raw &&
		typeof raw === "object" &&
		"conversions" in raw &&
		typeof (raw as { conversions: unknown }).conversions === "object" &&
		(raw as { conversions: unknown }).conversions !== null
	) {
		migrated = raw as Config;
	} else {
		const conversions: Record<string, ConversionConfig> = {};
		let globalResendInterval: number = DEFAULT_GLOBAL_RESEND_SECONDS;

		if (raw && typeof raw === "object") {
			for (const [key, value] of Object.entries(
				raw as Record<string, unknown>,
			)) {
				if (key === "globalResendInterval") {
					if (typeof value === "number") globalResendInterval = value;
					continue;
				}
				if (!value || typeof value !== "object") continue;
				const entry = value as Record<string, unknown>;
				const sources: Record<string, string> = {};
				const extras: Record<string, unknown> = {};
				for (const [k, v] of Object.entries(entry)) {
					if (k === "enabled" || k === "resend") continue;
					if (typeof v === "string") sources[k] = v;
					else extras[k] = v;
				}
				conversions[key] = {
					enabled: typeof entry.enabled === "boolean" ? entry.enabled : false,
					resend: typeof entry.resend === "number" ? entry.resend : 0,
					sources,
					extras,
				};
			}
		}

		migrated = { globalResendInterval, conversions };
	}

	// Second pass: per-conversion extras-shape migrations. Runs against both
	// configs that came in already nested (the early-return branch above) and
	// configs that were just lifted from the legacy flat shape, so both
	// surfaces converge on the current per-conversion extras schema.
	migrateConversionExtras(migrated);

	return migrated;
}

/**
 * Per-conversion extras-shape migrations. Each branch is a one-shot upgrade
 * from a previous extras shape to the current one. Safe to re-run: each
 * branch is gated by a "looks like the legacy shape" detection rule so
 * already-migrated configs pass through untouched.
 */
function migrateConversionExtras(config: Config): void {
	const engineStatic = config.conversions.ENGINE_STATIC;
	if (engineStatic) {
		const migratedExtras = migrateEngineStaticExtras(engineStatic.extras);
		if (migratedExtras !== engineStatic.extras) {
			engineStatic.extras = migratedExtras;
		}
	}
}

/**
 * v1.5.4 -> v1.5.5: ENGINE_STATIC extras moved from a single flat-scalar
 * shape ({ ratedEngineSpeed, VIN, softwareVersion }) to a per-engine table
 * ({ engines: [{ signalkId, instanceId, ratedEngineSpeed, VIN,
 * softwareVersion }] }). Detection: extras lacks `engines` AND has at least
 * one of the legacy scalars. The synthesized row uses signalkId "0" and
 * instanceId 0 to preserve the prior on-wire behavior (PGN 127498 with
 * instance=0, decoded by canboatjs as "Single Engine or Dual Engine Port").
 */
function migrateEngineStaticExtras(
	extras: Record<string, unknown>,
): Record<string, unknown> {
	if (Array.isArray(extras.engines)) return extras;

	const ratedEngineSpeed =
		typeof extras.ratedEngineSpeed === "number"
			? extras.ratedEngineSpeed
			: undefined;
	const VIN = typeof extras.VIN === "string" ? extras.VIN : undefined;
	const softwareVersion =
		typeof extras.softwareVersion === "string"
			? extras.softwareVersion
			: undefined;

	if (
		ratedEngineSpeed === undefined &&
		VIN === undefined &&
		softwareVersion === undefined
	) {
		return extras;
	}

	const row: Record<string, unknown> = { signalkId: "0", instanceId: 0 };
	if (ratedEngineSpeed !== undefined) row.ratedEngineSpeed = ratedEngineSpeed;
	if (VIN !== undefined) row.VIN = VIN;
	if (softwareVersion !== undefined) row.softwareVersion = softwareVersion;

	const next: Record<string, unknown> = { engines: [row] };
	// Drop the legacy scalars so the panel doesn't re-display them.
	for (const [k, v] of Object.entries(extras)) {
		if (k === "ratedEngineSpeed" || k === "VIN" || k === "softwareVersion") {
			continue;
		}
		next[k] = v;
	}
	return next;
}
