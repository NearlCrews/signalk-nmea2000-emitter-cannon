# Development

## Prerequisites

- Node.js `^22.22.2 || ^24.15.0 || ^26.0.0` (`.node-version` pins 22.22.2 for
  local development)
- npm 12.0.2 for local development (`packageManager` pins npm 12.0.2)
- TypeScript, installed by the repository. `npm run check` type-checks with
  TypeScript 7 and `npm run check:ts6` repeats the check with the TypeScript 6
  compiler API that the linters still load. See the toolchain notes in
  `.github/CONTRIBUTING.md` for why both are installed.

The `devEngines` compatibility floor admits npm 10.9.7 because setup-node and
the official Signal K Plugin CI begin with the npm bundled by their selected
Node release. Repository-owned CI invokes npm 12.0.2 directly without replacing
the runner's bundled npm installation, and it runs the complete release gate on
Node 22.22.2 and the current Node 24 release. Signal K Plugin CI separately
verifies its supported installation matrix.

## Setup

```bash
git clone https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon.git
cd signalk-nmea2000-emitter-cannon
npm install
npm run hooks          # one-time: enable the repository-owned Git hooks
npx playwright install chromium webkit
```

Git hooks are not auto-installed on `npm install`, because lifecycle hooks can
interfere with Signal K's package-install checks. Run `npm run hooks` once after
cloning. The pre-commit hook runs the fast code-quality gates, and the pre-push
hook runs full verification serially for predictable memory use on small hosts.

The panel browser check drives Chromium and WebKit through Playwright, so
install both engines once after cloning and again after a Playwright major or
minor bump. Without them `npm run verify` fails on a missing browser build.

## Build commands

```bash
npm run build          # Production build (esbuild plugin + webpack panel)
npm run build:watch    # Development build with watch mode
npm test               # Run all tests (Vitest)
npm run test:ui        # Run tests with interactive UI
npm run test:coverage  # Run tests with coverage report
npm run check          # Strict TypeScript 7 validation for runtime, panel, and tests
npm run check:ts6      # The same checks under the TypeScript 6 compiler API
npm run lint           # Biome, typed ESLint, Markdown, and spelling checks
npm run cruise         # Module-boundary and cycle checks
npm run deadcode       # Unused file, dependency, and export checks
npm run format         # Biome auto-format with --write
npm run format:check   # Formatting check without writes
npm run verify         # Coverage, build, panel smoke, and size gates
npm run verify:release # Verify plus package contents and security audits
npm run audit          # Separate runtime and policy-aware full dependency audits
```

The release audit requires zero runtime findings. The latest canboatjs test
dependency still inherits `GHSA-mh99-v99m-4gvg` through its legacy MQTT
toolchain, so `scripts/check-audit.mjs` permits only that exact development-only
chain. Any additional package, advisory, severity change, or runtime finding
fails closed. Remove the exception when canboatjs publishes a clean dependency
tree.

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
│   ├── migrate.ts        # Load-time migration from v1.4.x legacy config
│   ├── validation.ts     # Cross-field and mapping validation
│   └── windConflicts.ts  # Shared competing wind-producer rules
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
│   ├── conversionStyles.ts # Dense conversion list and editor styles, the only panel style module; every value reads a public signalk-nearlcrews-ui token
│   ├── components/       # ConversionRow, ConversionDetail, PanelToolbar, CatalogSection, etc.
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
├── conversions/          # 51 data conversion factory modules plus the PGN list module
│   ├── index.ts          # Module loader / registry
│   ├── routeTypes.ts     # Shared position and route-mark helpers
│   ├── wind.ts           # Wind data conversion
│   ├── depth.ts          # Depth conversion
│   ├── battery.ts        # Battery status conversion
│   └── ...               # 48 more conversion factories
└── test/                 # Vitest test suites
    ├── index.test.ts          # All conversion-module test cases (round-trip via canboatjs)
    ├── advisor.test.ts        # Config Advisor: recommender, inventory, QuestDB, stale-source, orchestrator
    ├── advisor-config.test.ts # Advisor config defaults vs schema
    ├── aisFreshness.test.ts   # AIS per-field freshness, cache bounds, and malformed input
    ├── api.test.ts            # /api/* routing, validation, and error responses
    ├── deltaBatchSafety.test.ts  # AIS and alert mixed-source, batch, and removal handling
    ├── discovery.test.ts      # Path / source enumeration
    ├── lifecycle.test.ts      # Plugin start/stop/resend lifecycle
    ├── marineConversions.test.ts # GNSS, wind, alert, and PGN-list protocol boundaries
    ├── migrate.test.ts        # v1.4.x legacy config migration
    ├── pathUtils.test.ts      # pathToPropName collision regressions
    ├── rowStatus.test.ts      # Panel row status derivation (rail, recency)
    ├── schedule.test.ts       # AdvisorScheduler periodic-review timer
    ├── smoothing.test.ts      # ExponentialSmoother registry behavior
    ├── status.test.ts         # PluginManager.getStatusSnapshot + getConversionMetadata
    ├── temperature.test.ts    # Temperature default-instance uniqueness
    ├── useAdvisor.test.ts     # Advisor panel state and async apply lifecycle
    ├── useConfig.test.ts      # Panel useConfig reducer (setAdvisor, preset apply)
    └── ...                    # 16 more focused suites (AIS ranges, DSC, vessel trip, PGN priorities, and others)
