# Development

## Prerequisites

- Node.js 22.18 or newer (`.node-version` pins 22.18 for local development)
- npm 11.6 or newer for local development (`packageManager` pins npm 11.18)
- TypeScript 6, installed by the repository

The `devEngines` compatibility floor also admits npm 10.9.8 because the
official Signal K plugin-CI Node 22 lanes use that bundled npm release. Local
development and repository-owned CI stay pinned to npm 11.18.

## Setup

```bash
git clone https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon.git
cd signalk-nmea2000-emitter-cannon
npm install
npm run hooks          # one-time: enable the repository-owned Git hooks
```

Git hooks are not auto-installed on `npm install`, because lifecycle hooks can
interfere with Signal K's package-install checks. Run `npm run hooks` once after
cloning. The pre-commit hook runs the fast code-quality gates, and the pre-push
hook runs full verification serially for predictable memory use on small hosts.

## Build commands

```bash
npm run build          # Production build (esbuild plugin + webpack panel)
npm run build:watch    # Development build with watch mode
npm test               # Run all tests (Vitest)
npm run test:ui        # Run tests with interactive UI
npm run test:coverage  # Run tests with coverage report
npm run check          # Strict TypeScript validation for runtime, panel, and tests
npm run lint           # Biome, typed ESLint, Markdown, and spelling checks
npm run cruise         # Module-boundary and cycle checks
npm run deadcode       # Unused file, dependency, and export checks
npm run format         # Biome auto-format with --write
npm run format:check   # Formatting check without writes
npm run verify         # Coverage, build, panel smoke, and size gates
npm run verify:release # Verify plus package contents and security audits
```

## Architecture

The plugin subscribes to Signal K data paths via RxJS streams. When values
change, conversion callbacks transform them into CanboatJS-format N2K messages
(`{ prio, pgn, dst, fields }`) which are emitted to the NMEA 2000 bus. Each
conversion module is self-contained with its own Signal K path mappings,
conversion logic, and embedded test cases. The plugin manager handles
subscription lifecycle, debouncing, data freshness timeouts, and periodic
resend timers. It also applies the Canboat-defined arbitration priority at the
final emit boundary.

NMEA 2000 output messages follow the CanboatJS format: required `prio`, `pgn`,
`dst` metadata with all data fields nested under a camelCase `fields` object.

## Project structure

