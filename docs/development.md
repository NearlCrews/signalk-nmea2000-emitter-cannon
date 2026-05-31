# Development

## Prerequisites

- Node.js 22.12+
- TypeScript 6+
- Modern package manager (npm recommended)

## Setup

```bash
git clone https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon.git
cd signalk-nmea2000-emitter-cannon
npm install
npm run hooks          # one-time: enable the lint-staged pre-commit hook
```

Git hooks are not auto-installed on `npm install`: the husky `prepare`
lifecycle is omitted because it breaks `npm pack` on Node 22's npm 10 (the
script banner leaks into the packed-tarball name, which fails the app-store
install check in CI). Run `npm run hooks` once after cloning to enable the
pre-commit hook.

## Build commands

```bash
npm run build          # Production build (esbuild plugin + webpack panel)
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

The plugin subscribes to Signal K data paths via RxJS streams. When values
change, conversion callbacks transform them into CanboatJS-format N2K messages
(`{ prio, pgn, dst, fields }`) which are emitted to the NMEA 2000 bus. Each
conversion module is self-contained with its own Signal K path mappings,
conversion logic, and embedded test cases. The plugin manager handles
subscription lifecycle, debouncing, data freshness timeouts, and periodic
resend timers.

NMEA 2000 output messages follow the CanboatJS format: required `prio`, `pgn`,
`dst` metadata with all data fields nested under a camelCase `fields` object.

## Project structure

```
src/
├── index.ts              # Plugin entry point (registerWithRouter, lifecycle)
├── plugin-manager.ts     # Core lifecycle (subscriptions, resend, status snapshot, emit counters)
├── constants.ts          # NMEA 2000 default values (priority, dst, SID, resend interval)
├── config/
│   ├── schema.ts         # TypeBox RootConfig (single source of truth)
│   └── migrate.ts        # Load-time migration from v1.4.x legacy config
├── api/
│   ├── router.ts         # Express router (status, conversions, paths, sources)
│   ├── discovery.ts      # Path / source enumeration helpers
│   ├── extras-meta.ts    # ExtrasMeta discriminator per optionKey
│   ├── pgnSummaries.ts   # Per-PGN human-readable summary strings
│   └── types.ts          # API response shapes
├── panel/                # Federated React config panel (webpack module federation)
│   ├── index.tsx         # Federation entry; re-exports PluginConfigurationPanel
│   ├── PluginConfigurationPanel.tsx
│   ├── styles.ts         # Inline-style objects
│   ├── components/       # StatusDashboard, ConversionCard, CategoryTabs, etc.
│   │   └── extras/       # MappingTable + per-family editors
│   └── hooks/            # useStatus (3s poll), useConfig (reducer), useSources (lazy cache)
├── types/
│   ├── signalk.ts        # SignalKApp (extends ServerAPI)
│   ├── nmea2000.ts       # NMEA 2000 message types
│   ├── plugin.ts         # ConversionModule, SubConversionModule, plugin types
│   └── index.ts          # Re-exports
├── utils/
│   ├── pathUtils.ts      # Signal K path utilities
│   ├── messageUtils.ts   # NMEA 2000 message utilities
│   ├── dateUtils.ts      # Date/time conversions
│   ├── errorUtils.ts     # errMessage() coercion helper
│   ├── validation.ts     # Input validation (NaN/Infinity checks)
│   ├── smoothing.ts      # Exponential smoothing for sensor data
│   └── debugUtils.ts     # Debug-flag check
├── conversions/          # 46 PGN conversion modules
│   ├── index.ts          # Module loader / registry
│   ├── routeTypes.ts     # Shared Position/Waypoint types
│   ├── wind.ts           # Wind data conversion
│   ├── depth.ts          # Depth conversion
│   ├── battery.ts        # Battery status conversion
│   └── ...               # 43 more conversions
└── test/                 # Vitest test suites (118 tests, 13 files)
    ├── index.test.ts          # All conversion-module test cases (round-trip via canboatjs)
    ├── advisor.test.ts        # Config Advisor: recommender, inventory, QuestDB/OpenRouter, orchestrator
    ├── advisor-config.test.ts # Advisor config defaults vs schema
    ├── api.test.ts            # /api/* router endpoints + admin auth
    ├── discovery.test.ts      # Path / source enumeration
    ├── lifecycle.test.ts      # Plugin start/stop/resend lifecycle
    ├── migrate.test.ts        # v1.4.x legacy config migration
    ├── pathUtils.test.ts      # pathToPropName collision regressions
    ├── schedule.test.ts       # AdvisorScheduler periodic-review timer
    ├── smoothing.test.ts      # ExponentialSmoother registry behavior
    ├── status.test.ts         # PluginManager.getStatusSnapshot + getConversionMetadata
    ├── temperature.test.ts    # Temperature default-instance uniqueness
    └── useConfig.test.ts      # Panel useConfig reducer (setAdvisor, preset apply)
