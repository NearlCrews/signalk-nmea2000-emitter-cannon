import type { Recommendation } from "./types.js";

export interface OpenRouterConfig {
	apiKey: string;
	model: string;
	baseUrl: string;
}

export interface CompleteArgs {
	system: string;
	user: string;
	/** Optional strict JSON schema for a structured-output response. */
	schema?: { name: string; schema: Record<string, unknown> };
}

const TIMEOUT_MS = 20000;
const MODELS_TIMEOUT_MS = 12000;
const TERMINAL = new Set([400, 401, 402, 403]);
const BACKOFF_MS = [500, 1500, 4000];

export class OpenRouterError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "OpenRouterError";
	}
}

interface ApiResponse {
	choices?: { message?: { content?: string } }[];
	error?: { message?: string };
}

/**
 * Minimal OpenRouter chat-completions client. `fetchImpl` is injectable for
 * tests. Retries transient statuses (429, 5xx) with a bounded backoff;
 * terminal statuses (4xx auth/quota) throw immediately.
 */
export class OpenRouterClient {
	constructor(
		private readonly cfg: OpenRouterConfig,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	/** Run one completion, returning the assistant message text. */
	async complete(args: CompleteArgs): Promise<string> {
		return this.attempt(args, 0);
	}

	private async attempt(args: CompleteArgs, n: number): Promise<string> {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
		try {
			const res = await this.fetchImpl(`${this.cfg.baseUrl}/chat/completions`, {
				method: "POST",
				signal: ctrl.signal,
				headers: {
					Authorization: `Bearer ${this.cfg.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(this.requestBody(args)),
			});
			if (res.status === 200) {
				const body = (await res.json()) as ApiResponse;
				const text = body.choices?.[0]?.message?.content ?? "";
				if (text.trim() === "") {
					throw new OpenRouterError(200, "empty completion");
				}
				return text;
			}
			const body = (await res.json().catch(() => ({}))) as ApiResponse;
			const message = body.error?.message ?? `HTTP ${res.status}`;
			if (TERMINAL.has(res.status)) {
				throw new OpenRouterError(res.status, message);
			}
			return this.retry(args, n, new OpenRouterError(res.status, message));
		} catch (err) {
			if (err instanceof OpenRouterError && TERMINAL.has(err.status)) throw err;
			return this.retry(
				args,
				n,
				err instanceof OpenRouterError
					? err
					: new OpenRouterError(
							0,
							err instanceof Error ? err.message : String(err),
						),
			);
		} finally {
			clearTimeout(timer);
		}
	}

	private async retry(
		args: CompleteArgs,
		n: number,
		err: OpenRouterError,
	): Promise<string> {
		if (n >= BACKOFF_MS.length) throw err;
		await new Promise((r) => setTimeout(r, BACKOFF_MS[n]));
		return this.attempt(args, n + 1);
	}

	private requestBody(args: CompleteArgs): Record<string, unknown> {
		const body: Record<string, unknown> = {
			model: this.cfg.model,
			temperature: 0,
			messages: [
				{ role: "system", content: args.system },
				{ role: "user", content: args.user },
			],
		};
		if (args.schema) {
			body.response_format = {
				type: "json_schema",
				json_schema: {
					name: args.schema.name,
					strict: true,
					schema: args.schema.schema,
				},
			};
			body.provider = { require_parameters: true };
		}
		return body;
	}
}

/**
 * The sorted list of model ids OpenRouter currently serves, from the public
 * `/models` endpoint (no API key required). Used to populate the model-field
 * autocomplete in the panel. Throws on a non-OK response, on a timeout, or
 * on a network error: every failure is a caught error the caller turns into
 * a graceful fallback.
 */
export async function fetchOpenRouterModels(
	baseUrl: string,
	fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), MODELS_TIMEOUT_MS);
	try {
		const res = await fetchImpl(`${baseUrl}/models`, { signal: ctrl.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = (await res.json()) as { data?: { id?: unknown }[] };
		return (body.data ?? [])
			.map((m) => m.id)
			.filter((id): id is string => typeof id === "string")
			.sort();
	} finally {
		clearTimeout(timer);
	}
}

/** Minimal surface enrichRationales needs, so tests can pass a fake. */
export interface Completer {
	complete(args: CompleteArgs): Promise<string>;
}

const RATIONALE_SCHEMA = {
	name: "advisor_rationales",
	schema: {
		type: "object",
		additionalProperties: false,
		required: ["rationales"],
		properties: {
			rationales: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["optionKey", "reason"],
					properties: {
						optionKey: { type: "string" },
						reason: { type: "string" },
					},
				},
			},
		},
	},
} as const;

const SYSTEM_PROMPT =
	"You explain marine NMEA 2000 plugin configuration recommendations to a " +
	"boat owner. For each recommendation you are given, write one short, " +
	"plain-language sentence explaining why it is recommended. Do not change " +
	"which conversions are recommended. Reply only with the requested JSON. " +
	"Background: some environment.* paths come from the companion plugin " +
	"signalk-virtual-weather-sensors, which publishes AccuWeather marine " +
	"forecast data (outside temperature, pressure, humidity, wind, " +
	"visibility) rather than a physical sensor. That data is not on the " +
	"NMEA 2000 bus, so converting those paths is what makes the forecast " +
	"visible on chartplotters.";

/**
 * Ask OpenRouter for a plainer one-line reason per recommendation. Returns a
 * map keyed by optionKey, covering only keys present in `recs` (an invented
 * key is dropped). Any malformed response yields an empty map so the caller
 * keeps the deterministic reasons.
 */
export async function enrichRationales(
	client: Completer,
	recs: Recommendation[],
): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	if (recs.length === 0) return out;

	const allowed = new Set(recs.map((r) => r.optionKey));
	const user = JSON.stringify(
		recs.map((r) => ({
			optionKey: r.optionKey,
			action: r.action,
			matchedPaths: r.matchedPaths,
			currentReason: r.reason,
		})),
	);

	const text = await client.complete({
		system: SYSTEM_PROMPT,
		user,
		schema: RATIONALE_SCHEMA,
	});

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return out;
	}
	const rationales = (parsed as { rationales?: unknown }).rationales;
	if (!Array.isArray(rationales)) return out;

	for (const r of rationales) {
		const optionKey = (r as { optionKey?: unknown }).optionKey;
		const reason = (r as { reason?: unknown }).reason;
		if (
			typeof optionKey === "string" &&
			typeof reason === "string" &&
			reason.trim() !== "" &&
			allowed.has(optionKey)
		) {
			out.set(optionKey, reason);
		}
	}
	return out;
}
