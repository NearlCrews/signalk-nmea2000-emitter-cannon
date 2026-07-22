import { SOURCE_TYPE } from "../constants.js";
import type { ConversionModule, ConversionOptions, SubConversionModule } from "../types/index.js";
import { extractPgnsFromTitle } from "../utils/pgnUtils.js";
import { resolveRefreshInterval } from "../utils/refreshInterval.js";
import {
	compatibilityFor,
	descriptionFor,
	lifecycleFor,
	metaFor,
	purposeFor,
} from "./extras-meta.js";
import type { ConversionMetadata } from "./types.js";

export type ConversionOptionsByKey = Readonly<Record<string, ConversionOptions | undefined>>;

function keysFor(
	conversion: Pick<ConversionModule, "keys"> | Pick<SubConversionModule, "keys">,
	options: ConversionOptions | undefined,
): string[] {
	if (Array.isArray(conversion.keys)) return [...conversion.keys];
	if (typeof conversion.keys === "function" && options !== undefined) {
		return conversion.keys(options);
	}
	return [];
}

/**
 * Resolve the Signal K paths declared by a conversion for one concrete option
 * set. Factory conversions are expanded exactly as runtime expands them, then
 * only their declared `keys` are collected. No paths are inferred from option
 * names, and callbacks are never invoked.
 */
export function resolveConfiguredPaths(
	conversion: ConversionModule,
	options?: ConversionOptions,
): string[] {
	const paths = keysFor(conversion, options);
	const rawSubConversions = conversion.conversions;

	let subConversions: SubConversionModule[] | null | undefined;
	if (Array.isArray(rawSubConversions)) {
		subConversions = rawSubConversions;
	} else if (typeof rawSubConversions === "function" && options !== undefined) {
		subConversions = rawSubConversions(options);
	}

	if (subConversions) {
		for (const subConversion of subConversions) {
			paths.push(...keysFor(subConversion, options));
		}
	}

	return [...new Set(paths)];
}

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
export function buildConversionMetadata(
	conversions: ConversionModule[],
	optionsByKey: ConversionOptionsByKey = {},
): ConversionMetadata[] {
	return conversions.map((c) => {
		const configuredOptions = optionsByKey[c.optionKey];
		const entry: ConversionMetadata = {
			key: c.optionKey,
			title: c.title,
			canResend:
				c.allowResend !== false &&
				resolveRefreshInterval(c) === undefined &&
				c.sourceType !== SOURCE_TYPE.TIMER &&
				c.sourceType !== SOURCE_TYPE.ON_DELTA,
			pgns: extractPgnsFromTitle(c.title),
			category: c.category,
			presets: c.presets ?? [],
			paths: resolveConfiguredPaths(c, configuredOptions),
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
