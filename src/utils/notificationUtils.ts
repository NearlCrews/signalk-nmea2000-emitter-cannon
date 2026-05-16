// Signal K notification states that mean "no active alert": a delta in one of
// these clears any existing alert and never produces an alert PGN. Any other
// value (including a misspelling from an upstream provider) is an alert.
const CLEAR_STATES: ReadonlySet<string> = new Set(["normal", "nominal"]);

export function isClearState(state: string): boolean {
	return CLEAR_STATES.has(state);
}
