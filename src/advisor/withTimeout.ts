/**
 * Run an async operation under an abort timeout. Builds one AbortController,
 * arms a timer that aborts it after `ms`, passes the signal to `fn` (wire it
 * into the fetch call so a slow request and its body read are cancelled), and
 * always clears the timer. Used by the advisor's QuestDB client so the
 * controller/timer/clear scaffold lives in one place. Retry and backoff policy
 * stay with each caller.
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
