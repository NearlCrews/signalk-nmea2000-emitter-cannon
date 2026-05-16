# Advisor Phase 3: OpenRouter Engine Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Write the failing test, run it, implement, run, commit.

**Goal:** When an OpenRouter API key is configured, enrich each advisor recommendation with a clear plain-language rationale, while keeping the advisor fully functional without a key.

**Architecture:** The deterministic recommender stays the source of truth for what to enable or disable. An optional OpenRouter pass rewrites the `reason` field of each recommendation into plainer language using a strict JSON-schema structured-output request. The call is bounded by an in-memory per-day budget. Every failure mode (no key, disabled, budget exhausted, network error, malformed JSON, an unknown optionKey from the model) falls back to the deterministic reasons plus a non-fatal note. The OpenRouter client is modeled on the sibling `signalk-openrouter-companion`'s `openrouter.ts`.

**Tech Stack:** TypeScript 6 (strict, ESM), Node 22 `fetch`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-16-openrouter-config-advisor-design.md`, sections 4.4, 4.7, 10. This plan is Phase 3 of 4.

**Scope:** Phase 3 enriches the `reason` text only. It does not let the model change which conversions are recommended; the deterministic recommender owns `action`. Model-driven resolution of ambiguous paths is a possible later enhancement, deliberately out of scope here.

**OpenRouter facts (verified, see the `openrouter-config-expert` agent):** base URL `https://openrouter.ai/api/v1`; `POST /chat/completions`; `Authorization: Bearer <key>`; structured output via `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` plus `provider: { require_parameters: true }`; transient statuses `429/500/502/503/504`, terminal `400/401/402/403`.

---

## File Structure

- Create: `src/advisor/budget.ts` - in-memory per-UTC-day call cap.
- Create: `src/advisor/openrouter.ts` - `OpenRouterClient` and `enrichRationales()`.
- Modify: `src/advisor/advisor.ts` - `AdvisorDeps.enrichReasons` / `testKey`, enrichment branch in `runReview`, `testKey` method.
- Modify: `src/index.ts` - construct the client and budget, supply the deps.
- Modify: `src/api/router.ts` - add `POST /api/advisor/test-key`.
- Modify: `src/test/advisor.test.ts`, `src/test/api.test.ts` - tests.

---

## Task 1: In-memory budget tracker

**Files:**
- Create: `src/advisor/budget.ts`
- Test: `src/test/advisor.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts` (add `import { BudgetTracker } from "../advisor/budget.js";` with the other imports):

```typescript
describe("BudgetTracker", () => {
	it("allows calls up to the daily cap", () => {
		const b = new BudgetTracker(2, () => new Date("2026-05-16T00:00:00Z"));
		expect(b.canSpend()).toBe(true);
		b.recordCall();
		b.recordCall();
		expect(b.canSpend()).toBe(false);
	});

	it("resets the count on a new UTC day", () => {
		let day = "2026-05-16";
		const b = new BudgetTracker(1, () => new Date(`${day}T12:00:00Z`));
		b.recordCall();
		expect(b.canSpend()).toBe(false);
		day = "2026-05-17";
		expect(b.canSpend()).toBe(true);
	});

	it("a zero cap blocks every call", () => {
		const b = new BudgetTracker(0, () => new Date("2026-05-16T00:00:00Z"));
		expect(b.canSpend()).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "BudgetTracker"`
Expected: FAIL (cannot find module `../advisor/budget.js`).

- [ ] **Step 3: Implement the tracker**

```typescript
// src/advisor/budget.ts

/**
 * In-memory per-UTC-day call cap that bounds OpenRouter spend. The count is
 * not persisted: a plugin restart resets it. That is acceptable here because
 * reviews are user-triggered or on a multi-day timer, so the worst case after
 * a restart is one extra day's allowance, not a runaway loop.
 */
export class BudgetTracker {
	private day: string;
	private count = 0;

	constructor(
		private readonly maxPerDay: number,
		private readonly now: () => Date = () => new Date(),
	) {
		this.day = this.utcDay();
	}

	private utcDay(): string {
		return this.now().toISOString().slice(0, 10);
	}

	private rollover(): void {
		const today = this.utcDay();
		if (today !== this.day) {
			this.day = today;
			this.count = 0;
		}
	}

	/** True when another call is within the day's cap. */
	canSpend(): boolean {
		this.rollover();
		return this.count < this.maxPerDay;
	}

	/** Record one call against the day's cap. */
	recordCall(): void {
		this.rollover();
		this.count += 1;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "BudgetTracker"`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/advisor/budget.ts src/test/advisor.test.ts
