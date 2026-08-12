# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow rules

- **Never push without explicit ok.** Local commits and tags are fine; do not run `git push`, `git push --tags`, `npm publish`, `npm run release`, `gh pr create`, or `gh pr edit` until the user explicitly says to push. Workflows that naturally end in a push stop one step short and wait for the go-ahead.

## Documentation layout

Docs are organized by audience so the repo root stays clean (the root is the first impression on both npm and GitHub). Keep this layout:

- **Root**: `README.md`, `CHANGELOG.md`, `LICENSE`, `CLAUDE.md`, and tooling files only (`package.json`, `biome.json`, `tsconfig*.json`, `vitest.config.mts`, `webpack.config.cjs`). Do not add other docs to the root.
- **`.github/`**: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` (GitHub auto-surfaces these from `.github/` exactly as from root), plus issue/PR templates and workflows. Files here reach the root with `../`.
- **`docs/`**: user and contributor reference: `pgn-reference.md`, `troubleshooting.md`, `development.md`.
- **`docs/decisions/`**: design-decision and spike memos (dated, e.g. the React config panel design/plan).
- **`docs/maintainers/`**: release and QA docs (`releasing.md`).

`README.md` is the npm package page (npm renders only `README.md`): keep it a landing page, not a reference manual. Identity and value first, then features, requirements, install, config, then a Documentation links section and meta sections. Deep reference lives in `docs/` and is linked. After moving any markdown file, re-verify every relative link (subdirectory files reach the root with `../`).

The `package.json` `description` is the npm subtitle and search snippet: keep it tight and free of low-signal filler.

### Release notes rule

`README.md` has a single **What's new in X.Y.Z** section, placed right after the intro and upstream-credit blockquote and before "What it does". It carries ONLY the most recent release and is overwritten on every release (never an accumulating list). Its body is 3 to 5 bolded bullets sourced from the new `CHANGELOG.md` entry, ending with a line that links the CHANGELOG version anchor and the full release history. `CHANGELOG.md` uses Keep a Changelog headers: H1 `# Changelog`, `## [Unreleased]`, and releases as `## [X.Y.Z] - YYYY-MM-DD` with an `<a id="vXYZ"></a>` anchor above each. Overwriting the README section is a step in the release checklist at `docs/maintainers/releasing.md`.

## Project Overview

Signal K NMEA 2000 Emitter Cannon is a TypeScript Signal K server plugin that converts Signal K marine navigation data to NMEA 2000 format. It supports 46 conversion modules emitting 53 data PGNs (plus 5 bus-layer PGNs announced in the transmit list) with Garmin compatibility.

## Common Commands

```bash
npm run build          # Production build (esbuild → dist/index.mjs)
npm run build:watch    # Development build with watch mode
npm test               # Run all tests (Vitest)
npm run test:ui        # Run tests with interactive UI
npm run test:coverage  # Run tests with coverage report
npm run check          # Strict TypeScript validation for runtime, panel, and tests
npm run lint           # Code, Markdown, and spelling checks
npm run cruise         # Module-boundary and cycle checks
npm run deadcode       # Unused file, dependency, and export checks
npm run format         # Biome auto-format with --write
npm run verify         # Full local verification gate
npm run verify:release # Verify package contents and security audits too
```

## Architecture

### Entry Point and Plugin Lifecycle

- `src/index.ts` - Factory function `createPlugin(app)` returns `SignalKPlugin` with `start()`, `stop()`, `schema()`
- `src/plugin-manager.ts` - Core lifecycle manager that loads conversions, sets up Signal K subscriptions, handles resend timers

### Conversion Module Pattern

All 46 modules in `src/conversions/` follow this factory pattern:

```typescript
export default function createXxxConversion(app: SignalKApp): ConversionModule<T> {
  return {
    title: "Name (PGN XXXXX)",
    optionKey: "CONVERSION_KEY",
    keys: ["signal.k.path"],
    callback: (value) => N2KMessage[],
    tests: [{ input: [...], expected: [...] }]
  }
}
```

The registry `src/conversions/index.ts` imports all factories and exports `createConversionModules(app, plugin)`.

### Type System

- `src/types/plugin.ts` - `ConversionModule<T>`, `SignalKPlugin`, plugin interfaces
- `src/types/nmea2000.ts` - `N2KMessage`, field validation types
- `src/types/signalk.ts` - `SignalKApp` (extends `ServerAPI` with the `nmea2000JsonOut` / `nmea2000OutAvailable` event signatures and the `isNmea2000OutAvailable` sync mirror)

