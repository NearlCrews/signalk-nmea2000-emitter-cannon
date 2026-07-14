import { useCallback, useEffect, useRef, useState } from "react";
import type {
	ConversionMetadata,
	ConversionsResponse,
} from "../../api/types.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson, isAbortError } from "../api-base";

/**
 * Loads the conversion catalog from `/api/conversions`. Mirrors the other
 * panel fetch hooks (useStatus, useSources, useAdvisor): owns its own loading
 * and error state and exposes `reload` for the retry button.
 */
export function useMeta(): {
	meta: ConversionMetadata[];
	metaError: string | null;
	metaLoading: boolean;
	reload: () => void;
} {
	const [meta, setMeta] = useState<ConversionMetadata[]>([]);
	const [metaError, setMetaError] = useState<string | null>(null);
	const [metaLoading, setMetaLoading] = useState(true);
	const requestId = useRef(0);
	const controller = useRef<AbortController | null>(null);

	const reload = useCallback(() => {
		const id = ++requestId.current;
		controller.current?.abort();
		const nextController = new AbortController();
		controller.current = nextController;
		setMetaLoading(true);
		fetchJson<ConversionsResponse>("/conversions", {
			signal: nextController.signal,
		})
			.then((d) => {
				if (id !== requestId.current) return;
				setMeta(d.conversions);
				setMetaError(null);
			})
			.catch((e) => {
				if (id === requestId.current && !isAbortError(e)) {
					setMetaError(errMessage(e));
				}
			})
			.finally(() => {
				if (id !== requestId.current) return;
				controller.current = null;
				setMetaLoading(false);
			});
	}, []);

	useEffect(() => {
		reload();
		return () => {
			requestId.current++;
			controller.current?.abort();
			controller.current = null;
		};
	}, [reload]);

	return { meta, metaError, metaLoading, reload };
}
