# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Signal K NMEA2000 Emitter Cannon is a TypeScript Signal K server plugin that converts Signal K marine navigation data to NMEA 2000 format. It supports 46 conversion modules covering 74 PGNs with Garmin compatibility.

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
- `src/types/signalk.ts` - `SignalKApp`, subscriptions, delta messages

### Utilities
- `src/utils/messageUtils.ts` - N2K message validation, creation, formatting
- `src/utils/pathUtils.ts` - Path manipulation, `isDefined()` type guard
- `src/utils/dateUtils.ts` - NMEA 2000 date/time conversions (`toN2KDate`, `toN2KTime`, `toN2KDateTime`)
- `src/utils/validation.ts` - Input validation (`isValidNumber`, `toValidNumber` - rejects NaN/Infinity)
- `src/utils/smoothing.ts` - `ExponentialSmoother` class for sensor data smoothing
- `src/constants.ts` - Standard N2K values (`N2K_DEFAULT_PRIORITY`, `N2K_BROADCAST_DST`, `N2K_DEFAULT_SID`)

### Configuration Schema
`src/schema.ts` generates JSON Schema for Signal K admin UI. Each conversion gets enabled/resend/source filter options.

## Testing

Tests live in `src/test/index.test.ts`. Each conversion module embeds its own test cases. The test suite:
1. Loads all 46 conversion modules
2. Validates each module has test cases
3. Runs embedded tests against CanboatJS encoder/decoder

## Key Technical Details

- **Runtime**: Node.js 20+, pure ESM modules
- **Build**: esbuild bundles to single `dist/index.js` (200kb)
- **Externals**: rxjs, es-toolkit, path-scurry, @canboat/canboatjs
- **Reactivity**: RxJS for Signal K data subscriptions (Signal K server uses BaconJS internally)
- **N2K Message Format**: CanboatJS format - `{ prio, pgn, dst, fields: {...} }`

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
`app.error()` takes a **string**, not an Error object:
```typescript
// Correct
app.error(err instanceof Error ? err.message : String(err));

// Wrong - will cause TypeScript error
app.error(err as Error);
```

### Plugin Status Reporting
Use these methods for UI visibility in the Signal K admin panel:
```typescript
app.setPluginStatus("Running with 5 conversions enabled");
app.setPluginError("Failed to initialize: reason");
```

### NMEA2000 Output Readiness
Wait for the `nmea2000OutAvailable` event before emitting messages:
```typescript
app.on("nmea2000OutAvailable", () => {
  this.nmea2000Ready = true;
});

// In your output handler
if (!this.nmea2000Ready) {
  app.debug("NMEA2000 output not yet available");
  return;
}
app.emit("nmea2000JsonOut", message);
```

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