### Utilities

- `src/utils/messageUtils.ts` - N2K message validation (`validateN2KMessage`), formatting (`formatN2KMessage`), cleaning (`cleanN2KMessage`)
- `src/utils/pathUtils.ts` - `pathToPropName()` for config keys, `isDefined()` type guard, `stripSubIndex()` (strips the `[N]` sub-conversion suffix) and its inverse `subIndexKey(parent, idx)` (builds `PARENT[idx]`), kept side by side so the suffix format lives in one place and is shared by plugin-manager and the panel; `matchPathPrefix<T>(path, table)` first-prefix-match lookup used by `notifications.ts` (alertCategory routing) and `raymarineAlarms.ts` (alarmId mapping)
- `src/utils/dateUtils.ts` - NMEA 2000 date/time conversions (`toN2KDate`, `toN2KTime`, `toN2KDateTime`)
- `src/utils/errorUtils.ts` - `errMessage(err)` coercion helper for `unknown`-typed thrown values
- `src/utils/validation.ts` - Input validation (`isValidNumber`, `toValidNumber` - rejects NaN/Infinity to null, `toFiniteOrUndefined` - the same coercion but to undefined for fields that are omitted rather than nulled), `normalizeAngle()`, `toUnsignedAngle()` (the single choke point for unsigned uint16 angle fields: nullish passes through, non-finite returns undefined, everything else is wrapped to [0, 2pi); the encoder otherwise wraps negatives by the field modulus, not 2 pi), `isPlainObject()` (shared unknown-narrowing guard used by migrate, the router, the advisor, and the panel), `clampString()` (truncates a value so it cannot overflow an NMEA 2000 string field), `resolveInstanceAndSource(options, defaultInstance, defaultSource)` (the shared reader for the per-conversion `instance` and `n2kSource` extras on the temperature and humidity factories: reads the flattened production option shape, falls back to the per-source default, and clamps the instance to the encodable uint8 data range)
- `src/utils/notificationUtils.ts` - `isClearState(state)`: true for the non-alert Signal K states (`normal`, `nominal`); shared by `notifications.ts` and `raymarineAlarms.ts`
- `src/utils/aisUtils.ts` - AIS shared helpers: `starboardOffset()` (NaN-safe beam/offset to from-starboard conversion), `parseMmsi()`, `parseImo()`, `AisShipType` interface, and string-length caps (`AIS_NAME_CHARS`, `AIS_CALLSIGN_CHARS`, `AIS_DESTINATION_CHARS`, `AIS_SAFETY_TEXT_CHARS`, `ATON_NAME_CHARS`); imported by `ais.ts`, `aisExtended.ts`, and `dscCalls.ts`
- `src/utils/pgnUtils.ts` - `extractPgnsFromTitle(title)` parses PGN numbers out of a conversion title string (used by the conversion registry to derive the 126464 transmit list and by the panel's PGN summary lookup); `splitPgnTitle(title)` splits a title into its description and PGN array for display
- `src/utils/smoothing.ts` - `ExponentialSmoother` class for sensor data smoothing
- `src/constants.ts` - Standard N2K values (`N2K_DEFAULT_PRIORITY`, `N2K_BROADCAST_DST`, `N2K_DEFAULT_SID`, `N2K_SID_ZERO`, `N2K_DEFAULT_INSTANCE`, `MAX_TANK_INSTANCE`, `MAX_N2K_INSTANCE` (252, the highest encodable value of the 8-bit temperature/humidity instance field), `DEFAULT_DATA_TIMEOUT_MS`, `VESSELS_SELF_CONTEXT`, `STREAM_DEBOUNCE_MS`)
- `src/config/raymarinePreset.ts` - `RAYMARINE_EXTRAS_PATCH` (the single source of truth mapping the inside-family temperature and inside-humidity optionKeys to their `{ n2kSource, instance }` remap) plus `raymarinePresetsFor(optionKey)` (the preset-tag helper shared by `temperature.ts` and `humidity.ts`). The one-click Raymarine preset reads the patch in the panel reducer; Axiom and i70 render only the `Inside Temperature` / `Inside` sources and separate sensors by instance, so the preset collapses the inside-family sources onto `Inside` at instances 0 to 4. The per-conversion `n2kSource` and `instance` extras editors live in `extras-meta.ts` (`TEMPERATURE_META`, `HUMIDITY_META`, both a `fields` meta with a `number` instance and a `select` source type).
- `src/conversions/routeTypes.ts` - Shared `Position`/`Waypoint` interfaces, `DEFAULT_ROUTE_NAME`, the waypoint candidate ceiling (`MAX_CANDIDATE_WAYPOINTS`, shared by both route PGNs), name-length caps (`MAX_WP_NAME_CHARS`, `MAX_ROUTE_NAME_CHARS`), the shared `markTypeFor()` mark-type mapping (PGN 129301/129302), `toWaypointEntry()` (the shared 0-based waypoint-list row builder for PGN 129285/130074), and `packWaypointsToBudget()` plus `FAST_PACKET_MAX_BYTES`. PGN 129285 and 130074 are variable-length fast-packet route frames, so the on-wire waypoint count is bounded by the encoded byte size (<= 223 bytes), not a fixed constant: `packWaypointsToBudget()` greedily trims the list against the per-PGN header (10 bytes for 130074, `12 + routeName.length` for 129285) and the real STRING_LAU name lengths so a long route never emits an untransmittable frame. `MAX_CANDIDATE_WAYPOINTS` is just the upper candidate ceiling before the byte budget. The module also exports the `longNameWaypoints()` and `longNameWaypointEntries()` fixture builders used by both route modules' embedded budget-regression tests.
- `src/conversions/instanceOptions.ts` - `instanceList(options, key)`: reads a per-instance config array (engines, batteries, chargers, tanks, groups) off a factory module's options, returning `[]` for a non-array so a malformed config cannot reach `.map` and throw
- `src/conversions/windData.ts` - `createWind130306Conversion()`: the shared PGN 130306 (Wind Data) builder used by the apparent, true-over-water, true-over-ground, and weather-forecast wind modules

### Configuration Schema

`src/config/schema.ts` defines the TypeBox `RootConfig` schema. `Plugin.schema` returns the TypeBox value directly (it IS a valid JSON Schema literal at runtime). Adding a new conversion does NOT require new schema entries because `Conversion` already accepts a `Record<string, ConversionConfig>` with `enabled`, `resend`, `sources`, and `extras` per key. Per-conversion identity comes from each module's `category` and optional `presets` metadata.

## Testing

Tests live in `src/test/`. The conversion-module test cases live embedded in each module's `tests` array and run through `src/test/index.test.ts`; dedicated suites cover the advisor, API, lifecycle, migration, panel state, and protocol boundaries.

1. Loads every conversion module (the registry expands the 46 source modules into 76 runtime conversion objects via the per-instance factories; `index.test.ts` pins the 76)
2. Validates each module has test cases
3. Runs embedded tests against CanboatJS encoder/decoder

`npm run typecheck` runs three `tsc` passes: `tsconfig.json` (plugin runtime; excludes `**/*.test.ts`), `tsconfig.panel.json` (React panel, plus the panel-hook test `useConfig.test.ts` which needs the DOM/React lib), and `tsconfig.test.json` (the rest of the `src/test/` suite). The base config excludes test files, so they are type-checked only by the latter two configs.

## Key Technical Details

- **Runtime**: Node.js 22.22.2+, with an ESM plugin bundle
- **Build**: esbuild bundles to single `dist/index.mjs` (currently ~364 KB)
- **Externals**: rxjs is the only runtime dependency (esbuild `--external:rxjs`). `@signalk/server-api` is a devDependency used for types only and MUST stay a type-only import: a value import (e.g. its `hasValues`) bundles the whole package, whose dynamic `require("events")` throws at load ("Dynamic require of events is not supported"), so the plugin keeps local copies of any such guards (see `notifications.ts`).
- **Reactivity**: RxJS for Signal K data subscriptions (Signal K server uses BaconJS internally)
- **N2K Message Format**: CanboatJS format: `{ prio, pgn, dst, fields: {...} }`

## Signal K Server API Integration

This plugin uses `@signalk/server-api` for official type definitions. Key points:

### Branded Types

Signal K uses branded types for type safety. When using the API:

```typescript
import type { Path, Context } from "@signalk/server-api";

// Cast strings to branded types when calling API methods
app.streambundle.getSelfBus(skKey as Path);
const subscription = { context: "vessels.self" as Context, ... };
```

### Error Handling

`app.error()` takes a **string**, not an Error object. Use the shared `errMessage` helper to coerce `unknown`-typed thrown values:

```typescript
import { errMessage } from "../utils/errorUtils.js";

// Correct
app.error(errMessage(err));

// Wrong - will cause TypeScript error
app.error(err as Error);
```

### Plugin Status Reporting

Use these methods for UI visibility in the Signal K admin panel. `plugin-manager.ts` already implements the five canonical states:

- `Starting...` at the top of `start()`
- `Running with N conversions enabled` once N>0 and `nmea2000Ready` is true
- `No conversions enabled. Enable at least one in plugin settings.` when N=0
- `Waiting for NMEA 2000 output (N conversions enabled)` when N>0 but readiness has not yet been detected (refreshed automatically by the listener that `start()` attaches; the factory in `index.ts` seeds readiness from `app.isNmea2000OutAvailable` at registration and latches the one-shot `nmea2000OutAvailable` event, and `start()` reads that factory flag, so a plugin enabled or restarted after the event already fired still goes straight to running)
- `Stopped` on `stop()`

Brand: use "NMEA 2000" (with space) in user-facing strings (status, schema text, README, CHANGELOG, comments). Event identifiers like `nmea2000OutAvailable` / `nmea2000JsonOut` stay as the API names. Em dashes are banned everywhere.

### NMEA 2000 Output Readiness

Wait for the `nmea2000OutAvailable` event before emitting messages. `PluginManager` already does this:

- The constructor binds `onNmea2000Ready` (so `stop()` can `removeListener` the exact same reference) but does NOT attach it: `start()` owns the lifecycle so a constructed-but-never-started instance does not leak a listener.
- `start()` removes-then-adds the listener idempotently, and reads the factory readiness flag via `factoryNmea2000Ready()`. The factory closure in `index.ts` seeds that flag from the registration-time `app.isNmea2000OutAvailable` snapshot (the sync mirror that `signalk-server >= 2.x` maintains) and latches the one-shot `nmea2000OutAvailable` event, so a plugin enabled or re-enabled after the event already fired still detects readiness. Honouring only the event dropped every PGN for a plugin enabled after output came up.
- The listener checks the `stopped` flag before flipping `nmea2000Ready` and refreshes the status from `Waiting for NMEA 2000 output (...)` to the running form via `lastEnabledCount`.

### Delta-source conversions (ON_DELTA)

AIS (`ais.ts`) is the only `ON_DELTA` module: it runs off the process-wide delta input handler (`dispatchDelta`), not a path subscription. ON_DELTA conversions are purely event-driven, so `dispatchDelta` records no `lastInputs` for them and `processOutput` arms no resend timer (it early-returns for `ON_DELTA`, same as for `TIMER`). A resend would re-broadcast a single arbitrary target every interval, which makes a dead AIS contact look live on an MFD; AIS must emit only when a fresh delta arrives. `aisExtended.ts` (own-vessel reports) rides the subscription path and keeps normal resend.

### Error Throttling

Per-callback errors route through `PluginManager.throttledError(key, message)` with a per-key 60s window. Use `bucketKey(prefix, conversion, suffix?)` to build the key: it normalizes the `optionKey ?? title ?? "?"` fallback chain. Apply uniformly to every error path (callback, processOutput, resend, subscription, RxJS stream `error`); asymmetric coverage leaves a log-flood surface open. `start()` and `stop()` both clear `errorBuckets` so the next lifecycle begins fresh.

### Sub-Conversion Identity (factory-returned children)

Modules that expose `conversions: (options) => [...]` (BATTERY per-id, ENGINE_PARAMETERS per-engine, TANKS per-path, SOLAR per-charger, EXHAUST_TEMPERATURE per-engine, RAYMARINE_BRIGHTNESS per-group, TEMPERATURE_*/TEMPERATURE2_*) return `SubConversionModule` objects that lack `optionKey` and may lack `title`. The plugin-manager's `wireConversion()` helper (called from the start() enablement loop) spreads each into a fresh `ConversionModule` with derived identity:

```typescript
const labeled: ConversionModule =
  subConversion === conv
    ? conv
    : {
        ...subConversion,
        optionKey: subIndexKey(conv.optionKey, idx),
        title: subConversion.title ?? `${conv.title} #${idx}`,
        category: conv.category,
        ...(conv.presets ? { presets: conv.presets } : {}),
      };
