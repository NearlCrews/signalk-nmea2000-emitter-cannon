// Shared NMEA 2000 helpers used by both the conversion registry (to derive
// the PGN 126464 transmit list at module-load time) and the plugin manager
// (to populate `getConversionMetadata()` for the admin panel). Lives in a
// dedicated file rather than pathUtils.ts because pathUtils is about Signal K
// path manipulation; this is N2K-side metadata extraction.

// Module-scope so the regex compiles once. Captures both single-PGN
// ("Wind (PGN 130306)") and multi-PGN ("Battery (PGNs 127506, 127508)")
// title shapes. Five and six digit PGNs both fit \d+: verified against
// raymarineAlarms (65288) and temperature TEMPERATURE2_* (130316).
const PGN_TITLE_REGEX = /PGNs?\s+([\d,\s]+)\)/;

/**
 * Extract the PGN list out of a conversion title. Titles follow either
 * "Name (PGN 130306)" or "Name (PGNs 127506, 127508)". Returns the digit
 * strings; falls back to [] for titles that do not match the pattern so a
 * malformed or non-conforming title does not drop the conversion from any
 * derived list.
 */
export function extractPgnsFromTitle(title: string): string[] {
	const match = title.match(PGN_TITLE_REGEX);
	if (!match || match[1] === undefined) return [];
	return match[1]
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}
