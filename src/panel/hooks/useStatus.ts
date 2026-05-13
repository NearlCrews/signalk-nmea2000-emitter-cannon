import { useEffect, useRef, useState } from "react";
import type { StatusSnapshot } from "../../api/types.js";
import { PLUGIN_API_BASE } from "../api-base";

const URL = `${PLUGIN_API_BASE}/status`;
const POLL_MS = 3000;

export function useStatus(): {
	status: StatusSnapshot | null;
	error: string | null;
} {
	const [status, setStatus] = useState<StatusSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	const cancelled = useRef(false);

	useEffect(() => {
		cancelled.current = false;

		async function tick(): Promise<void> {
			try {
				const r = await fetch(URL, { credentials: "same-origin" });
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				const body = (await r.json()) as StatusSnapshot;
				if (!cancelled.current) {
					setStatus(body);
					setError(null);
				}
			} catch (e) {
				if (!cancelled.current) setError(String(e));
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

	return { status, error };
}
