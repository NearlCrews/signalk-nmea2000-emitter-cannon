import { enumerateActivePaths, enumerateSourcesForPath } from "../api/discovery.js";
import { classifySourceOrigin, type SourceOrigin } from "../recommendation/busSource.js";
import type { HistoricPaths, PathInventory } from "../recommendation/types.js";
import type { SignalKApp } from "../types/index.js";

/**
 * Internal inventory enrichment consumed by recommender.ts. It intentionally
 * stays structural so the public recommendation types and HTTP payloads do not
 * gain a new compatibility surface.
 */
interface SourceAwareInventoryEntry {
	path: string;
	live: boolean;
	liveSources: string[];
	sourceOrigins: Record<string, SourceOrigin>;
}

/**
 * Snapshot of every Signal K path the local server currently publishes,
 * each tagged with the `$source` labels publishing it. Reuses the existing
 * discovery helpers, so it is sync and cheap.
 */
export function buildLiveInventory(app: SignalKApp): PathInventory {
	const sourceMetadata = app.getPath?.("sources");
	return enumerateActivePaths(app).map((path): SourceAwareInventoryEntry => {
		const liveSources = enumerateSourcesForPath(app, path);
		return {
			path,
			live: true,
			liveSources,
			sourceOrigins: Object.fromEntries(
				liveSources.map((source) => [
					source,
					classifySourceOrigin(source, undefined, sourceMetadata),
				]),
			),
		};
	});
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
