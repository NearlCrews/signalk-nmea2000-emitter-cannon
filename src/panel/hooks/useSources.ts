import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_TTL_MS = 30_000;

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
	ensureLoaded: (path: string) => Promise<void>;
} {
	const cache = useRef<Map<string, { ts: number; sources: string[] }>>(
		new Map(),
	);
	const pending = useRef<Map<string, Promise<void>>>(new Map());
	const cancelled = useRef(false);
	const [, force] = useState(0);

	// Set the cancelled flag on unmount so an in-flight fetch resolving after
	// the component is gone does not call setState (React would log a warning).
	useEffect(
		() => () => {
			cancelled.current = true;
		},
		[],
	);

	const ensureLoaded = useCallback(async (path: string): Promise<void> => {
		const hit = cache.current.get(path);
		if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return;
		const inflight = pending.current.get(path);
		if (inflight) return inflight;
		const p = (async () => {
			try {
				const r = await fetch(
					`/plugins/signalk-nmea2000-emitter-cannon/api/sources?path=${encodeURIComponent(path)}`,
					{ credentials: "same-origin" },
				);
				const body = (await r.json()) as { sources: string[] };
				const prev = cache.current.get(path)?.sources;
				cache.current.set(path, { ts: Date.now(), sources: body.sources });
				// Skip the re-render when the source list is unchanged: TTL-driven
				// refreshes that return the same content otherwise trigger a
				// pointless re-render of every SourceField that called us.
				if (
					!cancelled.current &&
					(prev === undefined || !sameSources(prev, body.sources))
				) {
					force((n) => n + 1);
				}
			} catch {
				const prev = cache.current.get(path)?.sources;
				cache.current.set(path, { ts: Date.now(), sources: [] });
				if (!cancelled.current && (prev === undefined || prev.length !== 0)) {
					force((n) => n + 1);
				}
			} finally {
				pending.current.delete(path);
			}
		})();
		pending.current.set(path, p);
		return p;
	}, []);

	const sourcesFor = useCallback(
		(path: string) => cache.current.get(path)?.sources ?? [],
		[],
	);

	return { sourcesFor, ensureLoaded };
}
