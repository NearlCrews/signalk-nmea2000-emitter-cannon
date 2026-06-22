import type { SignalKApp } from "../types/index.js";

export function pathToPropName(path: string): string {
	return path.replace(/\./g, "");
}

export function isDefined<T>(value: T | undefined): value is T {
	return typeof value !== "undefined";
}

export function getSelfValue(app: SignalKApp, path: string): unknown {
	return (app.getSelfPath(path) as { value?: unknown } | undefined)?.value;
}

/**
 * Strip the `[N]` sub-conversion suffix from an option key
 * (`BATTERY[0]` -> `BATTERY`). Returns the key unchanged when there is no
 * suffix (the single-PGN path: no substring allocation).
 */
export function stripSubIndex(key: string): string {
	const bracket = key.indexOf("[");
	return bracket === -1 ? key : key.substring(0, bracket);
}

/**
 * Build the `[N]` sub-conversion option key (`BATTERY` + 0 -> `BATTERY[0]`).
 * Inverse of stripSubIndex; kept beside it so the suffix format lives in one
 * place and the writer and the stripper cannot drift.
 */
export function subIndexKey(parent: string, idx: number): string {
	return `${parent}[${idx}]`;
}

// First-prefix-match lookup. Iterates `table` in order and returns the value
// paired with the first prefix that `path.startsWith`. List longer/more
// specific prefixes earlier to control precedence.
export function matchPathPrefix<T>(
	path: string,
	table: ReadonlyArray<readonly [prefix: string, value: T]>,
): T | undefined {
	for (const [prefix, value] of table) {
		if (path.startsWith(prefix)) return value;
	}
	return undefined;
}
