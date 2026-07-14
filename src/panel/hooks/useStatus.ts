import { useEffect, useState } from "react";
import type { StatusSnapshot } from "../../api/types.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson, isAbortError } from "../api-base";

const POLL_MS = 3000;
const REQUEST_TIMEOUT_MS = 10000;

export function useStatus(): {
	status: StatusSnapshot | null;
	error: string | null;
	// Wall-clock timestamp (ms) of the last successful poll, or null before the
	// first success. Lets the dashboard show a staleness marker when polling
	// stalls.
	lastUpdatedMs: number | null;
	// Wall-clock timestamp (ms) of the most recent completed poll. This also
	// advances after repeated failures so staleness text keeps counting up.
	lastAttemptMs: number | null;
} {
	const [status, setStatus] = useState<StatusSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
	const [lastAttemptMs, setLastAttemptMs] = useState<number | null>(null);

	useEffect(() => {
		let cancelled = false;
		let controller: AbortController | null = null;
		let timeout: ReturnType<typeof setTimeout> | null = null;
		let inFlight = false;
		let runAgain = false;

		const clearPollTimer = (): void => {
			if (timeout === null) return;
			clearTimeout(timeout);
			timeout = null;
		};

		const schedule = (): void => {
			clearPollTimer();
			if (cancelled || document.visibilityState !== "visible") return;
			timeout = setTimeout(() => void tick(), POLL_MS);
		};

		async function tick(): Promise<void> {
			if (cancelled || document.visibilityState !== "visible") return;
			if (inFlight) {
				runAgain = true;
				return;
			}
			clearPollTimer();
			inFlight = true;
			const requestController = new AbortController();
			controller = requestController;
			let timedOut = false;
			const requestTimeout = setTimeout(() => {
				timedOut = true;
				requestController.abort();
			}, REQUEST_TIMEOUT_MS);
			try {
				const body = await fetchJson<StatusSnapshot>("/status", {
					signal: requestController.signal,
				});
				if (!cancelled) {
					setStatus(body);
					setError(null);
					setLastUpdatedMs(Date.now());
				}
			} catch (e) {
				if (!cancelled && timedOut) {
					setError(
						`Status request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`,
					);
				} else if (!cancelled && !isAbortError(e)) {
					setError(errMessage(e));
				}
			} finally {
				clearTimeout(requestTimeout);
				inFlight = false;
				if (controller === requestController) controller = null;
				if (!cancelled) {
					if (document.visibilityState === "visible") {
						setLastAttemptMs(Date.now());
					}
					if (runAgain && document.visibilityState === "visible") {
						runAgain = false;
						void tick();
					} else {
						schedule();
					}
				}
			}
		}

		void tick();

		const onVisibility = (): void => {
			if (document.visibilityState === "visible") {
				void tick();
				return;
			}
			runAgain = false;
			clearPollTimer();
			controller?.abort();
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			cancelled = true;
			clearPollTimer();
			controller?.abort();
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, []);

	return { status, error, lastUpdatedMs, lastAttemptMs };
}
