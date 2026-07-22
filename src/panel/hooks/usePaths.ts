import { useCallback, useEffect, useRef, useState } from "react";
import type { PathsResponse } from "../../api/types.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson, isAbortError } from "../api-base";

const PATH_INVENTORY_POLL_MS = 30_000;

/** Load the Signal K server path inventory used for mapping discovery. */
export function usePaths(): {
	paths: string[];
	loading: boolean;
	error: string | null;
	reload: () => void;
} {
	const [paths, setPaths] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const controller = useRef<AbortController | null>(null);

	const reload = useCallback(() => {
		controller.current?.abort();
		const next = new AbortController();
		controller.current = next;
		setLoading(true);
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
				}
			});
	}, []);

	useEffect(() => {
		reload();
		const interval = window.setInterval(reload, PATH_INVENTORY_POLL_MS);
		return () => {
			window.clearInterval(interval);
			controller.current?.abort();
			controller.current = null;
		};
	}, [reload]);

	return { paths, loading, error, reload };
}