```

Spread (not mutation): conversion modules are loaded once in the PluginManager constructor and reused across start/stop cycles, so mutating the source would leak annotations between cycles. The sub-conversion inherits the parent's `category` and `presets` so the panel groups it correctly. The `subConversion === conv` guard preserves the single-PGN path. Result: each sub-conversion gets a unique throttle bucket key (`callback:BATTERY[0]:stream`) and a useful log label (`Battery (PGNs 127506, 127508) #0 [BATTERY[0]]`).

### Notification PGNs (126983 / 126985)

`src/conversions/notifications.ts` subscribes to `notifications.*` on `vessels.self` and emits both PGN 126983 (Alert) and PGN 126985 (Alert Text) per active alert. Internal state:

- `ids: Map<path, alertId>` is the forward mapping: which alertId did we assign to this Signal K path.
- `alertIdToPath: Map<alertId, path>` is the reverse mapping. Load-bearing: `releaseAlertId()` uses it to clean up `ids` when the PGN-cap path evicts an entry, otherwise a released alertId could later be re-allocated to a different path while a stale `ids` binding still points at the same number.
- `usedAlertIds: Set<number>` is the allocation pool. `nextAlertIdHint` rolls forward across allocations so `allocateAlertId` does not always scan from 1.
- `pgnsByAlertId: Map<alertId, { pgns: [PGN_126985, PGN_126983]; digest: string }>` is the cached pair plus a `JSON.stringify(pgns)` digest computed once at set time (via `setAlertPgns`). The digest lets the hot path do a string compare instead of stringifying per active alert per delta.
- `emitTracker: Map<alertId, { lastEmitMs, lastDigest }>` is the per-alert emit gate. The conversion callback fires for every `notifications.*` delta on the vessel (Evinrude alone broadcasts ~24 state=normal paths at ~2.4 Hz each), so returning the full PGN cache on every invocation flooded the bus at ~100 PGN/s per active alert. `buildEmitList` walks `pgnsByAlertId` and emits each pair only when `entry.digest !== emitTracker.get(id)?.lastDigest` (state/ack/silence change) or `now - lastEmitMs >= MIN_EMIT_INTERVAL_MS = 1000` (1 Hz rebroadcast matching the NMEA 2000 guidance for PGN 126983). An idle delta returns a shared `EMPTY_EMIT` sentinel.

