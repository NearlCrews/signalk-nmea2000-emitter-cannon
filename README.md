# Signal K NMEA2000 Emitter Cannon

[![npm version](https://img.shields.io/npm/v/signalk-nmea2000-emitter-cannon.svg)](https://www.npmjs.com/package/signalk-nmea2000-emitter-cannon)
[![npm downloads](https://img.shields.io/npm/dm/signalk-nmea2000-emitter-cannon.svg)](https://www.npmjs.com/package/signalk-nmea2000-emitter-cannon)
[![License](https://img.shields.io/github/license/NearlCrews/signalk-nmea2000-emitter-cannon.svg)](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/blob/main/LICENSE)
[![CI](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/ci.yml)

A Signal K plugin that converts Signal K deltas into NMEA 2000 messages. 45 conversion modules covering 52 data PGNs, aligned with Garmin ECHOMAP / GPSMAP / GMI specifications and the canboatjs encoder. Pairs well with sensor-side plugins such as [`signalk-virtual-weather-sensors`](https://github.com/NearlCrews/signalk-virtual-weather-sensors).

> Built on the foundation of [`signalk-to-nmea2000`](https://github.com/SignalK/signalk-to-nmea2000) by Scott Bender and the Signal K community.

## What's new in 1.4.3

- Notification PGN 126983/126985 correctness: `alertCategory` now derived from the Signal K path (`notifications.mob`, `notifications.navigation.*`, `notifications.anchor`, `notifications.arrival`, `notifications.gnss` route to Navigational; everything else stays Technical), `alertPriority` mapped from Signal K state per IEC 62923 (emergency=1, alarm=2, warn=3, alert=4) instead of hardcoded 0, unknown states fall through to Caution with a debug log.
- alertId allocator now recycles released IDs via a `Set<number>` pool, structurally bounded to the 16-bit `alertId` field range. The cached PGN list returned to the resend pipeline is rebuilt only on map mutation, restoring zero-allocation behavior on dedup callbacks.
- Raymarine Seatalk Alarms (PGN 65288) prefix map expanded from 2 entries to 12, covering depth, WP arrival, GPS failure, cross-track error, and the most common autopilot alarms.
- Route waypoint (PGN 129285) no longer emits malformed `nitems: 0` messages when only a route name is present.
- New `matchPathPrefix` shared helper in `utils/pathUtils.ts` replaces two near-duplicate prefix-match functions.
- Repo hygiene: Apache 2.0 LICENSE filled in (Copyright 2026 Nearl Crews), `.gitignore` hardened with cert/key/secret patterns and local agent state, SECURITY.md supported-versions refreshed to 1.4.x, default branch reconciled from `master` to `main`. Community files added: `CODE_OF_CONDUCT.md`, `.github/CODEOWNERS`, structured YAML issue forms, CodeQL workflow, Dependabot config, branch ruleset on `main`.
- Deferred: PGN 126984 (Alert Response, inbound) and PGN 126986 (Alert Configuration). The typed Signal K server API does not expose an inbound NMEA 2000 hook, so closing the alert-acknowledgement round-trip needs a separate design pass. See CHANGELOG for the full deferred list.

### What's new in 1.4.2

- Admin UI polish from a four-expert team review: schema descriptions rewritten with actionable language and concrete examples, `MAGNETIC_VARIANCE` renamed to `Magnetic Variation` to match the SK spec, brand normalized to "NMEA 2000" everywhere, AIS PGN list ordered ascending.
- Admin form correctness: `ATTITUDE` dead per-axis source filters collapsed to the single subscribed parent path; `required` arrays added to BATTERY/ENGINE_PARAMETERS/TANKS/RAYMARINE_BRIGHTNESS/EXHAUST_TEMPERATURE array mappings so half-filled rows can no longer be silently dropped.
- Source-filter completeness gaps closed for `SEA_TEMP`, `TRANSMISSION_PARAMETERS`, and `NAVIGATION_DATA_GREAT_CIRCLE`.
- Conversion module titles normalized across all 45 modules to `"<Title> (PGN <n>)"` / `"<Title> (PGNs <a>, <b>)"` with notable renames (`TrueHeading` to `True Heading`, `Location` to `GPS Position`, `Sea/Air Temp` to `Sea Temperature`, etc.).
- Plugin status surfaces: actionable N=0 message, "Waiting for NMEA 2000 output" state when the plugin starts before the server announces N2K output is available with a deferred refresh once the event fires.
- New per-key error throttle (60 s window) prevents log floods from flaky sources, applied to callback, process, resend, subscription, and stream error paths. Sub-conversions (per-battery, per-engine, per-tank, per-temperature) now get distinct throttle keys and log labels.
- Plugin now ships the family icon set (`assets/icons/icon.svg` plus 72/96/192/512 PNGs) shared with the sibling Signal K plugins, with a transmitter-broadcast badge glyph that reads as "emit" rather than "upload". The pre-family standalone cannon icon is removed.

### What's new in 1.4.0

- 30+ correctness fixes from a four-expert Signal K compliance review. Wire-level bugs in seven PGNs corrected (magneticVariance unit, dscCalls MMSI type, smallCraftStatus scaling, AIS SAR altitude sentinel, transmissionGear classification, bearingDistance reference fields, wind partial-data behavior).
- Two inert features fixed: `RAYMARINE_BRIGHTNESS` and `EXHAUST_TEMPERATURE` now expose `groups` / `engines` array mappings in the admin UI.
- Schema and path corrections: `RUDDER` subscribes to canonical `steering.rudderAngle` (was a non-spec `.main` suffix), `MAGNETIC_VARIANCE` source-path typo fixed, `ROUTE_WP_LIST` advertised PGN corrected to 130074, seven source-filter mismatches normalised.
- Validation hardening: NaN and Infinity rejected at every numeric boundary, sub-second precision restored in PGN 126992 SystemTime, battery PGN 127506/127508 emit `undefined` sentinel instead of `null`.
- Type system tightened to `JSONSchema7`, `PluginOptions` split into nested internal + raw wire shapes via `normalizePluginOptions`, `notifications.ts` typed via the official `Delta`.
- Lifecycle hardening: `startPlugin` re-entry guard, `stopped` guards in every delta path, listener cleanup on every restart.

See [CHANGELOG.md](CHANGELOG.md) for the full list.

## Features

- **45 conversion modules, 52 data PGNs** plus 3 ISO PGNs advertised in the 126464 transmit list
- **Garmin-aligned** PGN priorities, SID fields, temperature-source enum values, and wind/bearing reference enums verified against the Garmin ECHOMAP UHD2 6/7/9 sv Owner's Manual (April 2026 v13)
- **Strict TypeScript** under every TS 6 strict flag (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`)
- **Reactive subscriptions** via RxJS 7.8 with debounced multi-key aggregation and per-key freshness timeouts
- **Source filtering** per conversion: pick a specific `$source` label or accept any
- **Resend timers** per conversion plus a global default, so MFDs that expect periodic re-broadcast still see the data when the underlying source is quiet
- **Single ~340 KB ESM bundle** via esbuild; the only runtime dependency is RxJS (`@signalk/server-api` is type-only)
- **Embedded canboatjs round-trip tests** on every conversion module (21 tests across 6 files)
- **`$source: 'NMEA2000'` echo-guard** on AIS conversions to avoid re-emitting received AIS deltas back onto the bus
- **Apache 2.0**, pure ESM, Node 20.18+

## Installation

Prerequisites: Node.js 20.18+, Signal K server 2.20+, and a supported NMEA 2000 gateway (e.g. Actisense NGT-1, Yacht Devices YDNR-02) connected so emitted messages reach the bus.

### Via Signal K AppStore

Open the Signal K admin UI, navigate to AppStore, search for `signalk-nmea2000-emitter-cannon`, click Install.

### From npm

```bash
cd ~/.signalk
npm install signalk-nmea2000-emitter-cannon
```

### From source

```bash
git clone https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon.git
cd signalk-nmea2000-emitter-cannon
npm install
npm run build
ln -s "$(pwd)" ~/.signalk/node_modules/signalk-nmea2000-emitter-cannon
```

## Configuration

In the Signal K admin UI, open Server → Plugin Config, find "Signal K NMEA2000 Emitter Cannon", enable the plugin, then configure each PGN conversion individually.

### Per-conversion options

| Setting | Description | Default |
|---------|-------------|---------|
| **Enabled** | Toggle this conversion on or off | `false` |
| **Resend** (seconds) | How often to re-emit the last value when no fresh delta has arrived. Overrides the global interval when non-zero. | `0` (use global) |
| **Source filter** | Restrict which `$source` is accepted. Enter a label (e.g. `accuweather`) to match exactly or as a prefix (`gps1` matches `gps1.0`, `gps1.1`, ...). Leave blank to accept any source. | blank |

### Global option

| Setting | Description | Default |
|---------|-------------|---------|
| **Global Resend Interval** (seconds) | Default resend cadence for every conversion whose own `Resend` is 0. Many NMEA 2000 displays expect periodic re-broadcast even when the underlying value is static. | `5` |

### Instance-mapped conversions

Some conversions require an explicit mapping from a Signal K identifier (battery id, engine id, etc.) to an NMEA 2000 instance number or label. These appear as a small editable array in the admin UI:

| Conversion | Mapping |
|---|---|
| `BATTERY` | Signal K battery id (e.g. `starter`, `house`) → N2K battery instance |
| `ENGINE_PARAMETERS` | Signal K engine id → N2K engine instance |
| `EXHAUST_TEMPERATURE` | Signal K engine id → N2K temperature instance |
| `TANKS` | Signal K tank path → N2K tank instance |
| `SOLAR` | Signal K charger id → N2K battery instance |
| `RAYMARINE_BRIGHTNESS` | Signal K display-group id → Raymarine display label (e.g. `Helm 1`) |

### Configuration hygiene

Source filters bind to a literal `$source` value. If you decommission or rename a Signal K plugin, filters pointing at it become silent gates: the conversion looks enabled but drops every delta. Audit periodically by comparing the saved filter value to what's currently on the bus:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/signalk/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}' | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/signalk/v1/api/vessels/self/<path>" \
  | jq -r '."$source"'
```

If the live `$source` differs from your saved filter, the conversion is being silently gated. Update the filter or clear it (blank = accept any). Conversions with no published source for their path remain inert and cost nothing beyond startup work; disable them if you know they won't see data on your boat.

## Supported PGNs (52 data PGNs across 45 modules)

All PGNs are aligned with Garmin specifications (corrected priorities, SID fields, field names, reference enums).

### Navigation & Positioning

| PGN | Description | Module |
|--------|-------------|--------|
| 127245 | Rudder Position | `rudder.ts` |
| 127250 | Vessel Heading / True Heading | `heading.ts`, `trueheading.ts` |
| 127251 | Rate of Turn | `rateOfTurn.ts` |
| 127252 | Heave | `heave.ts` |
| 127257 | Attitude (pitch, roll, yaw) | `attitude.ts` |
| 127258 | Magnetic Variance | `magneticVariance.ts` |
| 128000 | Leeway | `leeway.ts` |
| 128259 | Speed Through Water | `speed.ts` |
| 128267 | Water Depth | `depth.ts` |
| 129025 | Position (lat/lon) | `gps.ts` |
| 129026 | COG & SOG Rapid Update | `cogSOG.ts` |
| 129029 | GNSS Position Data | `gps.ts` |
| 129283 | Cross Track Error | `navigationData.ts` |
| 129284 | Navigation Data (waypoint) | `navigationData.ts` |
| 129285 | Route/Waypoint Information | `routeWaypoint.ts` |
| 129291 | Set & Drift | `setdrift.ts` |
| 129301 | Time to/from Mark | `timeToMark.ts` |
| 129302 | Bearing & Distance Between Marks | `bearingDistanceBetweenMarks.ts` |
| 129539 | GNSS DOPs | `gnssData.ts` |
| 129540 | GNSS Satellites in View | `gnssData.ts` |
| 130074 | Route WP List | `routeWpList.ts` |
| 130577 | Direction Data | `directionData.ts` |

### AIS

| PGN | Description | Module |
|--------|-------------|--------|
| 129038 | Class A Position Report | `ais.ts` |
| 129039 | Class B Position Report | `aisExtended.ts` |
| 129040 | Class B Extended Position Report | `aisExtended.ts` |
| 129041 | AtoN (Aids to Navigation) | `ais.ts` |
| 129794 | Static & Voyage Data | `ais.ts` |
| 129798 | SAR Aircraft Position | `aisExtended.ts` |
| 129802 | Safety Related Broadcast | `aisExtended.ts` |

### Engine & Propulsion

| PGN | Description | Module |
|--------|-------------|--------|
| 127488 | Engine Parameters Rapid Update | `engineParameters.ts` |
| 127489 | Engine Parameters Dynamic | `engineParameters.ts` |
| 127493 | Transmission Parameters | `transmissionParameters.ts` |
| 127498 | Engine Configuration/Static | `engineStatic.ts` |
| 130576 | Small Craft Status | `smallCraftStatus.ts` |

### Environmental

| PGN | Description | Module | Status |
|--------|-------------|--------|--------|
| 130306 | Wind Data (apparent, true ground, true water) | `wind.ts`, `windTrueGround.ts`, `windTrueWater.ts` | Current |
| 130310 | Environmental Parameters (sea temp legacy) | `seaTemp.ts` | Legacy (still widely supported) |
| 130311 | Environmental Parameters (atmospheric pressure) | `environmentParameters.ts` | Deprecated, replaced by 130313/130314/130316 |
| 130312 | Temperature (exhaust + general-purpose sources) | `engineParameters.ts`, `temperature.ts` | Deprecated, replaced by 130316 |
| 130313 | Humidity (inside/outside) | `humidity.ts` | Current |
| 130314 | Actual Pressure (atmospheric) | `pressure.ts` | Current |
| 130316 | Temperature, Extended Range | `temperature.ts` | Current (preferred by modern Garmin) |

**Recommended for new Garmin installs**: enable the `TEMPERATURE2_*` (PGN 130316), `HUMIDITY_OUTSIDE` (PGN 130313), `PRESSURE` (PGN 130314), `WIND` / `WIND_TRUE_GROUND` / `WIND_TRUE` (PGN 130306) conversions and leave the deprecated `TEMPERATURE_*` (130312) and `ENVIRONMENT_PARAMETERS` (130311) disabled. Modern Garmin ECHOMAP / GPSMAP chartplotters receive all the current PGNs natively. The legacy / deprecated variants remain available for older displays that don't speak the newer PGNs.

### Electrical Systems

| PGN | Description | Module |
|--------|-------------|--------|
| 127505 | Fluid/Tank Level | `tanks.ts` |
| 127506 | DC Detailed Status (state of charge) | `battery.ts`, `solar.ts` |
| 127508 | Battery Status (voltage/current) | `battery.ts`, `solar.ts` |

### Safety & Communications

| PGN | Description | Module |
|--------|-------------|--------|
| 126464 | PGN List (transmit/receive) | `pgnList.ts` |
| 126983 | Alert | `notifications.ts` |
| 126985 | Alert Text | `notifications.ts` |
| 126992 | System Time | `systemTime.ts` |
| 126996 | Product Information | `productInfo.ts` |
| 129799 | Radio Frequency/Mode/Power | `radioFrequency.ts` |
| 129808 | DSC Call Information | `dscCalls.ts` |

### Vendor-Specific

| PGN | Description | Module |
|--------|-------------|--------|
| 65288 | Raymarine (Seatalk) Alarms | `raymarineAlarms.ts` |
| 126720 | Raymarine Display Brightness | `raymarineBrightness.ts` |

### ISO (announced in the transmit PGN list, not emitted by this plugin)

These appear in PGN 126464's transmit list to advertise ISO support, but the plugin itself does not generate them: Signal K's NMEA 2000 stack handles ISO traffic at the bus layer.

| PGN | Description |
|--------|-------------|
| 59392 | ISO Acknowledgement |
| 59904 | ISO Request |
| 60928 | ISO Address Claim |

## Data Flow

```
Signal K deltas (any plugin or device) --> Signal K server bus
                                                |
                                          this plugin (subscribe + source filter)
                                                |
                                          conversion module callback (SK paths --> N2K fields)
                                                |
                                          plugin manager (debounce, freshness check, resend timer)
                                                |
                                          app.emit("nmea2000JsonOut", { prio, pgn, dst, fields })
                                                |
                                          Signal K NMEA2000 provider (e.g. canbus-canboatjs)
                                                |
                                          NMEA 2000 bus --> Garmin / Raymarine / B&G displays
```

## Development

### Prerequisites

- Node.js 20.18+
- TypeScript 6+
- Modern package manager (npm recommended)

### Setup

```bash
git clone https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon.git
cd signalk-nmea2000-emitter-cannon
npm install
```

### Build Commands

```bash
# Development build with watch mode
npm run build:watch

# Production build
npm run build

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format
```

### Project Structure

```
src/
├── index.ts              # Main plugin entry point
├── plugin-manager.ts     # Core plugin lifecycle management
├── schema.ts             # Configuration schema for Signal K admin UI
├── constants.ts          # NMEA 2000 default values (priority, dst, SID)
├── types/                # TypeScript type definitions
│   ├── signalk.ts        # Signal K server types (extends @signalk/server-api)
│   ├── nmea2000.ts       # NMEA 2000 message types
│   ├── plugin.ts         # Plugin-specific types
│   └── index.ts          # Type re-exports
├── utils/                # Utility functions
│   ├── pathUtils.ts      # Signal K path manipulation
│   ├── messageUtils.ts   # NMEA 2000 message utilities
│   ├── dateUtils.ts      # Date/time conversions for N2K
│   ├── errorUtils.ts     # errMessage() coercion helper
│   ├── validation.ts     # Input validation (NaN/Infinity checks)
│   └── smoothing.ts      # Exponential smoothing for sensor data
├── conversions/          # PGN conversion modules (45 modules)
│   ├── index.ts          # Module loader
│   ├── routeTypes.ts     # Shared Position/Waypoint types
│   ├── wind.ts           # Wind data conversion
│   ├── depth.ts          # Depth conversion
│   ├── battery.ts        # Battery status conversion
│   └── ...               # Additional conversions
└── test/                 # Test suites
    ├── index.test.ts        # All conversion-module test cases (round-trip via canboatjs)
    ├── lifecycle.test.ts    # Plugin start/stop/resend lifecycle
    ├── pathUtils.test.ts    # pathToPropName collision regressions
    ├── smoothing.test.ts    # ExponentialSmoother registry behavior
    └── temperature.test.ts  # Temperature default-instance uniqueness
.github/
└── workflows/
    ├── ci.yml            # GitHub Actions CI pipeline (lint, typecheck, test, build)
    └── publish.yml       # Auto-publish to npm on GitHub release (with provenance)
```

### Releasing

`npm run release` (run locally) tags the current `package.json` version, pushes the tag and master, and creates a GitHub release with auto-generated notes. The `Publish to npm` workflow then fires on the `release: published` event, runs typecheck and tests, verifies the tag matches `package.json`, and publishes to npm with sigstore provenance.

The workflow also supports manual `workflow_dispatch` with a `tag` input from the Actions tab, useful for backfilling a release that was created before the workflow existed. Requires an `NPM_TOKEN` repo secret (npm Automation token, or Granular token with publish + read on this package).

### Adding New Conversions

1. Create `src/conversions/yourConversion.ts` using the factory pattern below
2. Import and register in `src/conversions/index.ts` (add to imports and `conversionFactories` array)
3. Add a configuration entry in `src/schema.ts` with `enabled` and `resend` properties
4. Include embedded test cases in the module's `tests` array
5. Run `npm test` and `npm run typecheck`

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

## Technical Details

### Architecture

The plugin subscribes to Signal K data paths via RxJS streams. When values change, conversion callbacks transform them into CanboatJS-format N2K messages (`{ prio, pgn, dst, fields }`) which are emitted to the NMEA 2000 bus. Each conversion module is self-contained with its own Signal K path mappings, conversion logic, and embedded test cases. The plugin manager handles subscription lifecycle, debouncing, data freshness timeouts, and periodic resend timers.

### NMEA 2000 Compliance

All output messages follow the exact CanboatJS format requirements:
- Required metadata: `prio`, `pgn`, `dst`
- All data fields nested under `fields` object
- Field names use camelCase convention
- Proper handling of null/undefined values

### Signal K Integration

- Supports all Signal K subscription types
- Handles multiple data sources with source filtering
- Comprehensive timeout handling for data freshness
- Delta message processing for real-time updates

## Testing

The plugin includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

All conversion modules include embedded test cases that validate:
- Correct PGN message format
- CanboatJS encoding/decoding compatibility
- Signal K data path mapping
- Edge case handling

## Troubleshooting

### PGN not appearing on the NMEA 2000 bus

- Check the Signal K server log for plugin errors.
- Confirm the relevant conversion is enabled in the admin UI.
- Confirm Signal K is publishing the source path you expect (verify with the Signal K data browser).
- **Check that any source filter you've set still matches a live `$source`.** A source filter that points at a decommissioned plugin or a device that no longer publishes the path silently rejects every delta and the conversion appears to be enabled but emits nothing. Audit with:
  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" \
    "http://localhost:3000/signalk/v1/api/vessels/self/<path>" \
    | jq -r '."$source"'
  ```
  Compare the result to the filter value saved in the admin UI for that conversion.

### Configuration changes don't take effect

Signal K reloads plugin configuration when you save it, but some changes (for example, schema additions or new conversion modules) require a full Signal K server restart before they appear.

### Plugin won't start

- Check the Signal K log for `Signal K NMEA2000 Emitter Cannon` errors.
- A common cause is the NMEA 2000 output channel not being initialized: the plugin waits for the `nmea2000OutAvailable` event before emitting messages, so confirm your NMEA 2000 gateway is connected and Signal K has registered an output provider.

### AIS appears to not filter own vessel

The plugin uses `app.selfId` (the Signal K server's self identifier) to filter own-vessel AIS deltas. If `selfId` isn't set on your Signal K server, AIS conversions are skipped entirely. Verify the server has a self identifier configured (usually the vessel's MMSI in urn form).

### No yellow delta-rate bar next to this plugin in the Signal K dashboard

Expected. The yellow bar in the Signal K admin dashboard's **Plugins activity** section visualizes a plugin's `deltaRate`: the rate of Signal K deltas it *produces* into the server via `app.handleMessage(pluginId, delta)`. This plugin is an outbound emitter: it *consumes* Signal K data and writes NMEA 2000 messages out to the bus. Its activity is correctly reported through a different API (`app.reportOutputMessages`) and appears as the plain **"X msg/s"** number to the right of the plugin name. That's the right metric for a plugin of this type; the bar will always be absent unless the NOTIFICATIONS conversion is enabled and actively injecting alerts back into Signal K.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper TypeScript types
4. Add tests for new functionality
5. Ensure all tests pass and code passes linting
6. Submit a pull request

## Compatibility

- **Signal K Server**: 2.20.0+
- **Node.js**: 20.18.0+
- **CanboatJS**: 3.13.0+
- **`@signalk/server-api`**: 2.10.2+
- **TypeScript**: 6.0+ (development only)

### Tech Stack

- TypeScript 6.0 (strict, ESM, Node 20.18+)
- `@signalk/server-api` 2.10+
- RxJS 7.8 (only runtime dependency that ships in the bundle)
- esbuild 0.28 for bundling
- Biome 2.4 for linting / formatting
- Vitest 4.1 for testing (21 tests across 6 files with canboatjs round-trip validation)
- Husky + lint-staged for pre-commit hooks

## License

Apache 2.0 License - see [LICENSE](LICENSE) file for details.

## Author

- **[Nearl Crews](https://github.com/NearlCrews)** - Author, maintainer, and TypeScript conversion

## Acknowledgments

Built on the foundation of [`signalk-to-nmea2000`](https://github.com/SignalK/signalk-to-nmea2000) by Scott Bender and the Signal K community. Full credit to the original authors for the conversion framework and PGN implementations.

- [Signal K Project](https://signalk.org/) for the marine data standard
- [Canboat Project](https://github.com/canboat/canboat) for the NMEA 2000 protocol implementation that the canboatjs encoder is built on

## Support

- [Report a bug](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/issues/new?template=bug_report.md)
- [Request a feature](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/issues/new?template=feature_request.md)
- [Security issues](SECURITY.md)
