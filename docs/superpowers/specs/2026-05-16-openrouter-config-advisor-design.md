# OpenRouter Config Advisor: Design

Date: 2026-05-16
Status: approved for planning
Project: signalk-nmea2000-emitter-cannon

## 1. Overview

An optional subsystem that reviews the Signal K paths a boat publishes and
recommends which of the plugin's conversions to enable. It pairs a
deterministic recommender (free, offline, reliable) with an optional OpenRouter
call that handles ambiguous cases and writes plain-language rationales. The
whole feature is dormant unless explicitly turned on, and it works with no
OpenRouter key and no QuestDB.

The goal is to remove the guesswork from configuring 45+ conversions: a user
should not have to know which Signal K path maps to which PGN.

## 2. Goals and non-goals

### Goals

- Recommend which conversions to enable based on observed Signal K paths.
- Distinguish Signal-K-native data from data already on the NMEA 2000 bus, so
  the advisor does not enable a conversion that would echo bus data back.
- Optionally use QuestDB history to surface paths that are not live right now.
- Let an optional OpenRouter call refine ambiguous recommendations and explain
  each recommendation in plain language.
- Re-review on demand and on a periodic schedule.
- Every option in the UI carries a tooltip so the user does not need to guess.

### Non-goals (v1)

- The advisor recommends enable/disable and the per-conversion source filter
  only. It does not populate the instance-mapping editors (battery banks,
  engine maps, tank instances). Mapping stays manual.
- No active inbound NMEA 2000 bus listening. Bus-origin detection is inferred
  from each path's Signal K `$source`.
- No new-path event trigger and no on-start review. Triggers are the manual
  button and the periodic interval only.
- The advisor does not generate the entire config from scratch with an LLM.
  Deterministic rules do the path-to-conversion matching.

## 3. Resolved design decisions

| Decision | Choice |
|---|---|
| Trust model | Hybrid. Confident enables auto-apply. Disables and source-filter changes are parked for user approval. |
| Bus detection | Source-based. A path whose only live `$source` is an N2K device is treated as already on the bus and not recommended. |
| QuestDB | Optional, off by default. Local, queried over the HTTP REST API. Absent or unreachable QuestDB yields a live-only inventory with a non-fatal note. |
| Architecture | Deterministic recommender plus an optional OpenRouter reasoning and explanation layer. |
| Advisor scope | Enable/disable plus source filter. Mapping editors stay manual. |
| Re-review triggers | Manual "Review now" button plus an optional periodic interval. |
| Scheduling mechanism | A simple interval timer reusing the plugin-manager timer pattern. The `croner` dependency is not added. |
| UI placement | A new collapsible section below the Status dashboard, collapsed by default. |

## 4. Architecture

A new `src/advisor/` directory inside the existing single plugin, consistent
with the one-package rule. Six focused modules:

### 4.1 `inventory.ts`

Builds a `PathInventory`. Each entry: the Signal K path, whether it is live,
its live `$source` labels (from the existing `src/api/discovery.ts`), and
historic stats from QuestDB when enabled (sample count, last-seen timestamp).

```ts
interface PathInventoryEntry {
  path: string;
  live: boolean;
  liveSources: string[];        // empty when not live
  historic?: { samples: number; lastSeen: string };  // present only with QuestDB
}
type PathInventory = PathInventoryEntry[];
```

### 4.2 `questdb.ts`

A QuestDB HTTP client modeled on `signalk-openrouter-companion`'s
`QuestDBClient`. Config is `{ url: string }`. Methods:

- `probe(signal?)`: runs `SELECT 1`, returns whether QuestDB is reachable.
- `query(sql, signal?)`: `fetch` to `${url}/exec?query=<encoded>`, returns
  `{ columns, dataset }`.

Historic-path enumeration within the lookback window:

```sql
SELECT path, count() samples, max(ts) last_seen
FROM signalk WHERE ts > dateadd('d', -<N>, now()) GROUP BY path;

SELECT path, count() samples, max(ts) last_seen
FROM signalk_str WHERE ts > dateadd('d', -<N>, now()) GROUP BY path;
```

A non-empty result on `signalk_position` within the window means
`navigation.position` was logged. QuestDB stores scalar time-series only
(`DOUBLE` and `VARCHAR` values, position decomposed to `lat`/`lon`), so no
array-valued path appears. Zero new dependencies: Node 22 global `fetch`.
All queries run under a short timeout via `AbortSignal`.

### 4.3 `recommender.ts`

The deterministic core. It walks the conversion registry (the plugin already
exposes each module's `optionKey`, `title`, `category`, and `keys` through
`PluginManager.getConversionMetadata()`), matches inventory paths to
conversions by their declared `keys`, applies the bus rule (section 5), and
emits recommendations:

```ts
interface Recommendation {
  optionKey: string;
  action: 'enable' | 'disable' | 'keep';
  currentlyEnabled: boolean;
  matchedPaths: string[];
  confidence: 'high' | 'low';
  origin: 'live' | 'historic' | 'none';
  reason: string;               // filled by the LLM layer, or a default
}
```

This module has no network and no LLM dependency. It is the foundation and
runs even with OpenRouter and QuestDB both disabled.

### 4.4 `openrouter.ts`

The optional LLM layer, modeled on the companion's `OpenRouterClient`: a
retry/backoff ladder, transient (`429`, `5xx`) versus terminal (`4xx`) status
sets, an `OpenRouterError` type, and abort/timeout handling, sending
`HTTP-Referer` and `X-OpenRouter-Title`. It is extended beyond the companion
with a structured-output request: `response_format` of type `json_schema`
with `strict: true`, and `provider: { require_parameters: true }` so the
request only routes to providers that honor the schema.

Input to the call: the deterministic recommendations, the ambiguous and
unmatched paths, and the conversion catalog. Output: refined judgments for the
ambiguous items plus a plain-language `reason` for each recommendation. The
plugin's `openrouter-config-expert` agent informed this design.

### 4.5 `advisor.ts`

The orchestrator.

- `runReview()`: build inventory, run the recommender, optionally enrich via
  OpenRouter, return a `ReviewResult`.
- `applyReview(result, decisions)`: apply auto-approved enables and
  user-approved items through the existing config save path.

```ts
interface ReviewResult {
  ranAt: string;
  autoApplied: Recommendation[];   // confident enables, already written
  pending: Recommendation[];       // disables and source-filter changes
  notes: string[];                 // non-fatal warnings (QuestDB down, LLM skipped)
}
```

### 4.6 `schedule.ts`

A periodic interval timer reusing the plugin-manager timer pattern. When
`schedule.periodic` is on, it fires `runReview()` every `intervalDays`. A
scheduled run auto-applies the enables and leaves `pending` items for the UI.

### 4.7 `budget.ts`

A per-UTC-day OpenRouter call cap modeled on the companion's `BudgetTracker`.
Persisted to a small state file, with UTC-day rollover and a synchronous
`canSpend()` / `recordCall()`. Bounds spend if the scheduler misbehaves.

## 5. Bus-detection rule

For each candidate path:

1. If the path is live, read its `$source` labels via
   `enumerateSourcesForPath`. If every live source is an N2K device, the data
   is already on the bus. The conversion is not recommended (enabling it would
   echo, the same hazard the existing AIS `$source: 'NMEA2000'` guard
   addresses).
2. If the path has at least one non-N2K live source, it is a conversion
   candidate at `high` confidence.
3. If the path is historic-only (present in QuestDB, not live), there is no
   source data. It is a candidate at `low` confidence with `origin: 'historic'`.

Enabling is the safe direction: a conversion with no live data simply sits
idle. So `enable` recommendations, including `low`-confidence historic ones,
are eligible for auto-apply. `disable` recommendations are never auto-applied.

Identifying an "N2K device" source: a source label produced by the Signal K
NMEA 2000 provider. The recommender uses a small predicate (canboatjs-style
source labels and the known N2K provider id) that can be refined during
implementation.

## 6. Data flow

1. Trigger: the manual "Review now" button or the periodic timer.
2. Inventory: live discovery always; QuestDB only when `questdb.enabled` and
   reachable.
3. Recommender: deterministic path-to-conversion match plus the bus rule.
4. Optional OpenRouter pass: refine ambiguous items, attach a `reason` to each
   recommendation. Skipped when OpenRouter is disabled, has no key, or the
   budget is exhausted.
5. Split by the hybrid trust model: confident enables go to `autoApplied`;
   disables and source-filter changes go to `pending`.
6. `autoApplied` is written immediately via the existing save path.
7. The panel shows `autoApplied` (informational) and `pending` with per-item
   Approve/Reject.

## 7. Config schema additions

A new `advisor` block in the TypeBox `RootConfig`, every field defaulted so an
existing config with no `advisor` block loads unchanged.

```
advisor: {
  enabled:    boolean   // default false, master switch for the whole feature
  openRouter: {
    enabled:        boolean   // default false
    apiKey:         string    // default "", env OPENROUTER_API_KEY overrides
    model:          string    // default chosen at implementation time
    maxCallsPerDay: integer   // default 25, >= 0
  }
  questdb: {
    enabled:      boolean   // default false
    url:          string    // default "http://localhost:9000"
    lookbackDays: integer   // default 7, >= 1
  }
  schedule: {
    periodic:     boolean   // default false
    intervalDays: integer   // default 7, >= 1
  }
}
```

