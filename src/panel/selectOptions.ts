/**
 * Shared policy for the panel's selects: never silently rewrite a persisted
 * value the option list no longer offers. Each select keeps the stored value
 * as its own option so the user sees what is saved and chooses what replaces
 * it, and every select says so the same way.
 */

/** True when the list offers this value. */
export function isKnownOption(value: string, optionValues: readonly string[]): boolean {
	return optionValues.includes(value);
}

/** Label for the stored value's own option when the list does not offer it. */
export function unknownOptionLabel(value: string): string {
	return `${value || "Empty value"} (not a known option)`;
}
