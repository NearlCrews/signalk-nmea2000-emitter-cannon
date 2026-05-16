# OpenRouter Config Advisor: Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working deterministic Config Advisor that reviews live Signal K paths and recommends which conversions to enable, with a hybrid trust model (auto-apply enables, park echo-risk disables for approval).

**Architecture:** A new `src/advisor/` subsystem. A pure recommender matches observed paths to conversions by their declared `keys`, a source predicate flags data already on the NMEA 2000 bus, and an orchestrator splits recommendations into auto-applied and pending. Three admin-gated API endpoints expose review/apply/pending; a new collapsible panel section drives them. No OpenRouter and no QuestDB in this phase: those are Phases 3 and 2 of the spec.

**Tech Stack:** TypeScript 6 (strict, ESM), TypeBox config schema, Express router, React 19 federated panel, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-16-openrouter-config-advisor-design.md`. This plan covers Phase 1 only (spec section 12). Phases 2 to 4 get their own plans after this lands.

---

## File Structure

**New files:**
- `src/advisor/types.ts` — shared advisor types: `PathInventoryEntry`, `PathInventory`, `Recommendation`, `ReviewResult`, `ApplyDecision`.
- `src/advisor/busSource.ts` — `isN2KSource(label)` predicate.
- `src/advisor/inventory.ts` — `buildLiveInventory(app)`.
- `src/advisor/recommender.ts` — `recommend(input)` pure function.
- `src/advisor/advisor.ts` — `Advisor` class: `runReview()`, `applyReview()`.
- `src/panel/hooks/useAdvisor.ts` — panel hook owning the review/apply API calls.
- `src/panel/components/advisor/AdvisorPanel.tsx` — the collapsible section.
- `src/panel/components/advisor/ReviewResultView.tsx` — auto-applied + pending lists.
- `src/test/advisor.test.ts` — recommender, inventory, busSource, Advisor unit tests.

**Modified files:**
- `src/config/schema.ts` — add the `advisor` config block.
- `src/api/types.ts` — add advisor request/response types.
- `src/api/router.ts` — add three advisor endpoints.
- `src/panel/PluginConfigurationPanel.tsx` — mount `AdvisorPanel`.
- `src/test/api.test.ts` — add advisor endpoint tests.

**Parallelization for a 3-teammate team:**
- **Lane A (backend core):** Tasks 3, 4, 5, 6 — `src/advisor/*` and `src/test/advisor.test.ts`.
- **Lane B (config + API):** Tasks 2, 7, 8 — `src/config/schema.ts`, `src/api/types.ts`, `src/api/router.ts`, `src/test/api.test.ts`.
- **Lane C (panel):** Tasks 9, 10, 11 — `src/panel/hooks/useAdvisor.ts`, `src/panel/components/advisor/*`, `PluginConfigurationPanel.tsx`.

Task 1 defines the shared type module and MUST land first; every lane imports from it. After Task 1, the three lanes touch disjoint files and run concurrently. Task 12 is the final integration gate and runs last. Lane B's Task 7 (`api/types.ts`) and Lane A's Task 5 both define types the others import; Task 1 front-loads every cross-lane type so the lanes never edit the same file.

---

## Task 1: Shared advisor types

**Files:**
- Create: `src/advisor/types.ts`
- Test: none (pure type declarations, no runtime behavior)

- [ ] **Step 1: Create the type module**

```typescript
// src/advisor/types.ts
// Shared types for the Config Advisor subsystem. Pure declarations: no
// runtime behavior, so no test file. Behavior that uses these types is
// tested in src/test/advisor.test.ts.

/** One observed Signal K path and where it currently comes from. */
export interface PathInventoryEntry {
	path: string;
	live: boolean;
	/** `$source` labels publishing this path live. Empty when not live. */
	liveSources: string[];
}

export type PathInventory = PathInventoryEntry[];

/** A single recommendation about one conversion. */
export interface Recommendation {
	optionKey: string;
	action: "enable" | "disable" | "keep";
	currentlyEnabled: boolean;
	matchedPaths: string[];
	confidence: "high" | "low";
	origin: "live" | "none";
	reason: string;
}

/** The outcome of one review run. */
export interface ReviewResult {
	ranAt: string;
	/** Confident enables, already written to config. */
	autoApplied: Recommendation[];
	/** Disables awaiting user approval. */
	pending: Recommendation[];
	/** Non-fatal warnings (e.g. a data source was unavailable). */
	notes: string[];
}