public/                   # Webpack module federation output (shipped via "files" array)
├── remoteEntry.js        # Federation entry script (classic var-type container)
└── *.js / *.LICENSE.txt  # Federation chunks
webpack.config.cjs        # Classic module federation build config
tsconfig.panel.json       # Panel-specific TypeScript config (jsx: react-jsx)
tsconfig.test.json        # TypeScript config for the src/test/ suite
.github/
└── workflows/
    ├── ci.yml            # Complete release verification on Node 22.22.2 and 24
    ├── plugin-ci.yml     # Official SignalK reusable plugin-ci workflow (cross-platform)
    ├── publish.yml       # Auto-publish to npm on GitHub release (with provenance)
    └── workflow-security.yml # Pinned actionlint and zizmor checks
```

GitHub's repository-managed CodeQL default setup scans JavaScript, TypeScript,
and Actions. Do not add an advanced CodeQL workflow while default setup remains
enabled because GitHub rejects uploads from the competing configuration.

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
npm run test:panel:browser # Chromium and WebKit interactions, layouts, themes, and Axe
npm run ci:workflows      # Action pins and release-workflow invariants
```

## Adding new conversions

1. Create `src/conversions/yourConversion.ts` using the factory pattern below.
2. Import and register in `src/conversions/index.ts` (add to imports and the
   `dataConversionFactories` array).
3. If the conversion has custom mapping or field editors, add an `ExtrasMeta`
   entry in `src/api/extras-meta.ts`; otherwise this step is unnecessary
   because the TypeBox schema in `src/config/schema.ts` already accepts any
   conversion key with `enabled`, `resend`, `sources`, and `extras`.
4. Bound every numeric field against the wire before emitting it. A canboatjs
   field does not reject an out-of-range value: it wraps by the field modulus,
   so bad input reaches the receiver as a different, believable reading rather
   than as not-available. Use `toFiniteInRange` against a named ceiling in
   `src/constants.ts`, and apply it after any unit conversion, in the units the
   wire carries. Choose the failure mode deliberately: a circular quantity wraps
   through `toSignedAngle` or `toUnsignedAngle`, because 4 rad and -2.2832 rad
   name the same direction, while a bounded mechanical quantity such as a rudder
   deflection is dropped, because an out-of-range value there is simply bad
   data. Drop the whole frame when nothing encodable is left.
5. Include embedded test cases in the module's `tests` array. A range regression
   case must use an input the previous bound admitted; one the old code already
   rejected is a green test that proves nothing.
6. Run `npm run verify:fast` while iterating, then `npm run verify` before the
   change is ready.

The title must carry its PGN run as `(PGN 12345)` or `(PGNs 12345, 12346)`.
`extractPgnsFromTitle` reads that shape to build the PGN 126464 transmit list
and the panel's PGN badges, and returns nothing for any other format.

Each conversion module carries a required `category` field (one of
`navigation`, `engine`, `electrical`, `tanks`, `environment`, `ais`, `comms`,
`system`) and an optional `presets` array (e.g. `["basic-nav"]`). These drive
the category tabs and preset chips in the React panel. See `CLAUDE.md` for the
full set of conventions, the extras-editor wiring contract, and the
source-discovery rules the panel relies on.

Example conversion module:

```typescript
import { MAX_MY_FIELD, N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";
import { toFiniteInRange } from "../utils/validation.js";

export default function createMyConversion(
  app: SignalKApp
): ConversionModule<[number | null]> {
  return {
    title: "My Conversion (PGN 12345)",
    optionKey: "MY_CONVERSION",
    keys: ["path.to.signalk.data"],
    callback: ((value: number | null) => {
      // The field wraps rather than refusing an oversized value, so bound it
      // here. Nothing encodable is left, so the frame is dropped.
      const myField = toFiniteInRange(value, 0, MAX_MY_FIELD);
      if (myField === undefined) return [];

      return [{
        prio: N2K_DEFAULT_PRIORITY,
        pgn: 12345,
        dst: N2K_BROADCAST_DST,
        fields: {
          myField,
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
      {
        // A value past the field ceiling wrapped onto the bus before the bound.
        input: [MAX_MY_FIELD + 1],
        expected: [],
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