Allocation profile: zero per-callback allocation on idle deltas (the shared `EMPTY_EMIT` sentinel is reused), one fresh `N2KMessage[]` allocation per gated rebroadcast (bounded at 1 Hz per active alert). The earlier `cachedFlat` design that returned a shared mutable array across calls was traded for this for two reasons: the gate already caps the allocation rate; and digest-based change detection is simpler to reason about than cache-invalidation on every state mutation.

`alertCategory` is derived from the Signal K path via `matchPathPrefix(path, CATEGORY_BY_PATH_PREFIX)`: `notifications.mob`, `notifications.navigation`, `notifications.anchor`, `notifications.arrival`, `notifications.gnss` route to "Navigational"; everything else falls through to "Technical".

`alertPriority` maps from Signal K state per IEC 62923: `emergency=1, alarm=2, warn=3, alert=4`. Lower number is higher priority.

The non-alert states `normal` and `nominal` (`isClearState`) release any existing alert and emit no PGN. Genuinely unknown states (a misspelling in an upstream provider) fall through to "Caution" / priority 4 with a debug log, so they still produce a valid PGN.

`alertTextDescription` (PGN 126985, a STRING_LAU field) is clamped to `MAX_ALERT_TEXT_CHARS = 200`. An unbounded message overflows the canboatjs 500-byte `toPgn` buffer; the resulting throw is re-raised by signalk-server's `safeApply` on a bare `setTimeout`, so no plugin try/catch can intercept it and the host process dies. The overflow has to be prevented before the emit; clamping the field is the cheapest way (a general pre-emit PGN size guard would be the broader alternative).

