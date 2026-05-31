/**
 * Read a per-instance config array (engines, batteries, chargers, tanks, ...)
 * off a factory module's untyped `options`. Returns `[]` unless the keyed value
 * is actually an array, so a malformed-but-truthy config (e.g. an object where
 * an array was expected) can never reach `.map` and throw, which would silently
 * drop the whole conversion. Callers map the result and may return `null` when
 * it is empty to signal "no sub-conversions".
 */
export function instanceList<T>(options: unknown, key: string): T[] {
	const coll =
		options && typeof options === "object"
			? (options as Record<string, unknown>)[key]
			: undefined;
	return Array.isArray(coll) ? (coll as T[]) : [];
}
