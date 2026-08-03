import { useCallback, useRef, useState } from "react";
import type {
	AdvisorApplyResponse,
	AdvisorPendingResponse,
	AdvisorReviewResponse,
} from "../../api/types.js";
import type {
	ApplyDecision,
	PendingReviewResult,
	ReviewResult,
} from "../../recommendation/types.js";
import { fetchJson, friendlyApiError } from "../api-base";

// Advisor-specific 503 wording for friendlyApiError, shared by every advisor
// call site (this hook and the AdvisorSettings probes).
export const ADVISOR_UNAVAILABLE_503 = {
	serviceUnavailable:
		"The Config Advisor is not available yet. Wait for the plugin to finish starting, then try again.",
} as const;

type AdvisorOperation = "idle" | "reviewing" | "applying";

interface AdvisorState {
	result: ReviewResult | null;
	operation: AdvisorOperation;
	error: string | null;
}

export const ADVISOR_APPLY_NO_CHANGE =
	"No changes applied. The recommendation may be stale, or a competing wind producer may be active. Run Review now and retry.";

function finishAdvisorError(state: AdvisorState, error: unknown): AdvisorState {
	return {
		...state,
		operation: "idle",
		error: friendlyApiError(error, ADVISOR_UNAVAILABLE_503),
	};
}

export function finishAdvisorPendingLoad(
	state: AdvisorState,
	result: PendingReviewResult,
	requestEpoch: number,
	currentEpoch: number,
): AdvisorState {
	if (requestEpoch !== currentEpoch || state.result !== null || state.operation !== "idle") {
		return state;
	}
	if (
		result.ranAt === undefined &&
		result.pending.length === 0 &&
		result.autoApplied.length === 0 &&
		result.notes.length === 0
	) {
		return state;
	}
	return {
		result: {
			ranAt: result.ranAt ?? "",
			autoApplied: result.autoApplied,
			pending: result.pending,
			notes: result.notes,
		},
		operation: "idle",
		error: null,
	};
}

export function finishAdvisorApply(
	state: AdvisorState,
	decisions: ApplyDecision[],
	response: AdvisorApplyResponse,
): AdvisorState {
	const handled = new Set(
		decisions.filter((decision) => decision.approved).map((decision) => decision.optionKey),
	);
	const next: AdvisorState = { ...state, operation: "idle", error: null };
	if (handled.size === 0) return next;
	if (response.applied === 0) {
		next.error = ADVISOR_APPLY_NO_CHANGE;
		return next;
	}
	if (response.applied !== handled.size) {
		next.error = `The Advisor applied ${response.applied} of ${handled.size}. Run Review now to refresh the rest.`;
		return next;
	}
	if (!state.result) return next;

	const pending = state.result.pending.filter(
		(recommendation) => !handled.has(recommendation.optionKey),
	);
	next.result = pending.length > 0 ? { ...state.result, pending } : null;
	return next;
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
		operation: "idle",
		error: null,
	});
	// A pending request starts on mount and can finish after a user-triggered
	// review or apply. Ignore that older snapshot once any newer operation starts.
	const operationEpoch = useRef(0);

	// Seed the parked-decision list from a prior (e.g. scheduled) review so the
	// user can approve items without clicking Review now first. Called once on
	// mount by AdvisorPanel. Preserve the prior run's timestamp, automatic
	// changes, and notes alongside its parked decisions.
	const loadPending = useCallback(async () => {
		const requestEpoch = operationEpoch.current;
		try {
			const body = await fetchJson<AdvisorPendingResponse>("/advisor/pending");
			setState((s) =>
				finishAdvisorPendingLoad(s, body.result, requestEpoch, operationEpoch.current),
			);
		} catch (err) {
			setState((s) => {
				if (operationEpoch.current !== requestEpoch) return s;
				// A slow initial pending request must not cancel or overwrite a
				// review/apply operation (or its result) that started after mount.
				if (s.result !== null || s.operation !== "idle") return s;
				return finishAdvisorError(s, err);
			});
		}
	}, []);

	const review = useCallback(async () => {
		operationEpoch.current++;
		setState((s) => ({ ...s, operation: "reviewing", error: null }));
		try {
			const body = await fetchJson<AdvisorReviewResponse>("/advisor/review", {
				method: "POST",
			});
			setState({ result: body.result, operation: "idle", error: null });
		} catch (err) {
			setState((s) => finishAdvisorError(s, err));
		}
	}, []);

	const apply = useCallback(async (decisions: ApplyDecision[]) => {
		operationEpoch.current++;
		setState((s) => ({ ...s, operation: "applying", error: null }));
		try {
			const response = await fetchJson<AdvisorApplyResponse>("/advisor/apply", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ decisions }),
			});
			// Dismiss only a fully applied request. A zero or partial count means
			// at least one recommendation was stale, invalid, or wind-conflicted,
			// so keep the rows visible and give the user a next step.
			setState((s) => finishAdvisorApply(s, decisions, response));
		} catch (err) {
			setState((s) => finishAdvisorError(s, err));
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