`alertId` is a 16-bit unsigned NMEA 2000 field; the allocator caps at `MAX_ALERT_ID = 65531` (one below the spec max so the canboat encoder never sees the "data not available" sentinel) but in practice the active set is bounded by `MAX_TRACKED_PATHS = 256` (one entry in `ids` per active path, released on a clear state or LRU eviction).

PGN 126984 (Alert Response, inbound) is NOT handled. Acknowledgements from an MFD do not flow back into Signal K. Closing this round-trip requires an inbound NMEA 2000 hook that the typed `@signalk/server-api` does not currently expose: needs a separate design pass.

## Admin UI: federated React panel

As of v1.6.5 the plugin's admin config UI is a webpack 5 Module Federation remote built into `public/remoteEntry.js` plus chunked `public/*.js` from `src/panel/`. The Signal K admin loads it because `package.json` `keywords` include `signalk-plugin-configurator`. Component contract: default export `PluginConfigurationPanel({ configuration, save })`. `save` is fire-and-forget, returns void; the next `configuration` prop reflects the saved state.

Live data comes from an Express router mounted via `Plugin.registerWithRouter` under `/plugins/signalk-nmea2000-emitter-cannon/api/`. It serves status, conversion, path, source, and advisor routes. Signal K applies its admin middleware to all `/plugins` routes before invoking registered plugin routers, so this code must not reach into the server's internal `securityStrategy` object or add a second authorization layer.

