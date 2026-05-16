# Advisor Phase 2: QuestDB Engine Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Write the failing test, run it, implement, run, commit.

**Goal:** Let the advisor see Signal K paths that are not live right now by querying QuestDB history, so it can recommend conversions for seasonal or intermittent gear.

**Architecture:** A zero-dependency `QuestDBClient` (HTTP REST, Node 22 global `fetch`) queries the three QuestDB tables for distinct paths within a look-back window. The advisor merges those historic paths into the live inventory; the recommender marks historic-only matches as lower-confidence. QuestDB is optional: disabled or unreachable yields a live-only inventory plus a non-fatal note. Modeled on the sibling `signalk-openrouter-companion`'s `QuestDBClient`.

**Tech Stack:** TypeScript 6 (strict, ESM), Node 22 `fetch`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-16-openrouter-config-advisor-design.md`, sections 4.1, 4.2, 5. This plan is Phase 2 of 4.

**QuestDB schema (verified on the live server):**
- `signalk` - `ts TIMESTAMP, path SYMBOL, context SYMBOL, value DOUBLE`
- `signalk_str` - `ts TIMESTAMP, path SYMBOL, context SYMBOL, value_str VARCHAR`
- `signalk_position` - `ts TIMESTAMP, context SYMBOL, lat DOUBLE, lon DOUBLE`

---

## File Structure

- Modify: `src/advisor/types.ts` - add `historic` to `PathInventoryEntry`, add `HistoricStats` / `HistoricPaths`.
- Create: `src/advisor/questdb.ts` - `QuestDBClient` and `fetchHistoricPaths()`.
- Modify: `src/advisor/inventory.ts` - add `mergeHistoric()`.
- Modify: `src/advisor/recommender.ts` - mark historic-only matches as `origin: "historic"`, `confidence: "low"`.
- Modify: `src/advisor/advisor.ts` - `AdvisorDeps.fetchHistoric`, QuestDB branch in `runReview`, `testQuestDB`.
- Modify: `src/index.ts` - construct a `QuestDBClient` from `advisor.questdb` config and supply the deps.
- Modify: `src/api/router.ts`, `src/api/types.ts` - add `GET /api/advisor/questdb-test`.
- Modify: `src/test/advisor.test.ts` - tests for `QuestDBClient`, `mergeHistoric`, historic recommendations, the QuestDB branch of `runReview`.

---

## Task 1: Historic types

**Files:**
- Modify: `src/advisor/types.ts`

- [ ] **Step 1: Add the types**

In `src/advisor/types.ts`, add `historic` to `PathInventoryEntry` and the two new types after it:

```typescript
/** One observed Signal K path and where it currently comes from. */
export interface PathInventoryEntry {
	path: string;
	live: boolean;
	/** `$source` labels publishing this path live. Empty when not live. */
	liveSources: string[];
	/** QuestDB history for this path, present only when QuestDB was queried. */
	historic?: HistoricStats;
}

/** QuestDB history stats for one path within the look-back window. */
export interface HistoricStats {
	samples: number;
	lastSeen: string;
}

/** Historic stats keyed by Signal K path. */
export type HistoricPaths = Map<string, HistoricStats>;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/advisor/types.ts
git commit -m "feat(advisor): add historic path types"
```

---

## Task 2: QuestDB client

**Files:**
- Create: `src/advisor/questdb.ts`
- Test: `src/test/advisor.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts` (add the import at the top of the file with the others):

```typescript
import { QuestDBClient } from "../advisor/questdb.js";

