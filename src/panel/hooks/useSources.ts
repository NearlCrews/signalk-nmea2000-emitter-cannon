import { useCallback, useEffect, useRef, useState } from "react";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson } from "../api-base";

const CACHE_TTL_MS = 30_000;
// Soft cap. The live path count is ~166 today so this header-room would
// only be reached if a long admin session repeatedly typed novel paths
// into the SourceField inputs (each populates `cache.current` on first
// query). Bounding the Map keeps the panel's memory footprint constant
// for that worst case.
const CACHE_MAX_ENTRIES = 256;

// Drop the oldest entry once the Map grows past CACHE_MAX_ENTRIES. JS Maps
// preserve insertion order, so `keys().next().value` is the oldest key
// (callers must delete-then-set on a refresh to keep "oldest" honest).
function evictOldest(cache: Map<string, unknown>): void {
	if (cache.size <= CACHE_MAX_ENTRIES) return;
	const oldest = cache.keys().next().value;
	if (oldest !== undefined) cache.delete(oldest);
}

function sameSources(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const ax = a.slice().sort();
	const bx = b.slice().sort();
	for (let i = 0; i < ax.length; i++) {
		if (ax[i] !== bx[i]) return false;
	}
	return true;
}

export function useSources(): {
	sourcesFor: (path: string) => string[];
	sourceErrorFor: (path: string) => string | null;
	ensureLoaded: (path: string, force?: boolean) => Promise<void>;
} {
	const cache = useRef<Map<string, { ts: number; sources: string[]; error: string | null }>>(
		new Map(),
	);
	const pending = useRef<Map<string, Promise<void>>>(new Map());
	const cancelled = useRef(false);
	const [, force] = useState(0);

	// Set the cancelled flag on unmount so an in-flight fetch resolving after
	// the component is gone does not call setState (React would log a warning).
	useEffect(() => {
		cancelled.current = false;
		return () => {
			cancelled.current = true;
		};
	}, []);

	const ensureLoaded = useCallback(async (path: string, forceRefresh = false): Promise<void> => {
		const hit = cache.current.get(path);
		if (!forceRefresh && hit && Date.now() - hit.ts < CACHE_TTL_MS) return;
		const inflight = pending.current.get(path);
		if (inflight) return inflight;
		const p = (async () => {
			try {
				const body = await fetchJson<{ sources: string[] }>(
					`/sources?path=${encodeURIComponent(path)}`,
				);
				const previous = cache.current.get(path);
				const prev = previous?.sources;
				// Delete first so re-inserting `path` lands at the tail of the
				// insertion order: a refresh of an existing entry should not
				// evict itself on the next overflow.
				cache.current.delete(path);
				cache.current.set(path, { ts: Date.now(), sources: body.sources, error: null });
				evictOldest(cache.current);
				// Skip the re-render when the source list is unchanged: TTL-driven
				// refreshes that return the same content otherwise trigger a
				// pointless re-render of every SourceField that called us.
				if (
					!cancelled.current &&
					(previous === undefined ||
						previous.error !== null ||
						!sameSources(prev ?? [], body.sources))
				) {
					force((n) => n + 1);
				}
			} catch (reason) {
				const previous = cache.current.get(path);
				cache.current.delete(path);
				cache.current.set(path, {
					ts: Date.now(),
					sources: previous?.sources ?? [],
					error: errMessage(reason),
				});
				evictOldest(cache.current);
				if (!cancelled.current) force((n) => n + 1);
			} finally {
				pending.current.delete(path);
			}
		})();
		pending.current.set(path, p);
		return p;
	}, []);

	const sourcesFor = useCallback((path: string) => cache.current.get(path)?.sources ?? [], []);
	const sourceErrorFor = useCallback((path: string) => cache.current.get(path)?.error ?? null, []);

	return { sourcesFor, sourceErrorFor, ensureLoaded };
}
