import { useCallback, useEffect, useRef, useState } from "react";
import type { PathsResponse } from "../../api/types.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson, isAbortError } from "../api-base";

const PATH_INVENTORY_POLL_MS = 30_000;

/**
 * Load the Signal K server path inventory used for mapping discovery.
 *
 * `loading` covers the first fetch only and `refreshing` only a reload the
 * user asked for, so the background poll neither marks the Refresh button busy
 * nor changes the status text twice a minute for a user who did nothing.
 */
export function usePaths(): {
	paths: string[];
	loading: boolean;
	refreshing: boolean;
	error: string | null;
	reload: () => void;
} {
	const [paths, setPaths] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const controller = useRef<AbortController | null>(null);

	const load = useCallback((userRequested: boolean) => {
		controller.current?.abort();
		const next = new AbortController();
		controller.current = next;
		if (userRequested) setRefreshing(true);
		fetchJson<PathsResponse>("/paths", { signal: next.signal })
			.then((response) => {
				setPaths(response.paths);
				setError(null);
			})
			.catch((reason) => {
				if (!isAbortError(reason)) setError(errMessage(reason));
			})
			.finally(() => {
				if (controller.current === next) {
					controller.current = null;
					setLoading(false);
					setRefreshing(false);
				}
			});
	}, []);

	const reload = useCallback(() => load(true), [load]);

	useEffect(() => {
		load(false);
		const interval = window.setInterval(() => load(false), PATH_INVENTORY_POLL_MS);
		return () => {
			window.clearInterval(interval);
			controller.current?.abort();
			controller.current = null;
		};
	}, [load]);

	return { paths, loading, refreshing, error, reload };
}