The `/conversions` catalog must be served even when the plugin is disabled or startup fails. signalk-server calls `registerWithRouter` for every loaded plugin but only calls `start()` (which builds `PluginManager`) once it is enabled, so a disabled plugin has no manager and the panel would otherwise show every category at zero with nothing to configure (the one moment the catalog is needed). A failed start also clears the manager's modules. The catalog is pure module metadata, so the mapping lives in `buildConversionMetadata()` (`src/api/conversion-metadata.ts`) and `PluginManager.getConversionMetadata()` delegates to it. `index.ts` builds one shared `getMetadata` provider, injected into both the API router (`/conversions`) and the advisor: it returns a populated manager catalog when available, else a standalone copy built once from `createConversionModules(app, plugin)` and cached.

Config shape: TypeBox at `src/config/schema.ts`. `Plugin.schema` returns the TypeBox value directly (a valid JSON Schema literal at runtime). `Static<typeof RootConfig>` derives the `Config` TypeScript type. Migration of v1.4.x payloads runs once at `useConfig` init in the panel (synchronously imported from `src/config/migrate.ts`). The on-disk shape is now `conversions: { KEY: { enabled, resend, sources, extras } }`; the load-time migration accepts the old flat shape and normalizes it.

Layout: conversions render as dense rows (`src/panel/components/ConversionRow.tsx`, about 34px tall) inside one hairline-divided bordered container per section. Their complete style contract lives in `conversionStyles.ts`. Each row carries, left to right, a 3px left status rail, an enable checkbox, a disclosure toggle (title plus the PGN run), a legacy badge (shown only on superseded conversions) with a visually-hidden text label, an error glyph, and a right-aligned recency column. The pure helper `rowStatus(status, enabled)` in `src/panel/rowStatus.ts` derives `{ rail, recency }`: emitting is a solid rail (`--skn-ok`), enabled-but-silent is a dashed rail (`--skn-wait`), error is `--skn-danger-fg` plus the glyph, and disabled has no rail. The rail lives on the row header so it stays a short tick and does not run the full height of the open editor. This is night-theme safe: night `--skn-ok` and `--skn-wait` are both amber, so emitting versus silent is carried by the always-present recency text and the solid-versus-dashed rail pattern, not by hue. Editing is a single-open inline accordion: clicking a row expands `ConversionDetail.tsx` (the lifted editor body: resend interval, one stacked source field per Signal K path, the extras editors, and the purpose/note/compatibility prose) full width below the row in a recessed inset panel, and opening another row closes the previous one. The panel holds a single `expandedKey: string | null` with a referentially stable toggle, and focus returns to the row's toggle on collapse.

`PanelToolbar.tsx` (a labelled `<section>` landmark, `position: sticky` via a `--skn-toolbar-height` variable) carries the catalog search, a condensed status chip (a dot, the enabled-over-total count, a readiness word, a visible stale-poll marker, and the `ErrorBadgeButton` jump-to-error), the Configure / Status `SegmentedControl`, the `ThemeToggle`, and the Setup wizard shortcut. Quick presets (`PresetChips`) collapses into a one-line `Disclosure` below the toolbar (state key `panel:presets`), because `PresetChips` has no collapsible of its own. The Config Advisor (`AdvisorPanel`) and Global settings (`GlobalSettings`) render directly there: each already provides its own one-line collapsible section, so an extra wrapper would duplicate the title. `AdvisorPanel` keeps its review and pending state because the configure view stays mounted. Each category section header (`CollapsibleSection`) gained Enable all and Disable all controls via a `Disclosure` `headerTrailing` slot (so the bulk buttons are valid siblings outside the toggle button); they act on that section's keys via `setEnabledForKeys(keys, enabled)`, announce through `role="status"`, and appear only in the tab view, never on a search-result section.

