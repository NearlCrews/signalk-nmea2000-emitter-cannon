import { useCallback, useState } from "react";
import type { AdvisorPendingResponse, AdvisorReviewResponse } from "../../api/types.js";
import type { ApplyDecision, ReviewResult } from "../../recommendation/types.js";
import { fetchJson, friendlyApiError } from "../api-base";

// Advisor-specific 503 wording for friendlyApiError, shared by every advisor
// call site (this hook and the AdvisorSettings probes).
export const ADVISOR_UNAVAILABLE_503 = {
	serviceUnavailable:
		"The Config Advisor is not available yet. Wait for the plugin to finish starting, then try again.",
} as const;

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
	dismissPending: (optionKey: string) => void;
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
			setState((s) => ({
				...s,
				loading: false,
				error: friendlyApiError(err, ADVISOR_UNAVAILABLE_503),
			}));
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
			// Drop only the handled items from the pending list, keeping any
			// others visible. The server's /pending does not drop applied items
			// until the next review, so removing them here stops already-applied
			// rows from re-rendering. When none remain, the result clears.
			setState((s) => {
				if (!s.result) return { result: null, loading: false, error: null };
				const handled = new Set(decisions.map((d) => d.optionKey));
				const pending = s.result.pending.filter((r) => !handled.has(r.optionKey));
				return {
					result: pending.length > 0 ? { ...s.result, pending } : null,
					loading: false,
					error: null,
				};
			});
		} catch (err) {
			setState((s) => ({
				...s,
				loading: false,
				error: friendlyApiError(err, ADVISOR_UNAVAILABLE_503),
			}));
		}
	}, []);

	// Reject: drop one recommendation from the displayed list without any
	// server call, since rejecting makes no config change. It can reappear on
	// the next review, which is correct: the advisor keeps recommending until
	// the underlying state changes.
	const dismissPending = useCallback((optionKey: string) => {
		setState((s) => {
			if (!s.result) return s;
			const pending = s.result.pending.filter((r) => r.optionKey !== optionKey);
			return {
				...s,
				result: pending.length > 0 ? { ...s.result, pending } : null,
			};
		});
	}, []);

	return { state, review, apply, loadPending, dismissPending };
}
