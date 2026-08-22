import type { ConversionOptions, PluginOptions } from "../types/index.js";
import { migrateLegacyConfig } from "./migrate.js";
import type { Config } from "./schema.js";

/** Flatten typed per-conversion config onto the runtime conversion option shape. */
export function conversionOptionsByKey(
	config: Pick<Config, "conversions">,
): Record<string, ConversionOptions> {
	const conversions: Record<string, ConversionOptions> = {};
	for (const [key, value] of Object.entries(config.conversions)) {
		// Spread the user-controlled maps first: a source or extras key literally
		// named "enabled" or "resend" must not be able to override the runtime
		// flags that decide whether the conversion runs at all.
		conversions[key] = {
			...value.sources,
			...value.extras,
			enabled: value.enabled,
			resend: value.resend,
		};
	}
	return conversions;
}

/** Migrate a saved config and prepare the complete runtime option envelope. */
export function buildPluginOptions(rawOptions: unknown): PluginOptions {
	const migrated = migrateLegacyConfig(rawOptions);
	return {
		globalResendInterval: migrated.globalResendInterval,
		conversions: conversionOptionsByKey(migrated),
	};
}