`ThemeToggle` selects Auto, System, Light, Dark, or the red-preserving Night mode. Explicit themes write `data-snui-theme` on the `.skn-panel` root and persist through the shared `signalk-nearlcrews-ui.theme.v1` localStorage key. Auto is the fresh-profile default, does not write a root theme attribute, follows an explicit Signal K host theme, and otherwise uses Light. System follows the operating system preference. The retired `skn-theme` key is intentionally ignored. Matching token blocks and semantic dimension tokens live in `theme.ts` (`THEME_STYLE`). Feature styles are split by boundary: `advisorStyles.ts`, `conversionStyles.ts`, `statusStyles.ts`, `toolbarStyles.ts`, and `wizardStyles.ts`, with responsive table primitives in `tableStyles.ts`. Shared styles are split by concern under `sharedStyles/`, while `styles.ts` provides the stable `S` facade used by components. The Configure / Status toggle switches the body between the editor and `StatusView`, a read-only live-emit table; both views stay mounted (swapped with the `hidden` attribute) so advisor state survives the switch. `FirstRunWizard` is a guided modal that fetches `GET /api/paths`, runs the runtime-neutral `recommend()` from `src/recommendation/` over the observed paths, and proposes the enable-action conversions (grouped by category, pre-checked) plus the preset shortcuts, so its proposals always agree with Review now; Apply stages the enables through the reducer, and the user reviews and saves. A first-run callout above the catalog opens it once the catalog is loaded and the current panel configuration has no enabled catalog conversion. The footer docks to the viewport bottom when the host layout requires it, a `beforeunload` guard fires while dirty, and Save and Discard move focus to the save-status element so keyboard focus is not dropped when those buttons disable themselves. Conflict-safe saves: `useConfig` keeps the last requested configuration as a baseline and, when an external `configuration` prop arrives while the panel is dirty (an Advisor write or scheduled review), runs a three-way merge (`mergeExternalConfig`) that adopts external changes for every key the user has not touched while keeping the user's edits on conflict, then updates the baseline so the next Save sends the merged result. Semantic no-op actions preserve identity and do not mark the panel dirty.

Federation specifics:

