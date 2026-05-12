import type { Path } from "@signalk/server-api";
import type { SignalKApp } from "../types/index.js";

/**
 * Sorted unique list of Signal K paths the local server currently publishes.
 * Empty when the streambundle exposes no active publishers.
 */
export function enumerateActivePaths(app: SignalKApp): string[] {
	const raw = app.streambundle?.getAvailablePaths?.() ?? [];
	const set = new Set<string>();
	for (const p of raw) set.add(String(p));
	return [...set].sort();
}

/**
 * Source labels under which the given path has been published. Read from the
 * Signal K full-format model at `vessels.self.<path>`: a single-source node
 * exposes its publisher via `$source`, and a multi-source node additionally
 * exposes each contributor as a key under `values`. The `/sources` tree is
 * device metadata (PGN lists, manufacturer codes, canName, etc.), not a
 * path-rooted tree, so it cannot answer this question. This call is sync and
 * cheap: one `getPath` lookup plus a small `Object.keys`.
 */
export function enumerateSourcesForPath(
	app: SignalKApp,
	path: string,
): string[] {
	if (!path) return [];
	const node = app.getPath?.(`vessels.self.${path}` as Path);
	if (!node || typeof node !== "object") return [];
	const out = new Set<string>();
	const single = (node as { $source?: unknown }).$source;
	if (typeof single === "string" && single.length > 0) out.add(single);
	const values = (node as { values?: unknown }).values;
	if (values && typeof values === "object" && !Array.isArray(values)) {
		for (const k of Object.keys(values as Record<string, unknown>)) {
			if (k.length > 0) out.add(k);
		}
	}
	return [...out].sort();
}
