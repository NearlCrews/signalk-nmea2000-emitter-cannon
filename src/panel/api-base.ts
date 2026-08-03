// Single source of truth for the panel's API base path and shared JSON-fetch
// helper. Route suffixes must match the handlers in src/api/router.ts.
import { errMessage } from "../utils/errorUtils.js";
import { isPlainObject } from "../utils/validation.js";

const PLUGIN_API_BASE = "/plugins/signalk-nmea2000-emitter-cannon/api";

/**
 * Thrown by fetchJson on a non-2xx response. Carries the HTTP status and, when
 * the server returned a JSON `{ error }` body, that message. The router sends
 * helpful bodies the user needs to see, such as a 503 while the advisor is not
 * available yet. Callers map the status to plain language via
 * friendlyApiError.
 */
class ApiError extends Error {
	readonly status: number;
	/** The server's `error` field from the JSON body, when it sent one. */
	readonly serverMessage: string | undefined;
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
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${PLUGIN_API_BASE}${path}`, {
		credentials: "same-origin",
		...init,
	});
	if (!res.ok) {
		throw new ApiError(res.status, await readErrorBody(res));
	}
	return (await res.json()) as T;
}

/** True when a fetch failed because its AbortSignal was cancelled. */
export function isAbortError(err: unknown): boolean {
	return typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";
}

/**
 * Pulls the server's `error` string out of a non-2xx JSON body. Returns
 * undefined for a non-JSON body (an HTML error page or an empty response) so
 * the status alone carries the meaning.
 */
async function readErrorBody(res: Response): Promise<string | undefined> {
	try {
		const body: unknown = await res.json();
		if (isPlainObject(body) && typeof body.error === "string") {
			return body.error;
		}
	} catch {
		// Non-JSON body: nothing to surface beyond the status.
	}
	return undefined;
}

/**
 * Maps a thrown value to plain-language text with a next step. For 403 the
 * server's own message is preferred when present (the router explains an
 * unsupported server build), falling back to the admin-session next step. 503
 * always uses the friendly `serviceUnavailable` text because a 503 means the
 * feature is not currently wired; feature-specific call sites pass their own
 * wording. Operation failures use other status codes and preserve the router's
 * safe, actionable message.
 */
export function friendlyApiError(err: unknown, options?: { serviceUnavailable?: string }): string {
	if (err instanceof ApiError) {
		if (err.status === 403) {
			return (
				err.serverMessage ??
				"This action needs an admin session. Log in to the Signal K admin UI, then try again."
			);
		}
		if (err.status === 503) {
			return (
				options?.serviceUnavailable ??
				"This feature is not available yet. Wait for the plugin to finish starting, then try again."
			);
		}
		return err.serverMessage ?? `Request failed (HTTP ${err.status}).`;
	}
	return errMessage(err);
}
