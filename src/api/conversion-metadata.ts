import { SOURCE_TYPE } from "../constants.js";
import type { ConversionModule } from "../types/index.js";
import { extractPgnsFromTitle } from "../utils/pgnUtils.js";
import {
	compatibilityFor,
	descriptionFor,
	lifecycleFor,
	metaFor,
	purposeFor,
} from "./extras-meta.js";
import type { ConversionMetadata } from "./types.js";

/**
 * Builds the panel's conversion catalog from a list of conversion modules.
 *
 * The catalog is pure module metadata (title, PGNs, category, paths, presets,
 * extras shape) and carries no runtime state, so it can be produced without a
 * started PluginManager. That lets the config panel show and configure
 * conversions BEFORE the plugin's first enable: signalk-server mounts
 * `registerWithRouter` for a disabled plugin but never calls `start()`, so the
 * live manager is null until the user enables. PluginManager.getConversionMetadata
 * delegates here for the running case; index.ts builds a standalone catalog for
 * the disabled case.
 */
export function buildConversionMetadata(conversions: ConversionModule[]): ConversionMetadata[] {
	return conversions.map((c) => {
		const entry: ConversionMetadata = {
			key: c.optionKey,
			title: c.title,
			canResend:
				c.allowResend !== false &&
				c.sourceType !== SOURCE_TYPE.TIMER &&
				c.sourceType !== SOURCE_TYPE.ON_DELTA,
			pgns: extractPgnsFromTitle(c.title),
			category: c.category,
			presets: c.presets ?? [],
			paths: typeof c.keys === "function" ? [] : (c.keys ?? []),
			extras: metaFor(c),
		};
		const description = descriptionFor(c.optionKey);
		if (description !== undefined) {
			entry.description = description;
		}
		const purpose = purposeFor(c.optionKey);
		if (purpose !== undefined) {
			entry.purpose = purpose;
		}
		const compatibility = compatibilityFor(c.optionKey);
		if (compatibility !== undefined) {
			entry.compatibility = compatibility;
		}
		const legacy = lifecycleFor(c.optionKey);
		if (legacy !== undefined) {
			entry.legacy = legacy;
		}
		return entry;
	});
}
