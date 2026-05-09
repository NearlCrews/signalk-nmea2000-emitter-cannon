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
