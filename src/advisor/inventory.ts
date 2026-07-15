import { enumerateActivePaths, enumerateSourcesForPath } from "../api/discovery.js";
import type { HistoricPaths, PathInventory } from "../recommendation/types.js";
import type { SignalKApp } from "../types/index.js";

/**
 * Snapshot of every Signal K path the local server currently publishes,
 * each tagged with the `$source` labels publishing it. Reuses the existing
 * discovery helpers, so it is sync and cheap.
 */
export function buildLiveInventory(app: SignalKApp): PathInventory {
	return enumerateActivePaths(app).map((path) => ({
		path,
		live: true,
		liveSources: enumerateSourcesForPath(app, path),
	}));
}

/**
 * Fold QuestDB history into a live inventory: a live path gains its
 * `historic` stats, and a path seen only in history is appended as a
 * non-live entry. The result is sorted by path for stable output.
 */
export function mergeHistoric(live: PathInventory, historic: HistoricPaths): PathInventory {
	const byPath = new Map(live.map((e) => [e.path, { ...e }]));
	for (const [path, stats] of historic) {
		const existing = byPath.get(path);
		if (existing) {
			existing.historic = stats;
		} else {
			byPath.set(path, { path, live: false, liveSources: [], historic: stats });
		}
	}
	return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
