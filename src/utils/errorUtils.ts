// JS lets any value be thrown, so guard `.message` access. Plain objects
// stringify to "[object Object]"; JSON.stringify gives a useful payload when
// possible (cyclic objects throw, fall back to String).
export function errMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (err !== null && typeof err === "object") {
		try {
			return JSON.stringify(err);
		} catch {
			return String(err);
		}
	}
	return String(err);
}
