# NMEA 2000 Emitter Cannon

[![npm version](https://img.shields.io/npm/v/signalk-nmea2000-emitter-cannon.svg)](https://www.npmjs.com/package/signalk-nmea2000-emitter-cannon)
[![npm downloads](https://img.shields.io/npm/dm/signalk-nmea2000-emitter-cannon.svg)](https://www.npmjs.com/package/signalk-nmea2000-emitter-cannon)
[![CI](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/ci.yml)
[![Plugin CI](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/plugin-ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/plugin-ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen.svg)](https://nodejs.org)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/nearlcrews)

A [Signal K](https://signalk.org) plugin that converts Signal K deltas into
NMEA 2000 messages: 46 conversion modules covering 53 data PGNs, aligned with
Garmin ECHOMAP, GPSMAP, and GMI specifications and the canboatjs encoder.

> Built on the foundation of [`signalk-to-nmea2000`](https://github.com/SignalK/signalk-to-nmea2000)
> by Scott Bender and the Signal K community.

## What's new in 1.7.2

- **Mapping-editor input fix.** The tank and Raymarine brightness mapping
  tables no longer drop a text cell from controlled to uncontrolled when a
  saved row is missing a value.
- **PGN 129041 AtoN type is bounded.** The Aid to Navigation type now clamps
  to its valid 0 to 31 range, so an out-of-range value cannot wrap on the wire.
- **Internal consolidation.** Duplicated logic across the conversions, plugin
  manager, Config Advisor, and admin panel was hoisted into shared helpers and
  utilities, with no change to the emitted PGNs.
- **Dependencies refreshed.** Biome, @signalk/server-api, the Vitest
  toolchain, and others were updated to their latest compatible versions, the
  unused signalk-server devDependency was dropped, and the runtime audit stays
  clean.
- **Bolder app-store icon.** The radiating-arcs transmit glyph was redrawn for
  better legibility at thumbnail size.

No breaking changes; the test suite stays at 141 tests. See the
[v1.7.2 changelog entry](CHANGELOG.md#v172) and the
[full release history](CHANGELOG.md).

## What it does

Signal K is an open marine data standard that streams a boat's navigation,
environment, and electrical data over a single API. NMEA 2000 Emitter Cannon
closes the loop in the other direction: it subscribes to the Signal K paths
your boat publishes and re-emits them as NMEA 2000 PGNs through the server's
NMEA 2000 output, so chartplotters, instrument displays, and autopilots on
the bus see data that originates in Signal K (a weather plugin, a non-NMEA
sensor, a computed value) as native bus traffic.

Every conversion is verified round-trip through the canboatjs encoder, and
PGN priorities, SID fields, and enum values are aligned with Garmin's
published specifications. It pairs well with sensor-side plugins such as
[`signalk-virtual-weather-sensors`](https://github.com/NearlCrews/signalk-virtual-weather-sensors).

## Features

- **46 conversion modules emitting 53 data PGNs**, plus 5 bus-layer PGNs
  (59392, 59904, 60928, 126993, 126996) advertised in the 126464 transmit list
- **Garmin-aligned** PGN priorities, SID fields, temperature-source enum
  values, and wind and bearing reference enums verified against the Garmin
  ECHOMAP UHD2 6/7/9 sv Owner's Manual
- **Reactive subscriptions** via RxJS 7.8 with debounced multi-key aggregation
  and per-key freshness timeouts
- **Source filtering** per conversion: pick a specific `$source` label or
  accept any
- **Resend timers** per conversion plus a global default, so MFDs that expect
  periodic re-broadcast still see the data when the underlying source is quiet
- **Config Advisor** (optional): reviews the Signal K paths your boat
  publishes and recommends which conversions to enable, with optional QuestDB
  history and OpenRouter-powered plain-language explanations
- **A React configuration panel** with a status dashboard, category tabs,
  catalog search, preset chips, a first-run setup wizard, and a theme toggle
  with light, dark, and a red-preserving night mode
- **`$source: 'NMEA2000'` echo guard** on AIS conversions to avoid re-emitting
  received AIS deltas back onto the bus
- **Strict TypeScript**, pure ESM, a single esbuild bundle with RxJS as the
  only runtime dependency
- **Embedded canboatjs round-trip tests** on every conversion module, plus
  advisor, lifecycle, and panel unit tests (141 tests across 13 files)

## Screenshots

| Conversion config | Environment category | Config Advisor |
| :---: | :---: | :---: |
| [![Conversion config panel with per-conversion cards and live emit counts](assets/screenshots/config-panel.png)](assets/screenshots/config-panel.png) | [![Environment category conversions](assets/screenshots/environment-conversions.png)](assets/screenshots/environment-conversions.png) | [![Config Advisor settings](assets/screenshots/config-advisor.png)](assets/screenshots/config-advisor.png) |

## Requirements

- [Signal K server](https://github.com/SignalK/signalk-server) 2.x. The React
  config panel loads on every signalk-server 2.x admin UI.
- Node.js 22.12 or newer.
- A supported NMEA 2000 gateway (for example an Actisense NGT-1 or a Yacht
  Devices YDNR-02) connected so emitted messages reach the bus.

## Installation

Install from the Signal K admin UI under **AppStore, then Available**, or
from npm:

```bash
cd ~/.signalk
npm install signalk-nmea2000-emitter-cannon
```

From source:

```bash
git clone https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon.git
cd signalk-nmea2000-emitter-cannon
npm install
npm run build
ln -s "$(pwd)" ~/.signalk/node_modules/signalk-nmea2000-emitter-cannon
```

## Configuration

In the Signal K admin UI, open **Server, then Plugin Config**, find
"NMEA 2000 Emitter Cannon", and enable the plugin. The plugin ships a React
config panel that the Signal K admin loads via webpack 5 Module Federation.
The panel has these areas:

1. **Status dashboard**: NMEA 2000 output readiness, count of enabled vs total
   conversions, plus per-conversion emit counts and error badges.
2. **Config Advisor** (optional, collapsed by default): reviews the Signal K
   paths your boat publishes and recommends which conversions to enable. Its
   settings sub-panel covers OpenRouter, QuestDB history, and a periodic
   review schedule, each control with inline help.
3. **Preset chips**: Basic Navigation, Engine Set, Full AIS, Environmental,
   Raymarine. Click a chip to enable the tagged conversions in one action;
   presets are additive.
4. **Global resend interval** (seconds): default cadence for every conversion
   whose own resend is 0. Default `5`; set to `0` to disable global resend.
5. **Category tabs** (Navigation, Engine, Electrical, Tanks, Environment, AIS,
   Comms, System), each showing per-conversion cards, with a catalog search
   that filters by title, PGN number, and Signal K path across all categories.

Each conversion card exposes an **Enabled** toggle, a per-conversion **Resend**
override, a **Source filter** dropdown (populated live from the server's data
model), and a **Mapping editor** on conversions that need an explicit Signal K
identifier to NMEA 2000 instance mapping (`BATTERY`, `ENGINE_PARAMETERS`,
`EXHAUST_TEMPERATURE`, `TANKS`, `SOLAR`, `RAYMARINE_BRIGHTNESS`,
`NOTIFICATIONS`, `TEMPERATURE_*`).

The config panel loads on any signalk-server 2.x admin UI. v1.4.x config
payloads migrate transparently the first time the panel loads them.

## Documentation

- [PGN reference](docs/pgn-reference.md): all 53 data PGNs, modules, and the
  Garmin recommendations
- [Troubleshooting](docs/troubleshooting.md)
- [Development guide](docs/development.md)
- [Changelog](CHANGELOG.md)
- [Contributing](.github/CONTRIBUTING.md)
- [Security policy](.github/SECURITY.md)

## Development

This project targets Node 22.12 or newer, with TypeScript 6 and Biome
(development only). canboatjs is exercised in the test suite and bundled
into the build, not installed at runtime.

```bash
git clone https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon.git
cd signalk-nmea2000-emitter-cannon
npm install
npm run hooks        # one-time: enable the pre-commit hook
npm run build        # esbuild plugin bundle plus webpack panel
npm test             # Vitest suite (141 tests)
npm run typecheck    # type-check the plugin, the panel, and the tests
npm run check        # full Biome check
npm run lint         # Biome linting only
npm run format       # Biome auto-format
```

Run `npm run check`, `npm run typecheck`, and `npm test` before committing.
See the [development guide](docs/development.md) for the full workflow.

## License

Apache-2.0: see [LICENSE](LICENSE) for the full text. The software is
provided "AS IS", without warranty of any kind. Data this plugin places on
the NMEA 2000 bus is advisory: always carry independent means of navigation
and verify against your primary instruments.

## Acknowledgments

Built on the foundation of [`signalk-to-nmea2000`](https://github.com/SignalK/signalk-to-nmea2000)
by Scott Bender and the Signal K community. Full credit to the original
authors for the conversion framework and PGN implementations. NMEA 2000
Emitter Cannon is written and maintained by
[Nearl Crews](https://github.com/NearlCrews).

- [Signal K Project](https://signalk.org/) for the open marine data standard
- [Canboat Project](https://github.com/canboat/canboat) for the NMEA 2000
  protocol implementation that the canboatjs encoder is built on

NMEA 2000 Emitter Cannon pairs well with sibling plugins such as
[`signalk-virtual-weather-sensors`](https://github.com/NearlCrews/signalk-virtual-weather-sensors),
[`signalk-openrouter-companion`](https://github.com/NearlCrews/signalk-openrouter-companion),
and [`signalk-crows-nest`](https://github.com/NearlCrews/signalk-crows-nest).

## Support

Find this plugin useful? You can support its continued development by
[buying me a coffee](https://www.buymeacoffee.com/nearlcrews).

- [Report a bug](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/issues/new?template=feature_request.yml)
- [Security issues](.github/SECURITY.md)
