import { isValidNumber } from "./validation.js";

/** SK `design.aisShipType` shape: a numeric SHIP_TYPE id with a display name. */
export interface AisShipType {
	id?: number;
	name?: string;
}

/**
 * Distance from the starboard side: half-beam plus the offset from centerline.
 * Returns undefined unless both inputs are valid numbers (canboat omits the
 * field for undefined). Shared by PGN 129041/129794 (ais) and the own-vessel
 * static report (aisExtended).
 */
export function starboardOffset(
	beam: number | null | undefined,
	fromCenter: number | null | undefined,
): number | undefined {
	return isValidNumber(beam) && isValidNumber(fromCenter) ? beam / 2 + fromCenter : undefined;
}

/**
 * Parse a Signal K MMSI string into the numeric User ID expected by
 * canboatjs AIS PGNs. Reject partial parses and values outside canboat's
 * encodable AIS User ID range so malformed contacts are not broadcast.
 */
export function parseMmsi(mmsi: unknown): number | undefined {
	if (typeof mmsi !== "string" || !/^\d{9}$/.test(mmsi)) return undefined;
	const n = Number(mmsi);
	return n >= 2_000_000 && n <= 999_999_999 ? n : undefined;
}

/**
 * Encode a nine-digit MMSI as the five decimal-symbol bytes carried by DSC.
 * DSC appends a trailing zero, then stores each decimal pair as one byte.
 */
export function encodeDscMmsi(mmsi: unknown): Buffer | undefined {
	const parsed = parseMmsi(mmsi);
	if (parsed === undefined) return undefined;
	const symbols = `${mmsi}0`;
	return Buffer.from(
		Array.from({ length: 5 }, (_, index) => Number(symbols.slice(index * 2, index * 2 + 2))),
	);
}

/**
 * Parse a Signal K `registrations.imo` value (e.g. "IMO9074729" or "9074729")
 * into the bare integer the PGN 129794 imoNumber field expects. Strips any
 * non-digits (the "IMO" prefix), and returns undefined for missing, empty, or
 * zero input so the field stays unset.
 */
export function parseImo(raw: unknown): number | undefined {
	if (typeof raw !== "string") return undefined;
	const digits = raw.replace(/\D/g, "");
	if (digits.length === 0) return undefined;
	const n = Number(digits);
	return n > 0 ? n : undefined;
}

// AIS string field widths. canboatjs writes STRING_FIX values with no length
// check, so a value relayed from another vessel must be clamped to its field
// width before it reaches the encoder; see clampString.
export const AIS_NAME_CHARS = 20;
export const AIS_CALLSIGN_CHARS = 7;
export const AIS_DESTINATION_CHARS = 20;
export const AIS_SAFETY_TEXT_CHARS = 161;
// PGN 129041 AtoN Name is a STRING_LAU but canboatjs's toPgn writer hardcodes
// an 18-character cap for this specific field. Clamping in the plugin to the
// same value keeps our pre-encode width authoritative and means we never feed
// the encoder a value it would silently truncate.
export const ATON_NAME_CHARS = 18;