public/                   # Webpack module federation output (shipped via "files" array)
├── remoteEntry.js        # Federation entry script (classic var-type container)
├── main.js               # Panel main bundle
└── *.js / *.LICENSE.txt  # Federation chunks
webpack.config.cjs        # Classic module federation build config
tsconfig.panel.json       # Panel-specific TypeScript config (jsx: react-jsx)
tsconfig.test.json        # TypeScript config for the src/test/ suite
.github/
└── workflows/
    ├── ci.yml            # GitHub Actions CI pipeline (lint, typecheck, test, build)
    └── publish.yml       # Auto-publish to npm on GitHub release (with provenance)
```

## Testing

All conversion modules include embedded test cases that validate correct PGN
message format, CanboatJS encoding/decoding compatibility, Signal K data path
mapping, and edge case handling. The full suite is 118 tests across 13 files.

`npm run typecheck` runs three `tsc` passes: the plugin runtime
(`tsconfig.json`, which excludes test files), the React panel
(`tsconfig.panel.json`), and the test suite (`tsconfig.test.json`).

```bash
npm test               # Run all tests
npm run test:ui        # Run tests with UI
npm run test:coverage  # Run tests with coverage
```

## Adding new conversions

1. Create `src/conversions/yourConversion.ts` using the factory pattern below.
2. Import and register in `src/conversions/index.ts` (add to imports and the
   `conversionFactories` array).
3. If the conversion has custom mapping or field editors, add an `ExtrasMeta`
   entry in `src/api/extras-meta.ts`; otherwise this step is unnecessary
   because the TypeBox schema in `src/config/schema.ts` already accepts any
   conversion key with `enabled`, `resend`, `sources`, and `extras`.
4. Include embedded test cases in the module's `tests` array.
5. Run `npm test` and `npm run typecheck`.

Each conversion module carries a required `category` field (one of
`navigation`, `engine`, `electrical`, `tanks`, `environment`, `ais`, `comms`,
`system`) and an optional `presets` array (e.g. `["basic-nav"]`). These drive
the category tabs and preset chips in the React panel. See `CLAUDE.md` for the
full set of conventions, the extras-editor wiring contract, and the
source-discovery rules the panel relies on.

Example conversion module:

```typescript
import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";

export default function createMyConversion(
  app: SignalKApp
): ConversionModule<[number | null]> {
  return {
    title: "My Conversion (12345)",
    optionKey: "MY_CONVERSION",
    keys: ["path.to.signalk.data"],
    callback: ((value: number | null) => {
      if (value === null) return [];

      return [{
        prio: N2K_DEFAULT_PRIORITY,
        pgn: 12345,
        dst: N2K_BROADCAST_DST,
        fields: {
          myField: value,
        },
      }];
    }) as ConversionCallback<[number | null]>,
    tests: [
      {
        input: [42],
        expected: [{
          prio: 2,
          pgn: 12345,
          dst: 255,
          fields: { myField: 42 },
        }],
      },
    ],
  };
}
```

## Releasing

The release process and checklist live in
[docs/maintainers/releasing.md](maintainers/releasing.md).

## Contributing

See [CONTRIBUTING.md](../.github/CONTRIBUTING.md). In short: fork, create a
feature branch, make changes with proper TypeScript types, add tests for new
functionality, ensure all tests pass and code passes linting, then submit a
pull request.