git commit -m "feat(advisor): add in-memory OpenRouter budget tracker"
```

---

## Task 2: OpenRouter client

**Files:**
- Create: `src/advisor/openrouter.ts`
- Test: `src/test/advisor.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts` (add `import { OpenRouterClient } from "../advisor/openrouter.js";`):

```typescript
describe("OpenRouterClient", () => {
	function fetchReturning(status: number, body: unknown): typeof fetch {
		return (async () =>
			({
				ok: status >= 200 && status < 300,
				status,
				headers: new Headers(),
				json: async () => body,
			}) as Response) as typeof fetch;
	}

	const cfg = {
		apiKey: "k",
		model: "m",
		baseUrl: "https://openrouter.ai/api/v1",
	};

	it("returns the message content on a 200", async () => {
		const client = new OpenRouterClient(
			cfg,
			fetchReturning(200, {
				choices: [{ message: { content: '{"ok":true}' } }],
			}),
		);
		const text = await client.complete({ system: "s", user: "u" });
		expect(text).toBe('{"ok":true}');
	});

	it("throws a terminal error on 401 without retrying", async () => {
		let calls = 0;
		const counting = (async () => {
			calls += 1;
			return {
				ok: false,
				status: 401,
				headers: new Headers(),
				json: async () => ({ error: { message: "bad key" } }),
			} as Response;
		}) as typeof fetch;
		const client = new OpenRouterClient(cfg, counting);
		await expect(client.complete({ system: "s", user: "u" })).rejects.toThrow();
		expect(calls).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "OpenRouterClient"`
Expected: FAIL (cannot find module `../advisor/openrouter.js`).

- [ ] **Step 3: Implement the client**

```typescript
// src/advisor/openrouter.ts

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
					: new OpenRouterError(0, err instanceof Error ? err.message : String(err)),
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
				json_schema: { name: args.schema.name, strict: true, schema: args.schema.schema },
			};
			body.provider = { require_parameters: true };
		}
		return body;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "OpenRouterClient"`
Expected: PASS (2 cases).

- [ ] **Step 5: Commit**

```bash
git add src/advisor/openrouter.ts src/test/advisor.test.ts
git commit -m "feat(advisor): add OpenRouter chat-completions client"
```

---

## Task 3: Rationale enrichment

**Files:**
- Modify: `src/advisor/openrouter.ts`
- Test: `src/test/advisor.test.ts` (append)

`enrichRationales` sends the recommendations to OpenRouter and asks for a plainer `reason` per `optionKey`, using a strict JSON schema. It returns a `Map<optionKey, reason>` covering only keys the model returned that are also in the input set (the allowlist guard against an invented key). Malformed JSON yields an empty map, so the caller keeps the deterministic reasons.

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts` (add `enrichRationales` to the openrouter import):

```typescript
describe("enrichRationales", () => {
	const recs = [
		{
			optionKey: "DEPTH",
			action: "enable" as const,
			currentlyEnabled: false,
			matchedPaths: ["navigation.depth.belowTransducer"],
			confidence: "high" as const,
			origin: "live" as const,
			reason: "deterministic reason",
		},
	];

	it("maps a returned rationale onto its optionKey", async () => {
		const client = {
			complete: async () =>
				JSON.stringify({
					rationales: [{ optionKey: "DEPTH", reason: "clear reason" }],
				}),
		};
		const out = await enrichRationales(client, recs);
		expect(out.get("DEPTH")).toBe("clear reason");
	});

	it("drops an optionKey the model invented", async () => {
		const client = {
			complete: async () =>
				JSON.stringify({
					rationales: [{ optionKey: "MADE_UP", reason: "x" }],
				}),
		};
		const out = await enrichRationales(client, recs);
		expect(out.size).toBe(0);
	});

	it("returns an empty map on malformed JSON", async () => {
		const client = { complete: async () => "not json" };
		const out = await enrichRationales(client, recs);
		expect(out.size).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "enrichRationales"`
Expected: FAIL (`enrichRationales` not exported).

- [ ] **Step 3: Implement enrichment**

Append to `src/advisor/openrouter.ts` (add the `Recommendation` import at the top):

```typescript
import type { Recommendation } from "./types.js";

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
	"which conversions are recommended. Reply only with the requested JSON.";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "enrichRationales"`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/advisor/openrouter.ts src/test/advisor.test.ts
git commit -m "feat(advisor): add OpenRouter rationale enrichment"
```

---

## Task 4: Enrichment branch in the orchestrator

**Files:**
- Modify: `src/advisor/advisor.ts`
- Test: `src/test/advisor.test.ts` (append)

`AdvisorDeps` gains an optional `enrichReasons`. After `recommend()`, when
`advisor.openRouter` is enabled with a non-empty key, `runReview` calls it and
overwrites each recommendation's `reason` with the enriched text. A failure is
caught and surfaced as a note. The enrichment runs on both `autoApplied` and
`pending` recommendations.

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts`:

```typescript
describe("Advisor.runReview with OpenRouter", () => {
	it("overwrites reasons with enriched text", async () => {
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {},
				advisor: {
					...DEFAULT_ADVISOR_CONFIG,
					openRouter: {
						...DEFAULT_ADVISOR_CONFIG.openRouter,
						enabled: true,
						apiKey: "k",
					},
				},
			}),
			enrichReasons: async () => ({
				reasons: new Map([["DEPTH", "enriched reason"]]),
			}),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.autoApplied[0]?.reason).toBe("enriched reason");
	});

	it("notes an OpenRouter failure and keeps deterministic reasons", async () => {
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {},
				advisor: {
					...DEFAULT_ADVISOR_CONFIG,
					openRouter: {
						...DEFAULT_ADVISOR_CONFIG.openRouter,
						enabled: true,
						apiKey: "k",
					},
				},
			}),
			enrichReasons: async () => {
				throw new Error("HTTP 402");
			},
		});
		const result = await new Advisor(deps).runReview();
		expect(result.notes.some((n) => n.includes("OpenRouter"))).toBe(true);
		expect(result.autoApplied[0]?.reason).toContain("DEPTH");
	});

	it("skips OpenRouter when no key is set", async () => {
		let called = false;
		const deps = advisorDeps({
			enrichReasons: async () => {
				called = true;
				return { reasons: new Map() };
			},
		});
		await new Advisor(deps).runReview();
		expect(called).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "runReview with OpenRouter"`
Expected: FAIL (`enrichReasons` not on `AdvisorDeps`).

- [ ] **Step 3: Update the orchestrator**

In `src/advisor/advisor.ts`, add to `AdvisorDeps`:

```typescript
	/** Optional OpenRouter rationale enrichment. Absent skips OpenRouter. */
	enrichReasons?: (
		openRouter: { apiKey: string; model: string },
		recs: Recommendation[],
	) => Promise<{ reasons: Map<string, string>; note?: string }>;
	/** Optional OpenRouter key validation for the test-key endpoint. */
	testKeyFn?: (openRouter: { apiKey: string; model: string }) => Promise<boolean>;
```

In `runReview`, after the `const recs = recommend({ ... })` line and before
`const autoApplied = ...`, add the enrichment pass:

```typescript
		const openRouter = this.openRouterConfig(config);
		if (openRouter && this.deps.enrichReasons) {
			try {
				const { reasons, note } = await this.deps.enrichReasons(
					openRouter,
					recs,
				);
				for (const r of recs) {
					const enriched = reasons.get(r.optionKey);
					if (enriched) r.reason = enriched;
				}
				if (note) notes.push(note);
			} catch (err) {
				const detail = err instanceof Error ? err.message : String(err);
				notes.push(
					`OpenRouter enrichment unavailable (${detail}); using built-in explanations.`,
				);
			}
		}
```

Add the public `testKey` method beside `testQuestDB`:

```typescript
	/** Validate the configured OpenRouter key. */
	async testKey(): Promise<{ ok: boolean }> {
		const openRouter = this.openRouterConfig(this.deps.readConfig());
		if (!openRouter || !this.deps.testKeyFn) return { ok: false };
		try {
			return { ok: await this.deps.testKeyFn(openRouter) };
		} catch {
			return { ok: false };
		}
	}
```

Add the private helper beside `questdbConfig`:

```typescript
	private openRouterConfig(
		config: Record<string, unknown>,
	): { apiKey: string; model: string } | null {
		const advisor = config.advisor;
		if (!advisor || typeof advisor !== "object") return null;
		const o = (advisor as { openRouter?: unknown }).openRouter;
		if (!o || typeof o !== "object") return null;
		const { enabled, apiKey, model } = o as Record<string, unknown>;
		if (enabled !== true) return null;
		if (typeof apiKey !== "string" || apiKey.trim() === "") return null;
		return { apiKey, model: typeof model === "string" ? model : "" };
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts`
Expected: PASS (every block).

- [ ] **Step 5: Commit**

```bash
git add src/advisor/advisor.ts src/test/advisor.test.ts
git commit -m "feat(advisor): enrich recommendations via OpenRouter in runReview"
```

---

## Task 5: Wire OpenRouter into the plugin

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Supply the deps**

In `src/index.ts`, add the imports beside the advisor ones:

```typescript
import { BudgetTracker } from "./advisor/budget.js";
import {
	enrichRationales,
	OpenRouterClient,
} from "./advisor/openrouter.js";
```

Above the `new Advisor({ ... })` call, create a budget tracker:

```typescript
	// One shared budget across reviews for this plugin run.
	const advisorBudget = new BudgetTracker(Number.MAX_SAFE_INTEGER);
```

Note: the per-day cap is read from config at call time below, so the tracker
is created with an effectively unlimited ceiling and the call site enforces
the configured `maxCallsPerDay`. (If you prefer, recreate the tracker when the
setting changes; for Phase 3 the call-site check is sufficient.)

Add to the `new Advisor({ ... })` deps:

```typescript
		enrichReasons: async (openRouter, recs) => {
			const advisorCfg = (
				app.readPluginOptions() as {
					configuration?: { advisor?: { openRouter?: { maxCallsPerDay?: number } } };
				}
			).configuration?.advisor?.openRouter;
			const cap = advisorCfg?.maxCallsPerDay ?? 0;
			if (advisorBudget.callsToday() >= cap) {
				return { reasons: new Map(), note: "OpenRouter daily call budget reached; using built-in explanations." };
			}
			advisorBudget.recordCall();
			const client = new OpenRouterClient({
				apiKey: openRouter.apiKey,
				model: openRouter.model || "anthropic/claude-haiku-4.5",
				baseUrl: "https://openrouter.ai/api/v1",
			});
			return { reasons: await enrichRationales(client, recs) };
		},
		testKeyFn: async (openRouter) => {
			const client = new OpenRouterClient({
				apiKey: openRouter.apiKey,
				model: openRouter.model || "anthropic/claude-haiku-4.5",
				baseUrl: "https://openrouter.ai/api/v1",
			});
			await client.complete({ system: "ping", user: "ping" });
			return true;
		},
```

- [ ] **Step 2: Add `callsToday` to `BudgetTracker`**

The wiring above calls `advisorBudget.callsToday()`. Add it to
`src/advisor/budget.ts`:

```typescript
	/** Calls recorded so far in the current UTC day. */
	callsToday(): number {
		this.rollover();
		return this.count;
	}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/advisor/budget.ts
git commit -m "feat(advisor): wire the OpenRouter client and budget into the plugin"
```

---

## Task 6: OpenRouter key-test endpoint

**Files:**
- Modify: `src/api/router.ts`
- Test: `src/test/api.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append inside the `describe("API router", ...)` block in `src/test/api.test.ts`:

```typescript
	it("POST /api/advisor/test-key reports key validity", async () => {
		const advisor = {
			runReview: async () => ({ ranAt: "", autoApplied: [], pending: [], notes: [] }),
			getPending: () => [],
			applyReview: async () => {},
			testKey: async () => ({ ok: true }),
		};
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => advisor,
		);
		const res = await request(ex).post(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/test-key",
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/api.test.ts -t "test-key"`
Expected: FAIL (route 404s).

- [ ] **Step 3: Add the route**

In `src/api/router.ts`, after the `/api/advisor/questdb-test` route, add:

```typescript
		router.post(
			"/api/advisor/test-key",
			advisorRoute(async (advisor, _req, res) => {
				res.json(await advisor.testKey());
			}),
		);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/test/api.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/router.ts src/test/api.test.ts
git commit -m "feat(advisor): add OpenRouter key-test endpoint"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass; both builds succeed.

- [ ] **Step 2: Manual smoke check**

Rebuild and restart signalk. In the panel, enter an OpenRouter key, enable
OpenRouter, click "Review now", and confirm each recommendation's reason is
in plain language. Enter a bad key and confirm the review still completes
with deterministic reasons plus an "OpenRouter enrichment unavailable" note.

---

## Self-Review

- **Spec coverage:** the OpenRouter client (4.4), the budget tracker (4.7), structured-output rationale enrichment, and the error-handling fallbacks (10: no key, disabled, 402/429, malformed JSON, invented optionKey all fall back to deterministic reasons plus a note).
- **Optional and safe:** `enrichReasons` / `testKeyFn` are optional deps; the advisor runs unchanged without a key. The deterministic recommender owns `action`; the model only rewrites `reason`.
- **Allowlist guard:** `enrichRationales` drops any optionKey not in the input recommendation set.
- **No new dependencies:** the client uses the Node 22 global `fetch`.
- **Placeholder scan:** none; every step has complete code.
- **Type consistency:** `Completer`, `OpenRouterConfig`, `CompleteArgs` defined in Tasks 2 to 3; `AdvisorDeps.enrichReasons` signature `(openRouter, recs) => Promise<{ reasons, note? }>` defined in Task 4 and supplied in Task 5; `BudgetTracker.callsToday` added in Task 5 Step 2 because Task 5 Step 1 calls it.
- **Known limitation:** Phase 3 enriches `reason` text only; it does not let the model resolve ambiguous paths. The budget is in-memory and resets on plugin restart.
