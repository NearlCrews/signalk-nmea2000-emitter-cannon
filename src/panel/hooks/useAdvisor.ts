import { useCallback, useState } from "react";
import type { ApplyDecision, ReviewResult } from "../../advisor/types.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson, PLUGIN_API_BASE } from "../api-base";

const BASE = `${PLUGIN_API_BASE}/advisor`;

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
			const body = await fetchJson<{ result: ReviewResult }>(
				"/advisor/review",
				{ method: "POST" },
			);
			setState({ result: body.result, loading: false, error: null });
		} catch (err) {
			setState((s) => ({ ...s, loading: false, error: errMessage(err) }));
		}
	}, []);

	const apply = useCallback(async (decisions: ApplyDecision[]) => {
		setState((s) => ({ ...s, loading: true, error: null }));
		try {
			const res = await fetch(`${BASE}/apply`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ decisions }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
		} catch (err) {
			setState((s) => ({ ...s, error: errMessage(err) }));
		} finally {
			setState((s) => ({ ...s, loading: false }));
		}
	}, []);

	return { state, review, apply };
}
