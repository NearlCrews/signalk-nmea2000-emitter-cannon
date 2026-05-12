import { useCallback, useRef, useState } from "react";

const CACHE_TTL_MS = 30_000;

export function useSources(): {
	sourcesFor: (path: string) => string[];
	ensureLoaded: (path: string) => Promise<void>;
} {
	const cache = useRef<Map<string, { ts: number; sources: string[] }>>(
		new Map(),
	);
	const [, force] = useState(0);

	const ensureLoaded = useCallback(async (path: string) => {
		const hit = cache.current.get(path);
		if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return;
		try {
			const r = await fetch(
				`/plugins/signalk-nmea2000-emitter-cannon/api/sources?path=${encodeURIComponent(path)}`,
				{ credentials: "same-origin" },
			);
			const body = (await r.json()) as { sources: string[] };
			cache.current.set(path, { ts: Date.now(), sources: body.sources });
			force((n) => n + 1);
		} catch {
			cache.current.set(path, { ts: Date.now(), sources: [] });
			force((n) => n + 1);
		}
	}, []);

	const sourcesFor = useCallback(
		(path: string) => cache.current.get(path)?.sources ?? [],
		[],
	);

	return { sourcesFor, ensureLoaded };
}
