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
