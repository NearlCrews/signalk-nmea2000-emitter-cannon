/**
 * Coerce any thrown value to a string. JavaScript allows non-Error throws,
 * so the `instanceof Error` check before reading `.message` is required;
 * `String(err)` covers strings, numbers, plain objects, etc.
 */
export function errMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
