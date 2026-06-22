import { useCallback, useEffect, useRef, useState } from "react";
import type {
	ConversionMetadata,
	ConversionsResponse,
} from "../../api/types.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson } from "../api-base";

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
	// Matches the sibling fetch hooks (useStatus, useSources): a fetch in flight
	// when the panel unmounts must not setState on a gone component.
	const cancelled = useRef(false);

	const reload = useCallback(() => {
		setMetaLoading(true);
		fetchJson<ConversionsResponse>("/conversions")
			.then((d) => {
				if (cancelled.current) return;
				setMeta(d.conversions);
				setMetaError(null);
			})
			.catch((e) => {
				if (!cancelled.current) setMetaError(errMessage(e));
			})
			.finally(() => {
				if (!cancelled.current) setMetaLoading(false);
			});
	}, []);

	useEffect(() => {
		cancelled.current = false;
		reload();
		return () => {
			cancelled.current = true;
		};
	}, [reload]);

	return { meta, metaError, metaLoading, reload };
}
