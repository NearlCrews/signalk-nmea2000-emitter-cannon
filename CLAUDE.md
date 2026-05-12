# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Signal K NMEA2000 Emitter Cannon is a TypeScript Signal K server plugin that converts Signal K marine navigation data to NMEA 2000 format. It supports 45 conversion modules emitting 52 data PGNs (plus 3 ISO PGNs announced in the transmit list) with Garmin compatibility.

## Common Commands

```bash
npm run build          # Production build (esbuild → dist/index.js)
npm run build:watch    # Development build with watch mode
npm test               # Run all tests (Vitest)
npm run test:ui        # Run tests with interactive UI
npm run test:coverage  # Run tests with coverage report
npm run typecheck      # TypeScript validation (strict mode)
npm run lint           # Biome linting
npm run format         # Biome auto-format with --write
npm run check          # Full Biome check
```

## Architecture

### Entry Point & Plugin Lifecycle
- `src/index.ts` - Factory function `createPlugin(app)` returns `SignalKPlugin` with `start()`, `stop()`, `schema()`
- `src/plugin-manager.ts` - Core lifecycle manager that loads conversions, sets up Signal K subscriptions, handles resend timers

### Conversion Module Pattern
All 45 modules in `src/conversions/` follow this factory pattern:

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
- `src/types/signalk.ts` - `SignalKApp` (extends `ServerAPI` with the `nmea2000JsonOut` / `nmea2000OutAvailable` event signatures) and `JSONSchema`

### Utilities
- `src/utils/messageUtils.ts` - N2K message validation (`validateN2KMessage`), formatting (`formatN2KMessage`), cleaning (`cleanN2KMessage`)
- `src/utils/pathUtils.ts` - `pathToPropName()` for config keys, `isDefined()` type guard, `matchPathPrefix<T>(path, table)` first-prefix-match lookup used by `notifications.ts` (alertCategory routing) and `raymarineAlarms.ts` (alarmId mapping)
- `src/utils/dateUtils.ts` - NMEA 2000 date/time conversions (`toN2KDate`, `toN2KTime`, `toN2KDateTime`)
- `src/utils/errorUtils.ts` - `errMessage(err)` coercion helper for `unknown`-typed thrown values
- `src/utils/validation.ts` - Input validation (`isValidNumber`, `toValidNumber` - rejects NaN/Infinity), `normalizeAngle()`
- `src/utils/smoothing.ts` - `ExponentialSmoother` class for sensor data smoothing
- `src/constants.ts` - Standard N2K values (`N2K_DEFAULT_PRIORITY`, `N2K_BROADCAST_DST`, `N2K_DEFAULT_SID`, `N2K_SID_ZERO`, `N2K_DEFAULT_INSTANCE`, `DEFAULT_DATA_TIMEOUT_MS`, `VESSELS_SELF_CONTEXT`, `STREAM_DEBOUNCE_MS`)
- `src/conversions/routeTypes.ts` - Shared `Position`/`Waypoint` interfaces, `DEFAULT_ROUTE_NAME`, and per-PGN waypoint capacity constants (`MAX_RPS_WAYPOINTS`, `MAX_WP_LIST_WAYPOINTS`)

### Configuration Schema
`src/schema.ts` generates JSON Schema for Signal K admin UI. Each conversion gets enabled/resend/source filter options.

## Testing

Tests live in `src/test/index.test.ts`. Each conversion module embeds its own test cases. The test suite:
1. Loads all 45 conversion modules
2. Validates each module has test cases
3. Runs embedded tests against CanboatJS encoder/decoder

## Key Technical Details

- **Runtime**: Node.js 20.18+, pure ESM modules
- **Build**: esbuild bundles to single `dist/index.js` (~338 KB)
- **Externals**: rxjs (only runtime dependency kept out of the bundle; @signalk/server-api is type-only)
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
Use these methods for UI visibility in the Signal K admin panel. `plugin-manager.ts` already implements the four canonical states:
- `Starting...` at the top of `start()`
- `Running with N conversions enabled` once N>0 and `nmea2000Ready` is true
- `No conversions enabled. Enable at least one in plugin settings.` when N=0
- `Waiting for NMEA 2000 output (N conversions enabled)` when N>0 but `nmea2000OutAvailable` has not yet fired (refreshed automatically by the listener that `start()` attaches; `start()` also reads `app.isNmea2000OutAvailable` synchronously so a plugin restarted after the one-shot event already fired still goes straight to running)
- `Stopped` on `stop()`

Brand: use "NMEA 2000" (with space) in user-facing strings (status, schema text, README, CHANGELOG, comments). Event identifiers like `nmea2000OutAvailable` / `nmea2000JsonOut` stay as the API names. Em dashes are banned everywhere.

