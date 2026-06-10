// Single source of truth for the panel's API base path and the shared
// JSON-fetch helper. Keep PLUGIN_API_BASE in lockstep with API_PREFIX in
// src/api/router.ts: a divergence would 404 the panel's fetches against
// the live router.
import { errMessage } from "../utils/errorUtils.js";

export const PLUGIN_API_BASE = "/plugins/signalk-nmea2000-emitter-cannon/api";

/**
 * Thrown by fetchJson on a non-2xx response. Carries the HTTP status and, when
 * the server returned a JSON `{ error }` body, that message. The router sends
 * helpful bodies the user needs to see: 403 explains that the action needs an
 * admin session, and 503 means the advisor is not available yet. Throwing a
 * bare "HTTP 403" discarded that guidance, so callers map the status to plain
 * language via friendlyApiError.
 */
export class ApiError extends Error {
	readonly status: number;
	/** The server's `error` field from the JSON body, when it sent one. */
	readonly serverMessage?: string;
	constructor(status: number, serverMessage?: string) {
		super(serverMessage ?? `HTTP ${status}`);
		this.name = "ApiError";
		this.status = status;
		this.serverMessage = serverMessage;
	}
}

/**
 * Fetches `${PLUGIN_API_BASE}${path}` with same-origin credentials and returns
 * the parsed JSON body. On a non-2xx response it reads the server's JSON
 * `{ error }` body (when present) and throws an ApiError carrying both the
 * status and that message; a non-JSON error body falls back to status-only.
 */
export async function fetchJson<T>(
	path: string,
	init?: RequestInit,
): Promise<T> {
	const res = await fetch(`${PLUGIN_API_BASE}${path}`, {
		credentials: "same-origin",
		...init,
	});
	if (!res.ok) {
		throw new ApiError(res.status, await readErrorBody(res));
	}
	return (await res.json()) as T;
}

/**
 * Pulls the server's `error` string out of a non-2xx JSON body. Returns
 * undefined for a non-JSON body (an HTML error page or an empty response) so
 * the status alone carries the meaning.
 */
async function readErrorBody(res: Response): Promise<string | undefined> {
	try {
		const body: unknown = await res.json();
		if (
			typeof body === "object" &&
			body !== null &&
			typeof (body as { error?: unknown }).error === "string"
		) {
			return (body as { error: string }).error;
		}
	} catch {
		// Non-JSON body: nothing to surface beyond the status.
	}
	return undefined;
}

/**
 * Maps a thrown value to plain-language text with a next step. ApiError 403 and
 * 503 get advisor-specific guidance. For 403 the server's own message is
 * preferred when present (the router explains an unsupported server build),
 * falling back to the admin-session next step. 503 always uses the friendly
 * default because the router's 503 bodies ("advisor unavailable", "request
 * failed") carry no next step.
 */
export function friendlyApiError(err: unknown): string {
	if (err instanceof ApiError) {
		if (err.status === 403) {
			return (
				err.serverMessage ??
				"This action needs an admin session. Log in to the Signal K admin UI, then try again."
			);
		}
		if (err.status === 503) {
			return "The Config Advisor is not available yet. Wait for the plugin to finish starting, then try again.";
		}
		return err.serverMessage ?? `Request failed (HTTP ${err.status}).`;
	}
	return errMessage(err);
}
