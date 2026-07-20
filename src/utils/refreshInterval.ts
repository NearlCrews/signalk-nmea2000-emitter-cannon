import { SOURCE_TYPE, STREAM_DEBOUNCE_MS } from "../constants.js";
import type { ConversionModule } from "../types/index.js";

/** Return a usable stream-refresh interval in milliseconds, or undefined. */
export function resolveRefreshInterval(
	conversion: Pick<ConversionModule, "refreshInterval" | "sourceType">,
): number | undefined {
	const sourceType = conversion.sourceType ?? SOURCE_TYPE.ON_VALUE_CHANGE;
	const interval = conversion.refreshInterval;
	return sourceType === SOURCE_TYPE.ON_VALUE_CHANGE &&
		typeof interval === "number" &&
		Number.isFinite(interval) &&
		interval > STREAM_DEBOUNCE_MS
		? interval
		: undefined;
}