- The webpack config builds a classic (`var`-type) Module Federation container: `remoteEntry.js` assigns the container to the global `window[<safeName>]`. The Signal K admin UI's configurator loader looks the panel up by that global. `package.json` explicitly uses `"type": "commonjs"` so the admin injects `remoteEntry.js` as a classic `<script>` (not `<script type="module">`): a classic script is what makes the bundle's top-level `var` land on `window`.
- Do NOT switch the panel to an ESM federation container (`experiments.outputModule`, `output.module: true`, `library: { type: "module" }`) and do NOT add `"type": "module"` back to `package.json`. v1.5.4 through v1.6.4 shipped exactly that: an ESM container is only loadable by `@signalk/server-admin-ui >= 2.27.0` and failed with a bare "Error loading component" on every older admin UI (issue #8). The classic `var` container loads on all signalk-server 2.x admin UIs.
- The plugin runtime bundle is `dist/index.mjs`. The explicit `.mjs` extension marks it as ESM for Node now that `package.json` has no `"type": "module"`.
- Library name: `pkg.name.replace(/[-@/]/g, "_")` (the safe identifier form derived from the package name).
- Shared singletons: `react` and `react-dom` at `^19.2.0`. Signal K Admin provides both with `import: false`, so the panel has no bundled React fallback. `signalk-nearlcrews-ui` 0.7.1 and its React Aria dependencies remain bundled in the remote.

Adding a new conversion now requires:

1. Create the module in `src/conversions/`, including `category` (required: one of `navigation`, `engine`, `electrical`, `tanks`, `environment`, `ais`, `comms`, `system`) and optional `presets` (e.g. `["basic-nav"]`).
2. Add to the registry in `src/conversions/index.ts`.
3. If the conversion has extras requiring an editor, add an `ExtrasMeta` entry in `src/api/extras-meta.ts`. If a new editor type is required, add the React component under `src/panel/components/extras/` and wire it into the discriminator in `src/panel/components/ExtrasEditor.tsx`.
4. Add test cases in the module's `tests` array.

Source discovery: `enumerateSourcesForPath` uses `app.getSelfPath(path)` because `app.getPath("vessels.self.<path>")` does NOT resolve the `self` indirection. The `/sources` tree on the Signal K server is unrelated: it stores device metadata, not path-keyed source listings.

`PluginManager.recordEmit` aggregates per-conversion emit counters by stripping the `[N]` suffix used for sub-conversion bucket keys (via `stripSubIndex()` from `pathUtils`, also used by `parentKeyFromBucketKey` and the panel), so totals are reported under the parent `optionKey`. The `/api/status` snapshot walks all source-type bucket suffixes (delta, stream, subscription, timer) and matches both parent and sub-conversion key forms so a flaky sub-conversion still surfaces as an error indicator on the parent card.

## Config Advisor (`src/advisor/` and `src/recommendation/`)

Optional subsystem (added v1.6.0) that reviews observed Signal K paths and recommends which conversions to enable or disable, and flags enabled conversions whose per-path `$source` pin no longer matches a live source. It is dormant unless `advisor.enabled` is set and adds no work to the emit hot path. It is fully deterministic and makes no outbound LLM calls (the earlier optional OpenRouter rationale enrichment was removed). Design spec and the four phase plans are under `docs/superpowers/`.

- `src/recommendation/recommender.ts` is the deterministic core: it matches inventory paths to conversions by each module's declared `keys`. Pure, no app, no network. It owns the `action` (`enable` / `disable` / `keep` / `clear-source`). `clear-source` is emitted for an enabled conversion whose configured `sources` pin names a `$source` not among that path's current `liveSources`, in two flavors. When the path is live from some OTHER source, the pin is provably stale (`confidence: "high"`, `origin: "live"`). When the path has NO live source at all but the inventory entry carries QuestDB `historic` (the path was seen in the look-back window), the pin is probably stale (`confidence: "low"`, `origin: "historic"`), since the sensor could merely be powered off; without historic evidence no claim is made, so a history-less dead path is left alone and QuestDB being off suppresses this case rather than nagging every idle pin. The tier is derived post-loop with `staleSources.some((s) => s.liveSources.length > 0)`, not a mutable flag. The recommendation carries `staleSources` (path, the dead pin, and the live sources, empty for the dead-but-historic case).
- `busSource.ts` `isN2KSource(label)` flags a `$source` already on the NMEA 2000 bus (trailing `.<digits>` or the bare `NMEA2000` echo-guard label). It errs toward classifying a source as N2K: a false positive only suppresses a recommendation, a false negative would recommend a conversion that echoes bus data.
- `inventory.ts` builds the live `PathInventory` (reusing `discovery.ts`, whose `enumerateSourcesForPath` returns the winning `$source` plus every contributor in the path's `values` map) and `mergeHistoric` folds in QuestDB history.
- `questdb.ts` is a zero-dependency HTTP client (Node 22 global `fetch`) that uses the `withTimeout()` abort-timeout helper in `withTimeout.ts` (one AbortController plus timer per request; retry and backoff stay with the client). QuestDB is optional; every failure falls back to the deterministic result plus a `ReviewResult` note, never a throw.
- `advisor.ts` `Advisor` orchestrates via an injected `AdvisorDeps` seam (testable without `SignalKApp`). When `advisor.autoApply` is true (the default) `runReview` auto-applies confident enables and parks disables and stale-source fixes for approval; when false, enables are parked too. Stale-source fixes are never auto-applied (they change data routing, like disables). `applyReview` applies each approved decision per its `action`: enable/disable toggle `enabled`, and `clear-source` removes the decision's `clearSourcePaths` from the conversion's `sources` so it follows the live source again.
- `schedule.ts` `AdvisorScheduler` drives the optional periodic review; `index.ts` reconfigures it on every `startPlugin`.
- The advisor writes config via `app.savePluginOptions` then calls `startPlugin` to reload, because `savePluginOptions` only writes the file. `readPluginOptions` returns the full options envelope; the advisor's `readConfig` unwraps `.configuration` and runs it through `migrateLegacyConfig` so any `configuration`-envelope nesting is flattened. A single unwrap would leave a deeply nested config's `conversions` key buried, and the recommender would then rebuild from an apparently empty config, stranding every factory-module conversion.

## Common Pitfalls

1. **optionKey identity**: Each conversion module's `optionKey` is the key under `conversions: Record<string, ConversionConfig>` in the persisted config. It must be unique across modules and stable across releases (renaming silently strands users' saved settings). The TypeBox schema accepts any string key, so no separate registry entry is required.

2. **Subscription Path Types**: When using `subscriptionmanager.subscribe()`, paths must be cast to `Path` type.

3. **Error Callback Types**: Subscription error callbacks receive `unknown`, not `Error`.

4. **Heave (PGN 127252) and attitude (PGN 127257) are absent from Garmin's public Rx list**, but Garmin Reactor autopilots and B&G / Furuno autopilots still consume them over the bus (Garmin via the SteadyCast / 9-Axis sensor's internal channel, which is the standard public PGN under the hood). `attitude.ts` and `heave.ts` are not redundant: leave them enabled on installs with any of those autopilots even if a Garmin chartplotter is the only visible display.