### NMEA 2000 Output Readiness
Wait for the `nmea2000OutAvailable` event before emitting messages. `PluginManager` already does this:
- The constructor binds `onNmea2000Ready` (so `stop()` can `removeListener` the exact same reference) but does NOT attach it: `start()` owns the lifecycle so a constructed-but-never-started instance does not leak a listener.
- `start()` removes-then-adds the listener idempotently, and reads `app.isNmea2000OutAvailable` (the sync mirror that `signalk-server >= 2.x` maintains) so a plugin re-enabled after the one-shot `nmea2000OutAvailable` event already fired still detects readiness.
- The listener checks the `stopped` flag before flipping `nmea2000Ready` and refreshes the status from `Waiting for NMEA 2000 output (...)` to the running form via `lastEnabledCount`.

### Error Throttling
Per-callback errors route through `PluginManager.throttledError(key, message)` with a per-key 60s window. Use `bucketKey(prefix, conversion, suffix?)` to build the key: it normalizes the `optionKey ?? title ?? "?"` fallback chain. Apply uniformly to every error path (callback, processOutput, resend, subscription, RxJS stream `error`); asymmetric coverage leaves a log-flood surface open. `start()` and `stop()` both clear `errorBuckets` so the next lifecycle begins fresh.

### Sub-Conversion Identity (factory-returned children)
Modules that expose `conversions: (options) => [...]` (BATTERY per-id, ENGINE_PARAMETERS per-engine, TANKS per-path, SOLAR per-charger, EXHAUST_TEMPERATURE per-engine, RAYMARINE_BRIGHTNESS per-group, TEMPERATURE_*/TEMPERATURE2_*) return `SubConversionModule` objects that lack `optionKey` and may lack `title`. The plugin-manager start() loop spreads each into a fresh `ConversionModule` with derived identity:

```typescript
const labeled: ConversionModule =
  subConversion === conv
    ? conv
    : {
        ...subConversion,
        optionKey: `${conv.optionKey}[${idx}]`,
        title: subConversion.title ?? `${conv.title} #${idx}`,
      };
```

Spread (not mutation): conversion modules are loaded once in the PluginManager constructor and reused across start/stop cycles, so mutating the source would leak annotations between cycles. The `subConversion === conv` guard preserves the single-PGN path. Result: each sub-conversion gets a unique throttle bucket key (`callback:BATTERY[0]:stream`) and a useful log label (`Battery (PGNs 127506, 127508) #0 [BATTERY[0]]`).

### Notification PGNs (126983 / 126985)

`src/conversions/notifications.ts` subscribes to `notifications.*` on `vessels.self` and emits both PGN 126983 (Alert) and PGN 126985 (Alert Text) per active alert. Internal state:

- `ids: Map<path, alertId>` is the forward mapping: which alertId did we assign to this Signal K path.
- `alertIdToPath: Map<alertId, path>` is the reverse mapping. Load-bearing: `releaseAlertId()` uses it to clean up `ids` when the PGN-cap path evicts an entry, otherwise a released alertId could later be re-allocated to a different path while a stale `ids` binding still points at the same number.
- `usedAlertIds: Set<number>` is the allocation pool (free-id check is O(1)).
- `pgnsByAlertId: Map<alertId, [PGN_126985, PGN_126983]>` is the cached pair returned to the resend pipeline.
- `cachedFlat: N2KMessage[]` is the flat view of `pgnsByAlertId.values()`, rebuilt only on mutation (`pgnsByAlertId.set`, `releaseAlertId`, `resetState`). All dedup callback paths return this reference unchanged, restoring zero-allocation behavior.

`alertCategory` is derived from the Signal K path via `matchPathPrefix(path, CATEGORY_BY_PATH_PREFIX)`: `notifications.mob`, `notifications.navigation`, `notifications.anchor`, `notifications.arrival`, `notifications.gnss` route to "Navigational"; everything else falls through to "Technical".

`alertPriority` maps from Signal K state per IEC 62923: `emergency=1, alarm=2, warn=3, alert=4`. Lower number is higher priority.

Unknown Signal K states fall through to "Caution" / priority 4 with a debug log, so a misspelled state in an upstream provider still produces a valid PGN.

`alertId` is a 16-bit unsigned NMEA 2000 field; the allocator caps at `MAX_ALERT_ID = 65531` (one below the spec max so the canboat encoder never sees the "data not available" sentinel) but in practice the active set is bounded by `MAX_TRACKED_PATHS = 256` (one entry in `ids` per active path, released on `state: "normal"` or LRU eviction).

PGN 126984 (Alert Response, inbound) is NOT handled. Acknowledgements from an MFD do not flow back into Signal K. Closing this round-trip requires an inbound NMEA 2000 hook that the typed `@signalk/server-api` does not currently expose: needs a separate design pass.

## Common Pitfalls

1. **Schema/optionKey Mismatch**: The `optionKey` in each conversion module MUST match the key in `src/schema.ts`. Mismatches prevent users from enabling conversions.

2. **Subscription Path Types**: When using `subscriptionmanager.subscribe()`, paths must be cast to `Path` type.

3. **Error Callback Types**: Subscription error callbacks receive `unknown`, not `Error`.

## Adding a New Conversion

1. Create `src/conversions/yourConversion.ts` using the factory pattern above
2. Add to `src/conversions/index.ts` registry
3. Add schema entry in `src/schema.ts`
4. Include test cases in the module's `tests` array
5. Run `npm test` and `npm run typecheck`