API key precedence: the `OPENROUTER_API_KEY` environment variable, when set,
overrides `advisor.openRouter.apiKey`, so the key need not be persisted to
`plugin-config.json`.

## 8. API endpoints

New routes under the existing `/plugins/signalk-nmea2000-emitter-cannon/api/`
prefix, admin-gated by the same `securityStrategy.addAdminMiddleware` the
current router uses:

- `POST /api/advisor/review`: run a review, return a `ReviewResult`. Does not
  apply `pending` items.
- `POST /api/advisor/apply`: apply a set of user-approved decisions.
- `GET  /api/advisor/pending`: the last review's `pending` items.
- `POST /api/advisor/test-key`: validate the OpenRouter key with a cheap call.
- `GET  /api/advisor/questdb-test`: probe QuestDB reachability.

## 9. UI

A new collapsible "Config Advisor" section in the React panel, placed below the
Status dashboard, collapsed by default.

### 9.1 Settings sub-panel

- Master toggle for the whole feature.
- OpenRouter: a masked API-key field with a "Test key" button, a model field.
- QuestDB: an enable toggle, a REST URL field with a "Test" button, a lookback
  slider in days.
- Periodic re-review: an enable toggle and an interval in days.

Every setting row carries a `?` tooltip with a one-line plain-language
explanation, reusing the inline-help pattern already used by the mapping
editors. Example: "Look back: how far into QuestDB history to search for paths
that are not live right now. Longer catches seasonal gear; shorter is faster."

### 9.2 Review result

- A "Review now" button and the timestamp of the last review.
- `autoApplied`: a green informational list of conversions that were enabled.
- `pending`: an amber list, one row per item, each showing the LLM rationale
  and Approve / Reject controls.

New panel components live under `src/panel/components/advisor/`. A new
`useAdvisor` hook owns the review and apply calls, alongside the existing
`useStatus`, `useConfig`, `useSources` hooks.

## 10. Error handling

The advisor never crashes the plugin or corrupts config.

- QuestDB disabled, unreachable, or slow: skip it, build a live-only inventory,
  add a non-fatal note. A short query timeout is enforced via `AbortSignal`.
- OpenRouter missing key, disabled, `402`, `429`, or network error: fall back
  to deterministic-only recommendations with default reasons, add a warning.
  Respect `Retry-After`; the client's bounded backoff ladder caps retries.
- OpenRouter returns malformed or non-schema JSON: validate against the TypeBox
  schema, attempt one bounded repair turn, then fall back to deterministic-only.
- An LLM-proposed `optionKey` unknown to the registry is dropped. The TypeBox
  `Record` does not reject unknown keys, so this allowlist check is mandatory.
- Budget exhausted for the day: skip the OpenRouter pass, note it, continue
  deterministically.
- Apply failure: report it. Writes go through the existing atomic save path, so
  a failure leaves config in its prior valid state.
- The whole subsystem is behind `advisor.enabled` (default off): any advisor
  fault is contained and the emitter keeps running.

## 11. Testing

- `recommender`: unit tests mapping synthetic inventories to expected
  recommendations. Fully deterministic, no network.
- `questdb`: tests against mocked HTTP responses shaped like the real
  `signalk`, `signalk_str`, and `signalk_position` tables, including an
  unreachable-host case.
- `openrouter`: mocked responses including malformed JSON to exercise the
  repair-then-fallback path, and the transient-versus-terminal status handling.
- `budget`: UTC-day rollover and cap enforcement.
- `inventory`: live discovery mocked, with and without QuestDB.
- `advisor`: the orchestrator's auto-apply versus pending split.
- Schema: the new `advisor` block, plus a migration test confirming a config
  with no `advisor` block loads with defaults.
- The advisor is off by default, so the existing 57 tests are unaffected.

## 12. Phasing

Build order within the implementation plan:

1. Deterministic advisor on live data, the `advisor` config block, the API
   endpoints, and the review/apply UI with the hybrid trust model. No
   OpenRouter, no QuestDB.
2. QuestDB historic input and the lookback control.
3. The OpenRouter enrichment layer: client, structured output, budget tracker,
   rationales, key field and test endpoint.
4. The periodic interval scheduler.

Each phase is independently shippable: phase 1 alone is a working, useful
advisor.

## 13. Consistency with signalk-openrouter-companion

The sibling plugin `signalk-openrouter-companion` already implements OpenRouter
and QuestDB integration. This design mirrors its `QuestDBClient` and
`OpenRouterClient` shapes and its `BudgetTracker`, and reuses its config field
names (`questdb.url`, `openRouter.apiKey`, `openRouter.model`,
`openRouter.maxCallsPerDay`) so a user running both plugins sees a consistent
configuration surface. The clients are re-implemented here, not imported: the
two plugins stay independent npm packages.
