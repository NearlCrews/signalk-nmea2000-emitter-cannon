import { useEffect, useRef, useState } from "react";
import type { StatusSnapshot } from "../../api/types.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson } from "../api-base";

const POLL_MS = 3000;

export function useStatus(): {
	status: StatusSnapshot | null;
	error: string | null;
	// Wall-clock timestamp (ms) of the last successful poll, or null before the
	// first success. Lets the dashboard show a staleness marker when polling
	// stalls.
	lastUpdatedMs: number | null;
} {
	const [status, setStatus] = useState<StatusSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
	const cancelled = useRef(false);

	useEffect(() => {
		cancelled.current = false;

		async function tick(): Promise<void> {
			try {
				const body = await fetchJson<StatusSnapshot>("/status");
				if (!cancelled.current) {
					setStatus(body);
					setError(null);
					setLastUpdatedMs(Date.now());
				}
			} catch (e) {
				if (!cancelled.current) setError(errMessage(e));
			}
		}

		void tick();
		const id = setInterval(() => {
			if (document.visibilityState === "visible") void tick();
		}, POLL_MS);

		const onVisibility = (): void => {
			if (document.visibilityState === "visible") void tick();
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			cancelled.current = true;
			clearInterval(id);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, []);

	return { status, error, lastUpdatedMs };
}
