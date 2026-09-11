/**
 * Element ids for one conversion row. A jump from the validation banner or
 * from the status view has to reach a row it is not rendering itself, so the
 * wrapper and the row's disclosure toggle both carry names the jump can
 * resolve directly instead of searching the DOM for them.
 */

/** The row wrapper, which a jump scrolls into view. */
export function conversionRowId(key: string): string {
	return `skn-row-${key}`;
}

/**
 * The row's disclosure toggle. `useDisclosure` derives it from the same value
 * passed as `idPrefix`, so the two can never drift apart.
 */
export function conversionRowToggleId(key: string): string {
	return `${conversionRowId(key)}-trigger`;
}