describe("QuestDBClient", () => {
	function fakeFetch(status: number, body: unknown): typeof fetch {
		return (async () =>
			({
				ok: status >= 200 && status < 300,
				status,
				json: async () => body,
			}) as Response) as typeof fetch;
	}

	it("probe returns true on a well-formed response", async () => {
		const c = new QuestDBClient(
			{ url: "http://h:9000" },
			fakeFetch(200, { dataset: [[1]] }),
		);
		expect(await c.probe()).toBe(true);
	});

	it("probe returns false on a non-OK response", async () => {
		const c = new QuestDBClient(
			{ url: "http://h:9000" },
			fakeFetch(503, {}),
		);
		expect(await c.probe()).toBe(false);
	});

	it("probe returns false when fetch throws", async () => {
		const throwing = (async () => {
			throw new Error("ECONNREFUSED");
		}) as typeof fetch;
		const c = new QuestDBClient({ url: "http://h:9000" }, throwing);
		expect(await c.probe()).toBe(false);
	});

	it("query returns columns and dataset", async () => {
		const c = new QuestDBClient(
			{ url: "http://h:9000" },
			fakeFetch(200, {
				columns: [{ name: "path", type: "SYMBOL" }],
				dataset: [["navigation.speedThroughWater"]],
			}),
		);
		const r = await c.query("SELECT 1");
		expect(r.dataset).toEqual([["navigation.speedThroughWater"]]);
	});

	it("query throws on a non-OK response", async () => {
		const c = new QuestDBClient(
			{ url: "http://h:9000" },
			fakeFetch(400, {}),
		);
		await expect(c.query("bad")).rejects.toThrow("HTTP 400");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "QuestDBClient"`
Expected: FAIL (cannot find module `../advisor/questdb.js`).

- [ ] **Step 3: Implement the client**

```typescript
// src/advisor/questdb.ts
import type { HistoricPaths } from "./types.js";

export interface QuestDBConfig {
	url: string;
}

export interface QueryResult {
	columns: { name: string; type: string }[];
	dataset: unknown[][];
}

const QUERY_TIMEOUT_MS = 4000;

/**
 * Minimal QuestDB HTTP REST client. `fetchImpl` is injectable so tests can
 * run without a server; production passes the global `fetch`.
 */
export class QuestDBClient {
	constructor(
		private readonly cfg: QuestDBConfig,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	/** True when QuestDB answers a trivial query. Never throws. */
	async probe(): Promise<boolean> {
		try {
			const r = await this.query("SELECT 1");
			return Array.isArray(r.dataset);
		} catch {
			return false;
		}
	}

	/** Run a SQL query. Throws on a non-OK response or transport failure. */
	async query(sql: string): Promise<QueryResult> {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), QUERY_TIMEOUT_MS);
		try {
			const url = `${this.cfg.url}/exec?query=${encodeURIComponent(sql)}`;
			const res = await this.fetchImpl(url, { signal: ctrl.signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as Partial<QueryResult>;
			return { columns: body.columns ?? [], dataset: body.dataset ?? [] };
		} finally {
			clearTimeout(timer);
		}
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "QuestDBClient"`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/advisor/questdb.ts src/test/advisor.test.ts
git commit -m "feat(advisor): add QuestDB HTTP client"
```

---

## Task 3: Historic-path query

**Files:**
- Modify: `src/advisor/questdb.ts`
- Test: `src/test/advisor.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts`:

```typescript
import { fetchHistoricPaths } from "../advisor/questdb.js";

describe("fetchHistoricPaths", () => {
	it("merges signalk, signalk_str, and signalk_position rows", async () => {
		const responses: Record<string, unknown> = {
			signalk: {
				columns: [],
				dataset: [["navigation.speedThroughWater", 1200, "2026-05-16T09:00:00.000000Z"]],
			},
			signalk_str: {
				columns: [],
				dataset: [["navigation.gnss.methodQuality", 30, "2026-05-16T08:00:00.000000Z"]],
			},
			signalk_position: {
				columns: [],
				dataset: [[900, "2026-05-16T09:30:00.000000Z"]],
			},
		};
		const fetchImpl = (async (url: string) => {
			const table = url.includes("signalk_position")
				? "signalk_position"
				: url.includes("signalk_str")
					? "signalk_str"
					: "signalk";
			return {
				ok: true,
				status: 200,
				json: async () => responses[table],
			} as Response;
		}) as typeof fetch;

		const client = new QuestDBClient({ url: "http://h:9000" }, fetchImpl);
		const paths = await fetchHistoricPaths(client, 7);
		expect(paths.get("navigation.speedThroughWater")?.samples).toBe(1200);
		expect(paths.get("navigation.gnss.methodQuality")?.samples).toBe(30);
		expect(paths.get("navigation.position")?.samples).toBe(900);
	});

	it("omits navigation.position when signalk_position has no rows", async () => {
		const fetchImpl = (async (url: string) => ({
			ok: true,
			status: 200,
			json: async () =>
				url.includes("signalk_position")
					? { dataset: [[0, null]] }
					: { dataset: [] },
		})) as typeof fetch;
		const client = new QuestDBClient({ url: "http://h:9000" }, fetchImpl);
		const paths = await fetchHistoricPaths(client, 7);
		expect(paths.has("navigation.position")).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "fetchHistoricPaths"`
Expected: FAIL (`fetchHistoricPaths` not exported).

- [ ] **Step 3: Implement the query**

Append to `src/advisor/questdb.ts`:

```typescript
function toStats(row: unknown[]): { samples: number; lastSeen: string } {
	const samples = typeof row[1] === "number" ? row[1] : 0;
	const lastSeen = typeof row[2] === "string" ? row[2] : "";
	return { samples, lastSeen };
}

/**
 * Distinct Signal K paths recorded in QuestDB within the last `lookbackDays`
 * days, with a sample count and last-seen timestamp per path. Reads the
 * numeric `signalk` and string `signalk_str` tables, and treats any rows in
 * `signalk_position` as the `navigation.position` path. `lookbackDays` is a
 * validated positive integer from config, so it is safe to interpolate.
 */
export async function fetchHistoricPaths(
	client: QuestDBClient,
	lookbackDays: number,
): Promise<HistoricPaths> {
	const since = `dateadd('d', -${Math.trunc(lookbackDays)}, now())`;
	const out: HistoricPaths = new Map();

	for (const table of ["signalk", "signalk_str"]) {
		const r = await client.query(
			`SELECT path, count() samples, max(ts) last_seen FROM ${table} WHERE ts > ${since} GROUP BY path`,
		);
		for (const row of r.dataset) {
			if (typeof row[0] === "string") out.set(row[0], toStats(row));
		}
	}

	const pos = await client.query(
		`SELECT count() samples, max(ts) last_seen FROM signalk_position WHERE ts > ${since}`,
	);
	const posRow = pos.dataset[0];
	if (posRow && typeof posRow[0] === "number" && posRow[0] > 0) {
		out.set("navigation.position", {
			samples: posRow[0],
			lastSeen: typeof posRow[1] === "string" ? posRow[1] : "",
		});
	}

	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "fetchHistoricPaths"`
Expected: PASS (2 cases).

- [ ] **Step 5: Commit**

```bash
git add src/advisor/questdb.ts src/test/advisor.test.ts
git commit -m "feat(advisor): add historic-path QuestDB query"
```

---

## Task 4: Merge historic paths into the inventory

**Files:**
- Modify: `src/advisor/inventory.ts`
- Test: `src/test/advisor.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts`:

```typescript
import { mergeHistoric } from "../advisor/inventory.js";

describe("mergeHistoric", () => {
	it("annotates a live path and adds a historic-only path", () => {
		const live = [
			{ path: "environment.wind.speedApparent", live: true, liveSources: ["wind.5"] },
		];
		const historic = new Map([
			["environment.wind.speedApparent", { samples: 100, lastSeen: "t1" }],
			["navigation.speedThroughWater", { samples: 50, lastSeen: "t2" }],
		]);
		const merged = mergeHistoric(live, historic);
		const wind = merged.find((e) => e.path === "environment.wind.speedApparent");
		expect(wind?.historic?.samples).toBe(100);
		const stw = merged.find((e) => e.path === "navigation.speedThroughWater");
		expect(stw?.live).toBe(false);
		expect(stw?.liveSources).toEqual([]);
		expect(stw?.historic?.samples).toBe(50);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "mergeHistoric"`
Expected: FAIL (`mergeHistoric` not exported).

- [ ] **Step 3: Implement the merge**

Append to `src/advisor/inventory.ts` (add the `HistoricPaths` import to the existing `./types.js` import line):

```typescript
/**
 * Fold QuestDB history into a live inventory: a live path gains its
 * `historic` stats, and a path seen only in history is appended as a
 * non-live entry. The result is sorted by path for stable output.
 */
export function mergeHistoric(
	live: PathInventory,
	historic: HistoricPaths,
): PathInventory {
	const byPath = new Map(live.map((e) => [e.path, { ...e }]));
	for (const [path, stats] of historic) {
		const existing = byPath.get(path);
		if (existing) {
			existing.historic = stats;
		} else {
			byPath.set(path, { path, live: false, liveSources: [], historic: stats });
		}
	}
	return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "mergeHistoric"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/advisor/inventory.ts src/test/advisor.test.ts
git commit -m "feat(advisor): merge QuestDB history into the inventory"
```

---

## Task 5: Historic-origin recommendations

**Files:**
- Modify: `src/advisor/recommender.ts`
- Test: `src/test/advisor.test.ts` (append)

A conversion whose matched paths are all historic-only (no live entry) is recommended with `origin: "historic"` and `confidence: "low"`. A conversion with at least one live matched path keeps `origin: "live"` / `confidence: "high"`. The bus rule is unchanged: historic-only entries have empty `liveSources`, so they are never treated as bus-origin.

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts`:

```typescript
describe("recommend with historic paths", () => {
	it("marks a historic-only match as low-confidence historic origin", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.speedThroughWater",
					live: false,
					liveSources: [],
					historic: { samples: 50, lastSeen: "t" },
				},
			],
			metadata: [meta("SPEED", ["navigation.speedThroughWater"])],
			currentConfig: {},
		});
		const speed = recs.find((r) => r.optionKey === "SPEED");
		expect(speed?.action).toBe("enable");
		expect(speed?.origin).toBe("historic");
		expect(speed?.confidence).toBe("low");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "recommend with historic"`
Expected: FAIL (`origin` is `"live"`, `confidence` is `"high"`).

- [ ] **Step 3: Update the recommender**

In `src/advisor/recommender.ts`, inside the `for (const conv of metadata)` loop, after `matched` is computed and before the `allBusOrigin` block, derive whether any matched path is live:

```typescript
		const anyLive = matched.some((p) => byPath.get(p)?.live === true);
		const origin: Recommendation["origin"] = anyLive ? "live" : "historic";
		const confidence: Recommendation["confidence"] = anyLive ? "high" : "low";
```

Then in BOTH `out.push({ ... })` calls in this function, replace the hardcoded
`confidence: "high"` and `origin: "live"` lines with `confidence,` and
`origin,` (the shorthand referencing the variables above). Leave the rest of
each pushed object unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts -t "recommend"`
Expected: PASS (all `recommend` cases, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/advisor/recommender.ts src/test/advisor.test.ts
git commit -m "feat(advisor): mark historic-only matches as low-confidence"
```

---

## Task 6: QuestDB branch in the orchestrator

**Files:**
- Modify: `src/advisor/advisor.ts`
- Test: `src/test/advisor.test.ts` (append)

`AdvisorDeps` gains an optional `fetchHistoric`. `runReview` reads
`config.advisor.questdb`; when enabled and `fetchHistoric` is supplied, it
merges history into the inventory. A QuestDB failure is caught and surfaced
as a `notes` entry, never thrown.

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor.test.ts`:

```typescript
describe("Advisor.runReview with QuestDB", () => {
	it("merges historic paths when questdb is enabled", async () => {
		const deps = advisorDeps({
			buildInventory: () => [],
			getMetadata: () => [meta("SPEED", ["navigation.speedThroughWater"])],
			readConfig: () => ({
				conversions: {},
				advisor: {
					...DEFAULT_ADVISOR_CONFIG,
					questdb: { enabled: true, url: "http://h:9000", lookbackDays: 7 },
				},
			}),
			fetchHistoric: async () =>
				new Map([
					["navigation.speedThroughWater", { samples: 9, lastSeen: "t" }],
				]),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.autoApplied.map((r) => r.optionKey)).toEqual(["SPEED"]);
	});

	it("notes a QuestDB failure and continues live-only", async () => {
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {},
				advisor: {
					...DEFAULT_ADVISOR_CONFIG,
					questdb: { enabled: true, url: "http://h:9000", lookbackDays: 7 },
				},
			}),
			fetchHistoric: async () => {
				throw new Error("ECONNREFUSED");
			},
		});
		const result = await new Advisor(deps).runReview();
		expect(result.notes.some((n) => n.includes("QuestDB"))).toBe(true);
	});
});
```

The `advisorDeps` helper in this file builds an `AdvisorDeps`; it accepts a
`Partial<AdvisorDeps>` of overrides, so `fetchHistoric` passes through once
the type below adds it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor.test.ts -t "runReview with QuestDB"`
Expected: FAIL (`fetchHistoric` not on `AdvisorDeps`; history not merged).

- [ ] **Step 3: Update the orchestrator**

In `src/advisor/advisor.ts`:

Add the imports (merge into the existing `./types.js` import; add the new ones):

```typescript
import { mergeHistoric } from "./inventory.js";
import type { HistoricPaths } from "./types.js";
```

Add `fetchHistoric` to `AdvisorDeps`:

```typescript
	/** Optional QuestDB history fetch. Absent or undefined skips QuestDB. */
	fetchHistoric?: (url: string, lookbackDays: number) => Promise<HistoricPaths>;
```

Replace the inventory line in `runReview` (`inventory: this.deps.buildInventory(),` inside the `recommend({ ... })` call) with a pre-computed `inventory` built above the `recommend` call:

```typescript
		const notes: string[] = [];
		let inventory = this.deps.buildInventory();

		const questdb = this.questdbConfig(config);
		if (questdb?.enabled && this.deps.fetchHistoric) {
			try {
				const historic = await this.deps.fetchHistoric(
					questdb.url,
					questdb.lookbackDays,
				);
				inventory = mergeHistoric(inventory, historic);
			} catch (err) {
				notes.push(
					`QuestDB history unavailable (${err instanceof Error ? err.message : String(err)}); reviewed live data only.`,
				);
			}
		}

		const recs = recommend({
			inventory,
			metadata: this.deps.getMetadata(),
			currentConfig: conversions,
		});
```

Change the final return so it uses the collected `notes`:

```typescript
		return { ranAt: now.toISOString(), autoApplied, pending, notes };
```

Add the private helper at the end of the class (beside `conversionsOf`):

```typescript
	private questdbConfig(
		config: Record<string, unknown>,
	): { enabled: boolean; url: string; lookbackDays: number } | null {
		const advisor = config.advisor;
		if (!advisor || typeof advisor !== "object") return null;
		const q = (advisor as { questdb?: unknown }).questdb;
		if (!q || typeof q !== "object") return null;
		const { enabled, url, lookbackDays } = q as Record<string, unknown>;
		if (typeof url !== "string" || typeof lookbackDays !== "number") return null;
		return { enabled: enabled === true, url, lookbackDays };
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor.test.ts`
Expected: PASS (every block, including the prior runReview/applyReview tests).

- [ ] **Step 5: Commit**

```bash
git add src/advisor/advisor.ts src/test/advisor.test.ts
git commit -m "feat(advisor): query QuestDB history during a review"
```

---

## Task 7: Wire QuestDB in the plugin

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Supply fetchHistoric**

In `src/index.ts`, add the imports beside the advisor ones:

```typescript
import { QuestDBClient, fetchHistoricPaths } from "./advisor/questdb.js";
```

Add `fetchHistoric` to the `new Advisor({ ... })` deps object:

```typescript
		fetchHistoric: (url, lookbackDays) =>
			fetchHistoricPaths(new QuestDBClient({ url }), lookbackDays),
```

A fresh `QuestDBClient` per review is fine: a review is user-triggered or on
a multi-day timer, never a hot path, and the client holds no state.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(advisor): wire the QuestDB client into the plugin"
```

---

## Task 8: QuestDB connectivity endpoint

**Files:**
- Modify: `src/advisor/advisor.ts`, `src/api/router.ts`, `src/api/types.ts`
- Test: `src/test/api.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append inside the `describe("API router", ...)` block in `src/test/api.test.ts`:

```typescript
	it("GET /api/advisor/questdb-test reports reachability", async () => {
		const advisor = {
			runReview: async () => ({ ranAt: "", autoApplied: [], pending: [], notes: [] }),
			getPending: () => [],
			applyReview: async () => {},
			testQuestDB: async () => ({ ok: true }),
		};
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => advisor,
		);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/questdb-test",
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/api.test.ts -t "questdb-test"`
Expected: FAIL (route 404s).

- [ ] **Step 3: Add `testQuestDB` to the Advisor**

In `src/advisor/advisor.ts`, add a `probeQuestDB` dep to `AdvisorDeps`:

```typescript
	/** Optional QuestDB reachability probe for the connectivity endpoint. */
	probeQuestDB?: (url: string) => Promise<boolean>;
```

Add the public method to the `Advisor` class (beside `getPending`):

```typescript
	/** Probe QuestDB using the configured url. Reports `ok: false` if the
	 * probe is unavailable or QuestDB is unreachable. */
	async testQuestDB(): Promise<{ ok: boolean }> {
		const questdb = this.questdbConfig(this.deps.readConfig());
		if (!questdb || !this.deps.probeQuestDB) return { ok: false };
		return { ok: await this.deps.probeQuestDB(questdb.url) };
	}
```

- [ ] **Step 4: Add the route**

In `src/api/router.ts`, add inside the advisor routes block (after `/api/advisor/apply`):

```typescript
		router.get(
			"/api/advisor/questdb-test",
			advisorRoute(async (advisor, _req, res) => {
				res.json(await advisor.testQuestDB());
			}),
		);
```

- [ ] **Step 5: Wire `probeQuestDB` in `index.ts`**

In `src/index.ts`, add to the `new Advisor({ ... })` deps:

```typescript
		probeQuestDB: (url) => new QuestDBClient({ url }).probe(),
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/test/api.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/advisor/advisor.ts src/api/router.ts src/index.ts src/test/api.test.ts
git commit -m "feat(advisor): add QuestDB connectivity test endpoint"
```

Note: `src/api/types.ts` needs no change; the endpoint returns the inline
`{ ok: boolean }` shape, which has no shared consumer.

---

## Task 9: Final verification

- [ ] **Step 1: Full suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass; both builds succeed.

- [ ] **Step 2: Manual smoke check**

Rebuild and restart signalk. In the panel, enable QuestDB under the advisor
settings, click "Review now", and confirm a path present only in QuestDB
history (not live) appears as a recommendation. Stop QuestDB and confirm the
review still completes with a "QuestDB history unavailable" note.

---

## Self-Review

- **Spec coverage:** QuestDB client (4.2), historic inventory (4.1), historic-origin recommendations (5), the connectivity endpoint (8). The look-back window is the `questdb.lookbackDays` setting from the Phase 1.5 settings panel.
- **Optional:** QuestDB disabled (default) skips every QuestDB path; an unreachable QuestDB is caught and noted, never thrown. `fetchHistoric` and `probeQuestDB` are optional deps, so unit tests of the deterministic core need not supply them.
- **No new dependencies:** `QuestDBClient` uses the Node 22 global `fetch`.
- **Placeholder scan:** none; every step has complete code.
- **Type consistency:** `HistoricStats` / `HistoricPaths` defined in Task 1 and used by `questdb.ts`, `inventory.ts`, `advisor.ts`. `fetchHistoric` signature `(url, lookbackDays) => Promise<HistoricPaths>` is defined in Task 6 and supplied in Task 7.
