const TWO_PI = Math.PI * 2;

export function isValidNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

export function toValidNumber(value: unknown): number | null {
	return isValidNumber(value) ? value : null;
}

// Modulo-wraps any real angle into [0, 2π); a single-turn shift would corrupt
// inputs outside [-2π, 2π].
export function normalizeAngle(angle: number): number {
	return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

// Truncates a string so it cannot overflow a fixed-width or length-prefixed
// NMEA 2000 string field. canboatjs encodes every PGN into a 500-byte buffer
// and throws past it; that throw is re-raised uncatchably by signalk-server's
// safeApply, so an unclamped field can crash the host process. maxChars counts
// JS code units: marine string fields are ASCII, so this matches byte width.
export function clampString(
	value: string | undefined,
	maxChars: number,
): string | undefined {
	if (value === undefined || value.length <= maxChars) return value;
	return value.slice(0, maxChars);
}
