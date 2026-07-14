import type { ConversionConfig } from "./schema.js";

/** A fresh disabled conversion entry with empty sources and extras. */
export function emptyConversionConfig(): ConversionConfig {
	return { enabled: false, resend: 0, sources: {}, extras: {} };
}
