import type { ConversionMetadata } from "../api/types.js";
import type { ConversionMap } from "../config/schema.js";

/** Show first-run guidance only after the catalog loads with no enabled entry. */
export function shouldShowFirstRunCallout(
	catalog: ReadonlyArray<Pick<ConversionMetadata, "key">>,
	conversions: ConversionMap,
): boolean {
	return (
		catalog.length > 0 &&
		!catalog.some((conversion) => conversions[conversion.key]?.enabled === true)
	);
}
