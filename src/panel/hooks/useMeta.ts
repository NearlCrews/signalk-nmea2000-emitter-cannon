import { useCallback, useEffect, useState } from "react";
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

	const reload = useCallback(() => {
		setMetaLoading(true);
		fetchJson<ConversionsResponse>("/conversions")
			.then((d) => {
				setMeta(d.conversions);
				setMetaError(null);
			})
			.catch((e) => {
				setMetaError(errMessage(e));
			})
			.finally(() => {
				setMetaLoading(false);
			});
	}, []);

	useEffect(() => {
		reload();
	}, [reload]);

	return { meta, metaError, metaLoading, reload };
}
