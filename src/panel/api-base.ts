// Single source of truth for the panel's API base path and the shared
// JSON-fetch helper. Keep PLUGIN_API_BASE in lockstep with API_PREFIX in
// src/api/router.ts: a divergence would 404 the panel's fetches against
// the live router.
export const PLUGIN_API_BASE = "/plugins/signalk-nmea2000-emitter-cannon/api";

// Fetches `${PLUGIN_API_BASE}${path}` with same-origin credentials, throws
// on a non-2xx response, and returns the parsed JSON body.
export async function fetchJson<T>(
	path: string,
	init?: RequestInit,
): Promise<T> {
	const res = await fetch(`${PLUGIN_API_BASE}${path}`, {
		credentials: "same-origin",
		...init,
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return (await res.json()) as T;
}
