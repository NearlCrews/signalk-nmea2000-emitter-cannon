import { useCallback, useState } from "react";
import type { ApplyDecision, ReviewResult } from "../../advisor/types.js";
import type {
	AdvisorPendingResponse,
	AdvisorReviewResponse,
} from "../../api/types.js";
import { fetchJson, friendlyApiError } from "../api-base";

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
	loadPending: () => Promise<void>;
} {
	const [state, setState] = useState<AdvisorState>({
		result: null,
		loading: false,
		error: null,
	});

	// Seed the parked-decision list from a prior (e.g. scheduled) review so the
	// user can approve items without clicking Review now first. Called once on
	// mount by AdvisorPanel. A disabled advisor answers 503, which fetchJson
	// throws on; that is swallowed so the panel just shows nothing parked.
	const loadPending = useCallback(async () => {
		try {
			const body = await fetchJson<AdvisorPendingResponse>("/advisor/pending");
			const r = body.result;
			if (r.pending.length === 0) return;
			setState((s) => {
				// Do not clobber a review the user already ran or is running.
				if (s.result !== null || s.loading) return s;
				return {
					result: {
						ranAt: r.ranAt ?? "",
						autoApplied: r.autoApplied ?? [],
						pending: r.pending,
						notes: r.notes ?? [],
					},
					loading: false,
					error: null,
				};
			});
		} catch {
			// Advisor disabled (503) or unreachable: stay quiet.
		}
	}, []);

	const review = useCallback(async () => {
		setState((s) => ({ ...s, loading: true, error: null }));
		try {
			const body = await fetchJson<AdvisorReviewResponse>("/advisor/review", {
				method: "POST",
			});
			setState({ result: body.result, loading: false, error: null });
		} catch (err) {
			setState((s) => ({ ...s, loading: false, error: friendlyApiError(err) }));
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
			setState((s) => ({ ...s, loading: false, error: friendlyApiError(err) }));
		}
	}, []);

	return { state, review, apply, loadPending };
}
