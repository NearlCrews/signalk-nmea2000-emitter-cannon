import {
	enumerateActivePaths,
	enumerateSourcesForPath,
} from "../api/discovery.js";
import type { SignalKApp } from "../types/index.js";
import type { PathInventory } from "./types.js";

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
