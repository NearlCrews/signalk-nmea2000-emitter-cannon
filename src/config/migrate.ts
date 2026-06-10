import { DEFAULT_GLOBAL_RESEND_SECONDS } from "../constants.js";
import type { Config, ConversionConfig } from "./schema.js";

/**
 * Unwrap accidental `configuration` envelope nesting.
 *
 * Signal K stores plugin options as `{ enabled, configuration, ... }`. A
 * historical save bug stored that whole envelope back under `configuration`,
 * so every save nested the previous copy one level deeper and stranded
 * top-level scalars (notably `globalResendInterval`) at the innermost layer.
 *
 * The outermost copy is the most recent save, so its keys win; deeper layers
 * only fill keys the newer ones never carried up. The envelope-only keys
 * `configuration` and `enabled` are dropped. The `seen` set guards against a
 * self-referential `configuration` cycle.
 */
function flattenConfigEnvelope(raw: unknown): Record<string, unknown> {
	const chain: Record<string, unknown>[] = [];
	const seen = new Set<unknown>();
	let cur: unknown = raw;
	while (cur && typeof cur === "object" && !seen.has(cur)) {
		seen.add(cur);
		const layer = cur as Record<string, unknown>;
		chain.push(layer);
		cur = layer.configuration;
	}
	const merged: Record<string, unknown> = {};
	// Deepest layer first so the shallower, newer layers overwrite it.
	for (const layer of chain.reverse()) {
		for (const [k, v] of Object.entries(layer)) {
			if (k === "configuration" || k === "enabled") continue;
			if (v !== undefined) merged[k] = v;
		}
	}
	return merged;
}

/** True for a non-null, non-array object literal. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep only the string-valued entries of an object; everything else is dropped. */
function toStringRecord(value: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (isPlainObject(value)) {
		for (const [k, v] of Object.entries(value)) {
			if (typeof v === "string") out[k] = v;
		}
	}
	return out;
}

/**
 * Normalize one already-nested conversion entry to the current required shape,
 * backfilling enabled, resend, sources, and extras with their defaults. A
 * config saved while sources/extras were Type.Optional can carry an entry that
 * omits them; without this backfill the panel read sites (ConversionCard, the
 * mapping editors, FieldEditor) would dereference an undefined sources/extras
 * and throw on card expand.
 */
function normalizeNestedEntry(value: unknown): ConversionConfig {
	const entry = isPlainObject(value) ? value : {};
	return {
		enabled: typeof entry.enabled === "boolean" ? entry.enabled : false,
		resend: typeof entry.resend === "number" ? entry.resend : 0,
		sources: toStringRecord(entry.sources),
		extras: isPlainObject(entry.extras) ? entry.extras : {},
	};
}

export function migrateLegacyConfig(raw: unknown): Config {
	const flat = flattenConfigEnvelope(raw);
	let migrated: Config;

	if (isPlainObject(flat.conversions)) {
		// Already in the nested shape. Normalize each entry so an on-disk config
		// saved during the Type.Optional era (which could omit sources or extras)
		// still loads with the required {} defaults in place. Spread `flat` first
		// so sibling top-level blocks (notably `advisor`) survive.
		const conversions: Record<string, ConversionConfig> = {};
		for (const [key, value] of Object.entries(flat.conversions)) {
			conversions[key] = normalizeNestedEntry(value);
		}
		migrated = { ...flat, conversions } as Config;
	} else {
		const conversions: Record<string, ConversionConfig> = {};
		let globalResendInterval: number = DEFAULT_GLOBAL_RESEND_SECONDS;

		for (const [key, value] of Object.entries(flat)) {
			if (key === "globalResendInterval") {
				if (typeof value === "number") globalResendInterval = value;
				continue;
			}
			// `advisor` is a settings block, not a conversion: skip it so it is
			// never misread into a bogus conversion entry. It is carried over
			// verbatim below if present.
			if (key === "advisor") continue;
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

		migrated = { globalResendInterval, conversions };
		// Preserve an advisor block that somehow rode in on a pre-conversions
		// config so its settings are not lost on migration.
		if (isPlainObject(flat.advisor)) {
			migrated.advisor = flat.advisor as NonNullable<Config["advisor"]>;
		}
	}

	// The envelope-flatten path can land on a config whose layers never
	// carried a top-level globalResendInterval. Default it so the panel's
	// number input stays controlled.
	if (typeof migrated.globalResendInterval !== "number") {
		migrated.globalResendInterval = DEFAULT_GLOBAL_RESEND_SECONDS;
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
	extras: Record<string, unknown> | undefined,
): Record<string, unknown> {
	// A nested config can carry an ENGINE_STATIC entry with no `extras`: the
	// early-return branch in migrateLegacyConfig passes the config through
	// without backfilling it. Treat a missing or non-object value as empty.
	if (!extras || typeof extras !== "object") return {};
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
