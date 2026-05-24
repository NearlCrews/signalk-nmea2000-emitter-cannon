import { isValidNumber } from "./validation.js";

/**
 * Parse a Signal K MMSI string into the numeric User ID expected by
 * canboatjs AIS PGNs. canboat treats 0 as "unknown source", which is
 * a safer default than broadcasting a fixed fake MMSI on the wire.
 */
export function parseMmsi(mmsi: unknown): number {
	if (typeof mmsi !== "string") return 0;
	const n = Number.parseInt(mmsi, 10);
	return isValidNumber(n) ? n : 0;
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