/** One user decision on a pending recommendation. */
export interface ApplyDecision {
	optionKey: string;
	approved: boolean;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/advisor/types.ts
git commit -m "feat(advisor): add shared advisor types"
```

---

## Task 2: Config schema `advisor` block

**Lane B.** Depends on Task 1 only for nothing (independent), but land after Task 1 for a clean history.

**Files:**
- Modify: `src/config/schema.ts`
- Test: `src/test/advisor.test.ts` (new file, schema section)

- [ ] **Step 1: Write the failing test**

Create `src/test/advisor.test.ts` with this content:

```typescript
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { RootConfig } from "../config/schema.js";

describe("advisor config block", () => {
	it("a config with no advisor block loads with defaults", () => {
		const filled = Value.Default(RootConfig, {
			conversions: {},
		}) as Record<string, unknown>;
		const advisor = filled.advisor as Record<string, unknown>;
		expect(advisor).toBeDefined();
		expect(advisor.enabled).toBe(false);
		const questdb = advisor.questdb as Record<string, unknown>;
		expect(questdb.lookbackDays).toBe(7);
		const openRouter = advisor.openRouter as Record<string, unknown>;
		expect(openRouter.maxCallsPerDay).toBe(25);
		const schedule = advisor.schedule as Record<string, unknown>;
		expect(schedule.intervalDays).toBe(7);
	});

	it("accepts a fully specified advisor block", () => {
		const cfg = {
			conversions: {},
			advisor: {
				enabled: true,
				openRouter: { enabled: true, apiKey: "k", model: "m", maxCallsPerDay: 5 },
				questdb: { enabled: true, url: "http://h:9000", lookbackDays: 30 },
				schedule: { periodic: true, intervalDays: 14 },
			},
		};
		expect(Value.Check(RootConfig, Value.Default(RootConfig, cfg))).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "advisor config block"`
Expected: FAIL (`advisor` is undefined).

- [ ] **Step 3: Add the advisor block to the schema**

In `src/config/schema.ts`, add this constant immediately before `export const RootConfig`:

```typescript
const AdvisorConfig = Type.Object({
	enabled: Type.Boolean({ default: false }),
	openRouter: Type.Object({
		enabled: Type.Boolean({ default: false }),
		apiKey: Type.String({ default: "" }),
		model: Type.String({ default: "anthropic/claude-haiku-4.5" }),
		maxCallsPerDay: Type.Integer({ default: 25, minimum: 0 }),
	}),
	questdb: Type.Object({
		enabled: Type.Boolean({ default: false }),
		url: Type.String({ default: "http://localhost:9000" }),
		lookbackDays: Type.Integer({ default: 7, minimum: 1 }),
	}),
	schedule: Type.Object({
		periodic: Type.Boolean({ default: false }),
		intervalDays: Type.Integer({ default: 7, minimum: 1 }),
	}),
});
```

Then change `RootConfig` to include it (add the `advisor` property; `Type.Default`-style defaulting needs the property present with its own default object):

```typescript
export const RootConfig = Type.Object({
	globalResendInterval: Type.Integer({
		default: DEFAULT_GLOBAL_RESEND_SECONDS,
		minimum: 0,
	}),
	conversions: Type.Record(Type.String(), Conversion, { default: {} }),
	advisor: Type.Optional(AdvisorConfig),
});
```

Add the exported type after `export type ConversionConfig`:

```typescript
export type AdvisorConfigType = Static<typeof AdvisorConfig>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "advisor config block"`
Expected: PASS.

Note on `Type.Optional` + defaults: TypeBox `Value.Default` only fills a missing optional property when the optional schema itself carries a `default`. Add a `default` to the `AdvisorConfig` reference so an absent block is materialized:

```typescript
	advisor: Type.Optional(Type.Object({ /* ... */ }, { default: {} })),
```

If Step 4 fails because `advisor` is still undefined, inline the object literal into `RootConfig` with `{ default: {} }` as the second arg of the inner `Type.Object`, keeping the per-field defaults. Re-run Step 4; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts src/test/advisor.test.ts
git commit -m "feat(advisor): add advisor config block to schema"
```

---

## Task 3: Bus-source predicate

**Lane A.**

**Files:**
- Create: `src/advisor/busSource.ts`
- Test: `src/test/advisor.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts`:

```typescript
import { isN2KSource } from "../advisor/busSource.js";

describe("isN2KSource", () => {
	it("flags canboatjs-style N2K source labels", () => {
		expect(isN2KSource("can0.123")).toBe(true);
		expect(isN2KSource("n2k-on-ve.can-socket.45")).toBe(true);
	});
	it("flags the plugin's own echo guard label", () => {
		expect(isN2KSource("NMEA2000")).toBe(true);
	});
	it("treats non-N2K sources as native", () => {
		expect(isN2KSource("gps1")).toBe(false);
		expect(isN2KSource("signalk-virtual-weather-sensors")).toBe(false);
		expect(isN2KSource("")).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "isN2KSource"`
Expected: FAIL (cannot find module `../advisor/busSource.js`).

- [ ] **Step 3: Implement the predicate**

```typescript
// src/advisor/busSource.ts

// canboatjs labels NMEA 2000 sources as "<bus>.<address>" where the bus id
// commonly contains "can" and the address is numeric, e.g. "can0.123" or
// "n2k-on-ve.can-socket.45". The plugin's own AIS echo guard uses the bare
// label "NMEA2000". A source matching either form is data already on the
// bus, so a conversion for it would echo.
const N2K_BUS_LABEL = /(^|[.\-])can([0-9.\-]|$)/i;

/**
 * True when `label` is a Signal K `$source` produced by the NMEA 2000 bus
 * (so emitting a conversion for that path would duplicate bus traffic).
 */
export function isN2KSource(label: string): boolean {
	if (label === "") return false;
	if (label === "NMEA2000") return true;
	if (N2K_BUS_LABEL.test(label) && /\.\d+$/.test(label)) return true;
	return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "isN2KSource"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/advisor/busSource.ts src/test/advisor.test.ts
git commit -m "feat(advisor): add N2K bus-source predicate"
```

---

## Task 4: Live inventory builder

**Lane A.**

**Files:**
- Create: `src/advisor/inventory.ts`
- Test: `src/test/advisor.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts`:

```typescript
import { buildLiveInventory } from "../advisor/inventory.js";
import type { SignalKApp } from "../types/index.js";

function inventoryApp(): SignalKApp {
	return {
		streambundle: {
			getAvailablePaths: () => ["navigation.depth.belowTransducer", "environment.wind.speedApparent"],
		},
		getSelfPath: (p: string) =>
			p === "navigation.depth.belowTransducer"
				? { $source: "depth.0" }
				: { $source: "can0.35" },
	} as unknown as SignalKApp;
}

describe("buildLiveInventory", () => {
	it("returns one entry per active path with its live sources", () => {
		const inv = buildLiveInventory(inventoryApp());
		expect(inv).toHaveLength(2);
		const depth = inv.find((e) => e.path === "navigation.depth.belowTransducer");
		expect(depth?.live).toBe(true);
		expect(depth?.liveSources).toEqual(["depth.0"]);
	});
	it("returns an empty inventory when no paths are active", () => {
		const empty = { streambundle: { getAvailablePaths: () => [] } } as unknown as SignalKApp;
		expect(buildLiveInventory(empty)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "buildLiveInventory"`
Expected: FAIL (cannot find module `../advisor/inventory.js`).

- [ ] **Step 3: Implement the inventory builder**

```typescript
// src/advisor/inventory.ts
import { enumerateActivePaths, enumerateSourcesForPath } from "../api/discovery.js";
import type { SignalKApp } from "../types/index.js";
import type { PathInventory } from "./types.js";

/**
 * Snapshot of every Signal K path the local server currently publishes,
 * each tagged with the `$source` labels publishing it. Reuses the existing
 * discovery helpers, so it is sync and cheap.
 */
export function buildLiveInventory(app: SignalKApp): PathInventory {
	return enumerateActivePaths(app).map((path) => ({
		path,
		live: true,
		liveSources: enumerateSourcesForPath(app, path),
	}));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "buildLiveInventory"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/advisor/inventory.ts src/test/advisor.test.ts
git commit -m "feat(advisor): add live path inventory builder"
```

---

## Task 5: Deterministic recommender

**Lane A.**

**Files:**
- Create: `src/advisor/recommender.ts`
- Test: `src/test/advisor.test.ts` (append)

The recommender matches inventory paths to conversions by the conversion's declared `paths` (from `ConversionMetadata`). It produces three actions: `enable` (a path is live from a native source and the conversion is off), `disable` (the conversion is on but every matched path is bus-origin, so it would echo), and `keep` (everything else). Phase 1 does NOT recommend disabling a conversion merely because no live path feeds it: with no QuestDB history that is a weak signal. Conversions whose `paths` is empty (per-engine factories) are skipped.

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts`:

```typescript
import { recommend } from "../advisor/recommender.js";
import type { ConversionMetadata } from "../api/types.js";

function meta(key: string, paths: string[]): ConversionMetadata {
	return { key, title: key, pgns: [], category: "navigation", presets: [], paths, extras: { type: "none" } };
}

describe("recommend", () => {
	it("recommends enabling a disabled conversion fed by a native source", () => {
		const recs = recommend({
			inventory: [{ path: "navigation.depth.belowTransducer", live: true, liveSources: ["depth.0"] }],
			metadata: [meta("DEPTH", ["navigation.depth.belowTransducer"])],
			currentConfig: {},
		});
		const depth = recs.find((r) => r.optionKey === "DEPTH");
		expect(depth?.action).toBe("enable");
		expect(depth?.confidence).toBe("high");
		expect(depth?.matchedPaths).toEqual(["navigation.depth.belowTransducer"]);
	});

	it("recommends disabling an enabled conversion whose data is already on the bus", () => {
		const recs = recommend({
			inventory: [{ path: "navigation.position", live: true, liveSources: ["can0.35"] }],
			metadata: [meta("GPS", ["navigation.position"])],
			currentConfig: { GPS: { enabled: true, resend: 0, sources: {}, extras: {} } },
		});
		expect(recs.find((r) => r.optionKey === "GPS")?.action).toBe("disable");
	});

	it("keeps an already-enabled conversion fed by a native source", () => {
		const recs = recommend({
			inventory: [{ path: "navigation.depth.belowTransducer", live: true, liveSources: ["depth.0"] }],
			metadata: [meta("DEPTH", ["navigation.depth.belowTransducer"])],
			currentConfig: { DEPTH: { enabled: true, resend: 0, sources: {}, extras: {} } },
		});
		expect(recs.find((r) => r.optionKey === "DEPTH")?.action).toBe("keep");
	});

	it("skips conversions with no declared paths and unmatched conversions", () => {
		const recs = recommend({
			inventory: [{ path: "navigation.depth.belowTransducer", live: true, liveSources: ["depth.0"] }],
			metadata: [meta("BATTERY", []), meta("WIND", ["environment.wind.speedApparent"])],
			currentConfig: {},
		});
		expect(recs).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "recommend"`
Expected: FAIL (cannot find module `../advisor/recommender.js`).

- [ ] **Step 3: Implement the recommender**

```typescript
// src/advisor/recommender.ts
import type { ConversionConfig } from "../config/schema.js";
import type { ConversionMetadata } from "../api/types.js";
import { isN2KSource } from "./busSource.js";
import type { PathInventory, Recommendation } from "./types.js";

export interface RecommendInput {
	inventory: PathInventory;
	metadata: ConversionMetadata[];
	currentConfig: Record<string, ConversionConfig>;
}

/**
 * Deterministic path-to-conversion matcher. Pure: no app, no network.
 * Emits a recommendation only for conversions that matched at least one
 * live path; unmatched conversions and factory conversions (empty `paths`)
 * are skipped.
 */
export function recommend(input: RecommendInput): Recommendation[] {
	const { inventory, metadata, currentConfig } = input;
	const byPath = new Map(inventory.map((e) => [e.path, e]));
	const out: Recommendation[] = [];

	for (const conv of metadata) {
		if (conv.paths.length === 0) continue;
		const matched = conv.paths.filter((p) => byPath.has(p));
		if (matched.length === 0) continue;

		const enabled = currentConfig[conv.key]?.enabled ?? false;
		// "On the bus" when every matched path's every live source is an N2K
		// device. A path with one native source makes the data native.
		const allBusOrigin = matched.every((p) => {
			const sources = byPath.get(p)?.liveSources ?? [];
			return sources.length > 0 && sources.every(isN2KSource);
		});

		if (allBusOrigin) {
			out.push({
				optionKey: conv.key,
				action: enabled ? "disable" : "keep",
				currentlyEnabled: enabled,
				matchedPaths: matched,
				confidence: "high",
				origin: "live",
				reason: enabled
					? `${conv.title}: ${matched.join(", ")} is already published from the NMEA 2000 bus; emitting it would echo.`
					: `${conv.title}: data already on the bus, left disabled.`,
			});
			continue;
		}

		out.push({
			optionKey: conv.key,
			action: enabled ? "keep" : "enable",
			currentlyEnabled: enabled,
			matchedPaths: matched,
			confidence: "high",
			origin: "live",
			reason: enabled
				? `${conv.title}: live and emitting, no change.`
				: `${conv.title}: ${matched.join(", ")} is live from a non-N2K source; enabling sends it to the bus.`,
		});
	}

	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "recommend"`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/advisor/recommender.ts src/test/advisor.test.ts
git commit -m "feat(advisor): add deterministic recommender"
```

---

## Task 6: Advisor orchestrator

**Lane A.** Depends on Tasks 3 to 5.

The orchestrator takes a small `AdvisorDeps` interface (not the raw `SignalKApp`) so it is unit-testable without a server. The plugin wires the real deps in Task 8.

**Files:**
- Create: `src/advisor/advisor.ts`
- Test: `src/test/advisor.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts`:

```typescript
import { Advisor } from "../advisor/advisor.js";

function advisorDeps(overrides: Partial<Parameters<typeof Advisor.prototype.constructor>[0]> = {}) {
	let saved: Record<string, unknown> | null = null;
	return {
		buildInventory: () => [
			{ path: "navigation.depth.belowTransducer", live: true, liveSources: ["depth.0"] },
		],
		getMetadata: () => [meta("DEPTH", ["navigation.depth.belowTransducer"])],
		readConfig: () => ({ conversions: {} }) as Record<string, unknown>,
		writeConfig: (cfg: Record<string, unknown>) => { saved = cfg; },
		now: () => new Date("2026-05-16T10:00:00Z"),
		getSaved: () => saved,
		...overrides,
	};
}

describe("Advisor.runReview", () => {
	it("auto-applies a confident enable and writes config", async () => {
		const deps = advisorDeps();
		const advisor = new Advisor(deps);
		const result = await advisor.runReview();
		expect(result.autoApplied.map((r) => r.optionKey)).toEqual(["DEPTH"]);
		expect(result.pending).toEqual([]);
		const saved = deps.getSaved() as { conversions: Record<string, { enabled: boolean }> };
		expect(saved.conversions.DEPTH.enabled).toBe(true);
	});

	it("parks a disable as pending and does not write it", async () => {
		const deps = advisorDeps({
			buildInventory: () => [{ path: "navigation.position", live: true, liveSources: ["can0.9"] }],
			getMetadata: () => [meta("GPS", ["navigation.position"])],
			readConfig: () => ({ conversions: { GPS: { enabled: true, resend: 0, sources: {}, extras: {} } } }),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.pending.map((r) => r.optionKey)).toEqual(["GPS"]);
		expect(result.autoApplied).toEqual([]);
	});
});

describe("Advisor.applyReview", () => {
	it("applies approved disables and ignores rejected ones", async () => {
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {
					GPS: { enabled: true, resend: 0, sources: {}, extras: {} },
					AIS: { enabled: true, resend: 0, sources: {}, extras: {} },
				},
			}),
		});
		const advisor = new Advisor(deps);
		await advisor.applyReview([
			{ optionKey: "GPS", approved: true },
			{ optionKey: "AIS", approved: false },
		]);
		const saved = deps.getSaved() as { conversions: Record<string, { enabled: boolean }> };
		expect(saved.conversions.GPS.enabled).toBe(false);
		expect(saved.conversions.AIS.enabled).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "Advisor"`
Expected: FAIL (cannot find module `../advisor/advisor.js`).

- [ ] **Step 3: Implement the orchestrator**

```typescript
// src/advisor/advisor.ts
import type { ConversionConfig } from "../config/schema.js";
import type { ConversionMetadata } from "../api/types.js";
import { recommend } from "./recommender.js";
import type { ApplyDecision, PathInventory, Recommendation, ReviewResult } from "./types.js";

/**
 * Everything the orchestrator needs, abstracted from `SignalKApp` so it is
 * unit-testable. The plugin supplies the real implementations in index.ts.
 */
export interface AdvisorDeps {
	buildInventory: () => PathInventory;
	getMetadata: () => ConversionMetadata[];
	readConfig: () => Record<string, unknown>;
	writeConfig: (config: Record<string, unknown>) => void;
	now?: () => Date;
}

type ConversionMap = Record<string, ConversionConfig>;

export class Advisor {
	private lastPending: Recommendation[] = [];

	constructor(private readonly deps: AdvisorDeps) {}

	/** Build an inventory, recommend, auto-apply enables, return the result. */
	async runReview(): Promise<ReviewResult> {
		const now = (this.deps.now ?? (() => new Date()))();
		const config = this.deps.readConfig();
		const conversions = this.conversionsOf(config);

		const recs = recommend({
			inventory: this.deps.buildInventory(),
			metadata: this.deps.getMetadata(),
			currentConfig: conversions,
		});

		const autoApplied = recs.filter((r) => r.action === "enable");
		const pending = recs.filter((r) => r.action === "disable");
		this.lastPending = pending;

		if (autoApplied.length > 0) {
			const next = { ...conversions };
			for (const r of autoApplied) {
				next[r.optionKey] = { ...this.entryOf(next, r.optionKey), enabled: true };
			}
			this.deps.writeConfig({ ...config, conversions: next });
		}

		return { ranAt: now.toISOString(), autoApplied, pending, notes: [] };
	}

	/** The pending list from the most recent runReview. */
	getPending(): Recommendation[] {
		return this.lastPending;
	}

	/** Apply approved decisions; rejected decisions are left untouched. */
	async applyReview(decisions: ApplyDecision[]): Promise<void> {
		const approved = decisions.filter((d) => d.approved);
		if (approved.length === 0) return;
		const config = this.deps.readConfig();
		const conversions = { ...this.conversionsOf(config) };
		for (const d of approved) {
			const rec = this.lastPending.find((r) => r.optionKey === d.optionKey);
			if (!rec) continue;
			const enabled = rec.action === "enable";
			conversions[d.optionKey] = { ...this.entryOf(conversions, d.optionKey), enabled };
		}
		this.deps.writeConfig({ ...config, conversions });
	}

	private conversionsOf(config: Record<string, unknown>): ConversionMap {
		const c = config.conversions;
		return c && typeof c === "object" ? (c as ConversionMap) : {};
	}

	private entryOf(map: ConversionMap, key: string): ConversionConfig {
		return map[key] ?? { enabled: false, resend: 0, sources: {}, extras: {} };
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "Advisor"`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Run the full advisor test file**

Run: `npx vitest run src/test/advisor.test.ts`
Expected: PASS (every describe block).

- [ ] **Step 6: Commit**

```bash
git add src/advisor/advisor.ts src/test/advisor.test.ts
git commit -m "feat(advisor): add review orchestrator"
```

---

## Task 7: Advisor API response types

**Lane B.** Depends on Task 1.

**Files:**
- Modify: `src/api/types.ts`

- [ ] **Step 1: Add the response types**

Append to `src/api/types.ts`:

```typescript
import type { ApplyDecision, ReviewResult } from "../advisor/types.js";

/** Body of `POST /api/advisor/review` and `GET /api/advisor/pending`. */
export interface AdvisorReviewResponse {
	result: ReviewResult;
}

/** Request body of `POST /api/advisor/apply`. */
export interface AdvisorApplyRequest {
	decisions: ApplyDecision[];
}

/** Body of `POST /api/advisor/apply`. */
export interface AdvisorApplyResponse {
	applied: number;
}
```

Note: the existing `src/api/types.ts` has no imports at the top except the `config/enums.js` one on line 1. Add the new `import type` line at the top of the file, beside that import, not inline above the interface.

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(advisor): add advisor API response types"
```

---

## Task 8: Advisor API endpoints

**Lane B.** Depends on Tasks 6 and 7. The router gains three routes. The router cannot construct an `Advisor` itself (it has no deps), so `createApiRouter` takes a new `getAdvisor` closure, mirroring the existing `getManager` closure. The plugin wires the real `Advisor` in Task 12.

**Files:**
- Modify: `src/api/router.ts`
- Modify: `src/index.ts`
- Test: `src/test/api.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append inside the `describe("API router", ...)` block in `src/test/api.test.ts`:

```typescript
	it("POST /api/advisor/review returns the review result", async () => {
		const advisor = {
			runReview: async () => ({
				ranAt: "2026-05-16T10:00:00Z",
				autoApplied: [{ optionKey: "DEPTH", action: "enable", currentlyEnabled: false, matchedPaths: ["navigation.depth.belowTransducer"], confidence: "high", origin: "live", reason: "x" }],
				pending: [],
				notes: [],
			}),
			getPending: () => [],
			applyReview: async () => {},
		};
		const ex = mountRouterWithAdvisor(fakeApp, () => null, () => advisor);
		const res = await request(ex).post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/review");
		expect(res.status).toBe(200);
		expect(res.body.result.autoApplied[0].optionKey).toBe("DEPTH");
	});

	it("POST /api/advisor/apply forwards decisions and returns the count", async () => {
		const calls: unknown[] = [];
		const advisor = {
			runReview: async () => ({ ranAt: "", autoApplied: [], pending: [], notes: [] }),
			getPending: () => [],
			applyReview: async (d: unknown[]) => { calls.push(d); },
		};
		const ex = mountRouterWithAdvisor(fakeApp, () => null, () => advisor);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({ decisions: [{ optionKey: "GPS", approved: true }] });
		expect(res.status).toBe(200);
		expect(res.body.applied).toBe(1);
		expect(calls).toHaveLength(1);
	});

	it("advisor endpoints 503 when no advisor is wired", async () => {
		const ex = mountRouterWithAdvisor(fakeApp, () => null, () => null);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/pending");
		expect(res.status).toBe(503);
	});
```

Add this helper next to the existing `mountRouter` function in `src/test/api.test.ts`:

```typescript
function mountRouterWithAdvisor(
	app: SignalKApp,
	getPm: () => PluginManager | null,
	getAdvisor: () => unknown,
): express.Express {
	const expressApp = express();
	expressApp.use(express.json());
	const router: IRouter = express.Router();
	createApiRouter(app, getPm, getAdvisor as never)(router);
	expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);
	return expressApp;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/api.test.ts -t "advisor"`
Expected: FAIL (`createApiRouter` takes 2 args, `mountRouterWithAdvisor` passes 3; routes 404).

- [ ] **Step 3: Extend the router**

In `src/api/router.ts`, add the import at the top:

```typescript
import type { Advisor } from "../advisor/advisor.js";
import type { AdvisorApplyRequest } from "./types.js";
```

Add a status constant beside `BAD_REQUEST`:

```typescript
const HTTP_STATUS = {
	BAD_REQUEST: 400,
	SERVICE_UNAVAILABLE: 503,
} as const;
```

Change the `createApiRouter` signature to accept the advisor closure:

```typescript
export function createApiRouter(
	app: SignalKApp,
	getManager: () => PluginManager | null,
	getAdvisor: () => Advisor | null,
): (router: IRouter) => void {
```

Inside the returned `(router) => { ... }`, after the existing `/api/sources` route, add:

```typescript
		router.post("/api/advisor/review", async (_req: Request, res: Response) => {
			const advisor = getAdvisor();
			if (!advisor) {
				res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: "advisor unavailable" });
				return;
			}
			try {
				res.json({ result: await advisor.runReview() });
			} catch (err) {
				app.error(`advisor review failed: ${String(err)}`);
				res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: "review failed" });
			}
		});

		router.get("/api/advisor/pending", (_req: Request, res: Response) => {
			const advisor = getAdvisor();
			if (!advisor) {
				res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: "advisor unavailable" });
				return;
			}
			res.json({
				result: { ranAt: "", autoApplied: [], pending: advisor.getPending(), notes: [] },
			});
		});

		router.post("/api/advisor/apply", async (req: Request, res: Response) => {
			const advisor = getAdvisor();
			if (!advisor) {
				res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: "advisor unavailable" });
				return;
			}
			const body = req.body as Partial<AdvisorApplyRequest>;
			const decisions = Array.isArray(body.decisions) ? body.decisions : [];
			try {
				await advisor.applyReview(decisions);
				res.json({ applied: decisions.filter((d) => d.approved).length });
			} catch (err) {
				app.error(`advisor apply failed: ${String(err)}`);
				res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: "apply failed" });
			}
		});
```

- [ ] **Step 4: Update `index.ts` so the existing call still compiles**

In `src/index.ts`, the line `plugin.registerWithRouter = createApiRouter(app, () => pluginManager);` now needs a third argument. For this task pass a null advisor; Task 12 replaces it:

```typescript
	plugin.registerWithRouter = createApiRouter(
		app,
		() => pluginManager,
		() => null,
	);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/api.test.ts`
Expected: PASS (existing cases plus the 3 new advisor cases).

- [ ] **Step 6: Commit**

```bash
git add src/api/router.ts src/index.ts src/test/api.test.ts
git commit -m "feat(advisor): add review/apply/pending API endpoints"
```

---

## Task 9: Panel advisor hook

**Lane C.** Depends on Task 7 for response types.

**Files:**
- Create: `src/panel/hooks/useAdvisor.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/panel/hooks/useAdvisor.ts
import { useCallback, useState } from "react";
import type { ApplyDecision, ReviewResult } from "../../advisor/types.js";

const BASE = "/plugins/signalk-nmea2000-emitter-cannon/api/advisor";

interface AdvisorState {
	result: ReviewResult | null;
	loading: boolean;
	error: string | null;
}

/** Owns the review/apply HTTP calls for the AdvisorPanel. */
export function useAdvisor(): {
	state: AdvisorState;
	review: () => Promise<void>;
	apply: (decisions: ApplyDecision[]) => Promise<void>;
} {
	const [state, setState] = useState<AdvisorState>({
		result: null,
		loading: false,
		error: null,
	});

	const review = useCallback(async () => {
		setState((s) => ({ ...s, loading: true, error: null }));
		try {
			const res = await fetch(`${BASE}/review`, { method: "POST" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { result: ReviewResult };
			setState({ result: body.result, loading: false, error: null });
		} catch (err) {
			setState((s) => ({ ...s, loading: false, error: String(err) }));
		}
	}, []);

	const apply = useCallback(async (decisions: ApplyDecision[]) => {
		setState((s) => ({ ...s, loading: true, error: null }));
		try {
			const res = await fetch(`${BASE}/apply`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ decisions }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
		} catch (err) {
			setState((s) => ({ ...s, error: String(err) }));
		} finally {
			setState((s) => ({ ...s, loading: false }));
		}
	}, []);

	return { state, review, apply };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/panel/hooks/useAdvisor.ts
git commit -m "feat(advisor): add useAdvisor panel hook"
```

---

## Task 10: Review result component

**Lane C.** Depends on Task 1.

**Files:**
- Create: `src/panel/components/advisor/ReviewResultView.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/panel/components/advisor/ReviewResultView.tsx
import type * as React from "react";
import type { ReviewResult } from "../../../advisor/types.js";

interface Props {
	result: ReviewResult;
	onApprove: (optionKey: string) => void;
	onReject: (optionKey: string) => void;
}

/** Renders one ReviewResult: the auto-applied list and the pending list. */
export default function ReviewResultView({
	result,
	onApprove,
	onReject,
}: Props): React.ReactElement {
	return (
		<div>
			<div style={{ background: "#e8f5e9", padding: 8, borderRadius: 4, marginBottom: 8 }}>
				<strong>Auto-applied ({result.autoApplied.length})</strong>
				<ul>
					{result.autoApplied.map((r) => (
						<li key={r.optionKey} title={r.reason}>
							Enabled {r.optionKey}
						</li>
					))}
				</ul>
			</div>
			<div style={{ background: "#fff8e1", padding: 8, borderRadius: 4 }}>
				<strong>Needs your approval ({result.pending.length})</strong>
				{result.pending.map((r) => (
					<div key={r.optionKey} style={{ borderTop: "1px solid #e0d8b0", paddingTop: 6, marginTop: 6 }}>
						<div>
							<strong>
								{r.action === "disable" ? "Disable" : r.action} {r.optionKey}
							</strong>{" "}
							<button type="button" onClick={() => onApprove(r.optionKey)}>
								Approve
							</button>{" "}
							<button type="button" onClick={() => onReject(r.optionKey)}>
								Reject
							</button>
						</div>
						<div style={{ fontSize: "90%", opacity: 0.8 }}>{r.reason}</div>
					</div>
				))}
			</div>
			{result.notes.map((n) => (
				<div key={n} style={{ fontSize: "90%", opacity: 0.7, marginTop: 6 }}>
					{n}
				</div>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/panel/components/advisor/ReviewResultView.tsx
git commit -m "feat(advisor): add review result component"
```

---

## Task 11: Advisor panel section

**Lane C.** Depends on Tasks 9 and 10.

**Files:**
- Create: `src/panel/components/advisor/AdvisorPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/panel/components/advisor/AdvisorPanel.tsx
import type * as React from "react";
import { useState } from "react";
import type { ApplyDecision } from "../../../advisor/types.js";
import { useAdvisor } from "../../hooks/useAdvisor.js";
import ReviewResultView from "./ReviewResultView.js";

/**
 * Collapsible "Config Advisor" section. Phase 1: a Review now button, the
 * result, and per-item Approve/Reject. Settings rows (OpenRouter, QuestDB,
 * schedule) arrive in later phases.
 */
export default function AdvisorPanel(): React.ReactElement {
	const [open, setOpen] = useState(false);
	const { state, review, apply } = useAdvisor();
	const [decisions, setDecisions] = useState<Record<string, boolean>>({});

	const decide = (optionKey: string, approved: boolean): void => {
		setDecisions((d) => ({ ...d, [optionKey]: approved }));
	};

	const applyAll = (): void => {
		const list: ApplyDecision[] = Object.entries(decisions).map(
			([optionKey, approved]) => ({ optionKey, approved }),
		);
		void apply(list);
	};

	return (
		<section style={{ border: "1px solid #ccc", borderRadius: 4, margin: "12px 0", padding: 8 }}>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				style={{ background: "none", border: "none", font: "inherit", cursor: "pointer", fontWeight: "bold" }}
			>
				{open ? "v" : ">"} Config Advisor
			</button>
			{open && (
				<div style={{ marginTop: 8 }}>
					<p style={{ fontSize: "90%", opacity: 0.8 }}>
						Reviews the Signal K paths your boat publishes and recommends which
						conversions to enable. Enables apply automatically; anything that
						disables a conversion waits for your approval.
					</p>
					<button type="button" onClick={() => void review()} disabled={state.loading}>
						{state.loading ? "Reviewing..." : "Review now"}
					</button>
					{state.error && (
						<div role="alert" style={{ color: "#b00", marginTop: 6 }}>
							{state.error}
						</div>
					)}
					{state.result && (
						<div style={{ marginTop: 8 }}>
							<ReviewResultView
								result={state.result}
								onApprove={(k) => decide(k, true)}
								onReject={(k) => decide(k, false)}
							/>
							{state.result.pending.length > 0 && (
								<button type="button" onClick={applyAll} style={{ marginTop: 8 }}>
									Apply approved
								</button>
							)}
						</div>
					)}
				</div>
			)}
		</section>
	);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/panel/components/advisor/AdvisorPanel.tsx
git commit -m "feat(advisor): add collapsible advisor panel section"
```

---

## Task 12: Wire the advisor into the plugin and panel

**Integration task. Runs last, after every lane.** Depends on Tasks 6, 8, 11.

**Files:**
- Modify: `src/index.ts`
- Modify: `src/panel/PluginConfigurationPanel.tsx`

- [ ] **Step 1: Construct the Advisor in `index.ts`**

In `src/index.ts`, add the imports at the top with the other imports:

```typescript
import { Advisor } from "./advisor/advisor.js";
import { buildLiveInventory } from "./advisor/inventory.js";
```

Inside `createPlugin`, after the `let pluginManager` declaration, add:

```typescript
	const advisor = new Advisor({
		buildInventory: () => buildLiveInventory(app),
		getMetadata: () => (pluginManager ? pluginManager.getConversionMetadata() : []),
		readConfig: () => app.readPluginOptions() as Record<string, unknown>,
		writeConfig: (config) => {
			app.savePluginOptions(config, (err) => {
				if (err) app.error(`advisor config save failed: ${errMessage(err)}`);
			});
		},
	});
```

Change the `registerWithRouter` line (set in Task 8 to `() => null`) to pass the advisor:

```typescript
	plugin.registerWithRouter = createApiRouter(
		app,
		() => pluginManager,
		() => advisor,
	);
```

- [ ] **Step 2: Mount `AdvisorPanel` in the panel**

In `src/panel/PluginConfigurationPanel.tsx`, add the import beside the other component imports:

```typescript
import AdvisorPanel from "./components/advisor/AdvisorPanel.js";
```

Render `<AdvisorPanel />` directly below the status dashboard. Locate the JSX element that renders `StatusDashboard` (search the file for `StatusDashboard`) and add `<AdvisorPanel />` on the line immediately after that element's closing tag, inside the same parent container.

- [ ] **Step 3: Run the full verification suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass (the prior 57 plus the new advisor and api cases); both the esbuild and webpack panel builds succeed.

- [ ] **Step 4: Manual smoke check**

Run: `npm run build` then restart the local signalk service. In the admin UI open the plugin config, expand "Config Advisor", click "Review now". Expect a result with an auto-applied list and/or a pending list. Approve a pending item and click "Apply approved"; confirm the conversion's enabled state changed in the conversion cards.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/panel/PluginConfigurationPanel.tsx
git commit -m "feat(advisor): wire advisor into plugin and panel"
```

---

## Self-Review

**Spec coverage (Phase 1 rows of spec section 12):**
- Deterministic advisor on live data: Tasks 3 to 6.
- `advisor` config block: Task 2 (full block, so Phases 2 to 4 do not re-touch the schema).
- API endpoints: Task 8 (`review`, `apply`, `pending`; `test-key` and `questdb-test` belong to Phases 2 and 3).
- Review/apply UI with the hybrid trust model: Tasks 9 to 11 (auto-applied list plus per-item approval).
- Hybrid trust model: Task 6 (`runReview` auto-applies `enable`, parks `disable`).
- Source-based bus detection: Task 3 plus Task 5.
- Testing: every backend task is TDD; `advisor.test.ts` and `api.test.ts` cover the recommender, inventory, busSource, orchestrator, and endpoints. The advisor is off by default, so the existing 57 tests are unaffected.

**Deferred to later phases (not gaps):** QuestDB (`inventory` historic branch, `questdb.ts`), OpenRouter (`openrouter.ts`, `budget.ts`, rationales, `test-key`), the periodic scheduler (`schedule.ts`), and the settings sub-panel rows with tooltips. The Phase 1 UI is intentionally the Review/result surface only.

**Placeholder scan:** none. Every code step carries complete code; every run step carries an exact command and expected outcome.

**Type consistency:** `Recommendation`, `ReviewResult`, `ApplyDecision`, `PathInventory` are defined once in Task 1 and imported everywhere. `AdvisorDeps` is defined in Task 6 and consumed in Task 12. `createApiRouter`'s third parameter (`getAdvisor`) is added in Task 8 and the `index.ts` call is updated in the same task (null) then in Task 12 (real), so the build never sees a 2-argument call after Task 8.

**Ordering note:** Task 1 lands first. Task 8 modifies `index.ts` (router call) and Task 12 modifies `index.ts` again (advisor construction); both are sequential within Lane B / integration, never concurrent, so there is no merge conflict on `index.ts`.