```text
src/
├── index.ts              # Plugin entry point (registerWithRouter, lifecycle)
├── plugin-manager.ts     # Core lifecycle (subscriptions, resend, status snapshot, emit counters)
├── constants.ts          # Conversion fallback priority, dst, SID, and resend defaults
├── config/
│   ├── schema.ts         # TypeBox RootConfig (single source of truth)
│   ├── defaults.ts       # Lightweight runtime conversion defaults
│   └── migrate.ts        # Load-time migration from v1.4.x legacy config
├── api/
│   ├── router.ts         # Express router (status, conversions, paths, sources)
│   ├── discovery.ts      # Path / source enumeration helpers
│   ├── extras-meta.ts    # ExtrasMeta discriminator per optionKey
│   ├── pgnSummaries.ts   # Per-PGN human-readable summary strings
│   └── types.ts          # API response shapes
├── advisor/              # Server-side orchestration, inventory, QuestDB, and scheduling
├── recommendation/       # Runtime-neutral recommendation matcher and shared types
├── panel/                # Federated React config panel (webpack module federation)
│   ├── PluginConfigurationPanel.tsx
│   ├── styles.ts         # Stable facade for shared inline-style primitives
│   ├── sharedStyles/     # Shared action, disclosure, feedback, form, and shell styles
│   ├── advisorStyles.ts  # Advisor panel, result, and settings styles
│   ├── conversionStyles.ts # Dense conversion list and editor styles
│   ├── statusStyles.ts   # Status dashboard style module
│   ├── tableStyles.ts    # Shared responsive table primitives
│   ├── theme.ts          # Emitter tokens bridged to signalk-nearlcrews-ui
│   ├── toolbarStyles.ts  # Catalog toolbar styles
│   ├── wizardStyles.ts   # First-run dialog styles
│   ├── components/       # ConversionRow, ConversionDetail, PanelToolbar, CategoryTabs, etc.
│   │   └── extras/       # MappingTable + per-family editors
│   └── hooks/            # useStatus (3s poll), useConfig (reducer), useSources (lazy cache)
├── types/
│   ├── signalk.ts        # SignalKApp (extends ServerAPI)
│   ├── nmea2000.ts       # NMEA 2000 message types
│   ├── plugin.ts         # ConversionModule, SubConversionModule, plugin types
│   └── index.ts          # Re-exports
├── utils/
│   ├── pathUtils.ts          # Signal K path utilities
│   ├── messageUtils.ts       # NMEA 2000 message utilities
│   ├── dateUtils.ts          # Date/time conversions
│   ├── errorUtils.ts         # errMessage() coercion helper
│   ├── validation.ts         # Input validation (NaN/Infinity checks)
│   ├── smoothing.ts          # Exponential smoothing for sensor data
│   ├── debugUtils.ts         # Debug-flag check
│   ├── aisUtils.ts           # AIS helpers: starboardOffset, parseMmsi, parseImo, AisShipType, string-length caps
│   ├── pgnUtils.ts           # extractPgnsFromTitle, splitPgnTitle (shared by conversions and panel)
│   ├── pgnPriorities.ts      # Canboat priority table and emit-boundary normalization
│   └── notificationUtils.ts  # isClearState: true for non-alert SK states (normal, nominal)
├── conversions/          # 50 data conversion factory modules
│   ├── index.ts          # Module loader / registry
│   ├── routeTypes.ts     # Shared position and route-mark helpers
│   ├── wind.ts           # Wind data conversion
│   ├── depth.ts          # Depth conversion
│   ├── battery.ts        # Battery status conversion
│   └── ...               # 47 more conversion factories
└── test/                 # Vitest test suites
    ├── index.test.ts          # All conversion-module test cases (round-trip via canboatjs)
    ├── advisor.test.ts        # Config Advisor: recommender, inventory, QuestDB, stale-source, orchestrator
    ├── advisor-config.test.ts # Advisor config defaults vs schema
    ├── api.test.ts            # /api/* routing, validation, and error responses
    ├── discovery.test.ts      # Path / source enumeration
    ├── lifecycle.test.ts      # Plugin start/stop/resend lifecycle
    ├── migrate.test.ts        # v1.4.x legacy config migration
    ├── pathUtils.test.ts      # pathToPropName collision regressions
    ├── rowStatus.test.ts      # Panel row status derivation (rail, recency)
    ├── schedule.test.ts       # AdvisorScheduler periodic-review timer
    ├── smoothing.test.ts      # ExponentialSmoother registry behavior
    ├── status.test.ts         # PluginManager.getStatusSnapshot + getConversionMetadata
    ├── temperature.test.ts    # Temperature default-instance uniqueness
    └── useConfig.test.ts      # Panel useConfig reducer (setAdvisor, preset apply)
public/                   # Webpack module federation output (shipped via "files" array)
├── remoteEntry.js        # Federation entry script (classic var-type container)
└── *.js / *.LICENSE.txt  # Federation chunks
webpack.config.cjs        # Classic module federation build config
tsconfig.panel.json       # Panel-specific TypeScript config (jsx: react-jsx)
tsconfig.test.json        # TypeScript config for the src/test/ suite
.github/
└── workflows/
    ├── ci.yml            # Complete release verification on Node 24
    ├── plugin-ci.yml     # Official SignalK reusable plugin-ci workflow (cross-platform)
    └── publish.yml       # Auto-publish to npm on GitHub release (with provenance)
```

## Testing

All conversion modules include embedded test cases that validate correct PGN
message format, CanboatJS encoding/decoding compatibility, Signal K data path
mapping, and edge case handling. Dedicated tests also cover lifecycle, API,
advisor, panel-state, and protocol-boundary behavior.

`npm run typecheck` runs three `tsc` passes: the plugin runtime
(`tsconfig.json`, which excludes test files), the React panel
(`tsconfig.panel.json`), and the test suite (`tsconfig.test.json`).

```bash
npm test               # Run all tests
npm run test:ui        # Run tests with UI
npm run test:coverage  # Run tests with coverage
npm run test:panel     # Render the production federation bundle in a VM
npm run test:panel:browser # Exercise the production panel in Chromium
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
5. Run `npm run verify:fast` while iterating, then `npm run verify` before the
   change is ready.

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
