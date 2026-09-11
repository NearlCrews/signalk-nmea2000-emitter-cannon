/**
 * Run an async operation under an abort timeout. Builds one AbortController,
 * arms a timer that aborts it after `ms`, passes the signal to `fn` (wire it
 * into the fetch call so a slow request and its body read are cancelled), and
 * always clears the timer. Used by the advisor's QuestDB client so the
 * controller/timer/clear scaffold lives in one place. Retry and backoff policy
 * stay with each caller.
 *
 * Deliberately NOT a `Promise.race` against a rejecting timer. The loser of a
 * race keeps running, and when the timer arm wins, the request arm rejects
 * later with nobody attached: that is an unhandled rejection. The reusable
 * SignalK plugin-ci workflow fails the build on any unhandled rejection within
 * 1500 ms of `start()` resolving, and the advisor can be armed by `start()`, so
 * a race here would be a build failure as well as a process-level hazard. Keep
 * the abort-and-clear shape.
 */
export async function withTimeout<T>(
	ms: number,
	fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ms);
	try {
		return await fn(ctrl.signal);
	} finally {
		clearTimeout(timer);
	}
}
