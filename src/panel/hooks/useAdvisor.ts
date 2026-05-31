import { useCallback, useState } from "react";
import type { ApplyDecision, ReviewResult } from "../../advisor/types.js";
import type { AdvisorReviewResponse } from "../../api/types.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson } from "../api-base";

interface AdvisorState {
	result: ReviewResult | null;
	loading: boolean;
	error: string | null;
}

/** Owns the review/apply HTTP calls for the AdvisorPanel. */
export function useAdvisor(): {
	state: AdvisorState;
	review: () => Promise<void>;
	apply: (decisions: ApplyDecision[]) => Promise<void>;
} {
	const [state, setState] = useState<AdvisorState>({
		result: null,
		loading: false,
		error: null,
	});

	const review = useCallback(async () => {
		setState((s) => ({ ...s, loading: true, error: null }));
		try {
			const body = await fetchJson<AdvisorReviewResponse>("/advisor/review", {
				method: "POST",
			});
			setState({ result: body.result, loading: false, error: null });
		} catch (err) {
			setState((s) => ({ ...s, loading: false, error: errMessage(err) }));
		}
	}, []);

	const apply = useCallback(async (decisions: ApplyDecision[]) => {
		setState((s) => ({ ...s, loading: true, error: null }));
		try {
			await fetchJson<unknown>("/advisor/apply", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ decisions }),
			});
			// Clear the result on success: the applied items are now live, and
			// the server's /pending list does not drop them until the next
			// review, so reusing the old result would re-render already-applied
			// rows and let the user re-apply them.
			setState({ result: null, loading: false, error: null });
		} catch (err) {
			setState((s) => ({ ...s, loading: false, error: errMessage(err) }));
		}
	}, []);

	return { state, review, apply };
}
