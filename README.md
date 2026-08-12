# NMEA 2000 Emitter Cannon

[![npm version](https://img.shields.io/npm/v/signalk-nmea2000-emitter-cannon.svg)](https://www.npmjs.com/package/signalk-nmea2000-emitter-cannon)
[![npm downloads](https://img.shields.io/npm/dm/signalk-nmea2000-emitter-cannon.svg)](https://www.npmjs.com/package/signalk-nmea2000-emitter-cannon)
[![CI](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/ci.yml)
[![Plugin CI](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/plugin-ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/plugin-ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.22.2-brightgreen.svg)](https://nodejs.org)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/nearlcrews)

A [Signal K](https://signalk.org) plugin that converts Signal K deltas into
NMEA 2000 messages: 82 configurable data conversions covering 60 data PGNs,
plus the configurable PGN 126464 list broadcast, validated against Canboat definitions and
reviewed against model-specific chartplotter receive lists.

> Built on the foundation of [`signalk-to-nmea2000`](https://github.com/SignalK/signalk-to-nmea2000)
> by Scott Bender and the Signal K community.

## What's new in 1.10.6

- **Safer environmental output.** Standalone pressure now enforces the same
  wire ceiling as the combined environmental conversion, and stored
  temperature and humidity source overrides fall back when they are not valid
  Canboat enums.
- **Clear partial tank frames.** Tank output now omits unavailable numeric
  fields while preserving the NMEA 2000 not-available encoding.
- **Stronger release floors.** Coverage now enforces 90 percent lines, 80
  percent branches, and 90 percent functions.
- **Current shared UI and toolchain.** The panel bundles
  `signalk-nearlcrews-ui` 0.6.2, and compatible development tools are refreshed.

See the v1.10.6 changelog entry and full release history in `CHANGELOG.md`.

## What it does

Signal K is an open marine data standard that streams a boat's navigation,
environment, and electrical data over a single API. NMEA 2000 Emitter Cannon
closes the loop in the other direction: it subscribes to the Signal K paths
your boat publishes and re-emits them as NMEA 2000 PGNs through the server's
NMEA 2000 output, so chartplotters, instrument displays, and autopilots on
the bus see data that originates in Signal K (a weather plugin, a non-NMEA
sensor, a computed value) as native bus traffic.

Every conversion is verified round-trip through the canboatjs encoder. Fields,
ranges, and enum values follow its bundled Canboat definitions, while transport
priorities follow the current stable Canboat 7.1 database. It pairs well with sensor-side plugins such as
[`signalk-virtual-weather-sensors`](https://github.com/NearlCrews/signalk-virtual-weather-sensors).

## Features

- **82 configurable data conversions emitting 60 data PGNs**, plus the plugin's
  configurable PGN 126464 transmit-list broadcast at startup and every five
  minutes. The list advertises only PGNs owned by this plugin.
- **Chartplotter-oriented** PGN priorities, SID fields, temperature-source
  values, and wind and bearing reference enums, with model-specific behavior
  documented instead of assumed across a vendor's entire product line
- **Reactive subscriptions** via RxJS 7.8 with debounced multi-key aggregation
  and per-key freshness timeouts
- **Source filtering** per conversion: keep the fixed Signal K schema path and
  optionally choose a specific `$source` publisher, using consistent exact or
  dot-prefix matching for stream, subscription, and whole-delta conversions
- **Resend timers** for conversions whose values remain current, plus a global
  default. Freshness checks are reapplied on every tick. Event-driven targets,
  course data, timers, and fixed timestamps are never replayed as fresh data
- **Config Advisor** (optional): reviews the Signal K paths your boat
  publishes, recommends which conversions to enable or disable, and flags
  enabled conversions whose pinned `$source` has gone stale (a renamed weather
  provider or a re-enumerated sensor), with optional QuestDB history
- **A React configuration panel** with dense one-line conversion rows, a
  single-open inline editor, a compact sticky toolbar carrying catalog search
  and live status, category tabs with per-category Enable all and Disable all,
  preset chips, a first-run setup wizard, and shared `signalk-nearlcrews-ui`
  controls with Auto, System, Light, Dark, and red-preserving Night themes.
  Auto follows an explicit host theme and otherwise uses Light, while System
  follows the operating-system color scheme.
- **NMEA 2000 echo guards** that use authoritative source metadata to reject
  known bus-origin input instead of re-emitting it onto the same bus. Unknown
  origins remain compatible, a numeric publisher suffix alone is not treated
  as proof of NMEA 2000 origin, and conversions can narrowly declare a
  different-PGN supporting input that is safe to consume from the bus
- **Strict TypeScript**, an ESM plugin bundle, and RxJS as the only runtime
  dependency
- **Embedded canboatjs round-trip tests** on every conversion module, plus
  advisor, lifecycle, panel, and protocol-boundary unit tests

## Screenshots

| Conversion config | Environment category | Config Advisor |
| :---: | :---: | :---: |
| [![Conversion catalog with compact rows and live emit counts](assets/screenshots/config-panel.png)](assets/screenshots/config-panel.png) | [![Environment category conversion rows](assets/screenshots/environment-conversions.png)](assets/screenshots/environment-conversions.png) | [![Config Advisor review controls](assets/screenshots/config-advisor.png)](assets/screenshots/config-advisor.png) |

## Requirements

- [Signal K server](https://github.com/SignalK/signalk-server) 2.x. The React
  config panel loads on every signalk-server 2.x admin UI.
- A browser with native CSS `@scope` support: Chromium or Edge 118, Firefox
  146, or Safari 17.4 and newer.
- Node.js 22.22.2 or newer.
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

1. **Sticky toolbar**: catalog search, a condensed status chip (NMEA 2000
   output readiness, count of enabled vs total conversions, a stale-poll
   marker, and a jump-to-error button), the Configure and Status toggle, the
   theme toggle, and the Setup wizard shortcut. It stays pinned as you scroll.
2. **Config Advisor** (optional, collapsed by default): reviews the Signal K
   paths your boat publishes, recommends which conversions to enable or
   disable, and flags enabled conversions whose pinned `$source` has gone
   stale. Its settings sub-panel covers QuestDB history and a periodic review
   schedule, each control with inline help.
3. **Preset chips** (collapsed by default): Basic Navigation, Engine Set, Full
   AIS, Environmental, Raymarine. Click a chip to enable the tagged conversions
   in one action; presets are additive.
4. **Global resend interval** (seconds, collapsed by default): default cadence
   for every conversion whose own resend is 0. Default `5`; set to `0` to
   disable global resend.
5. **Category tabs** (Navigation, Engine, Electrical, Tanks, Environment, AIS,
   Comms, System), each listing its conversions as dense one-line rows with
   per-category Enable all and Disable all controls. The toolbar's catalog
   search filters by title, PGN number, and Signal K path across all
   categories.

Each conversion row shows an enable checkbox, the title and PGN run, an error
glyph, and a specific live state such as waiting for Signal K input, publisher
filter mismatch, input with no encodable output, or active emission. Clicking
a row opens its editor inline below it (opening another row closes the previous
one). Fixed-path conversions show the read-only **Signal K input path**, an
optional **Signal K publisher (`$source`)** filter, and separate **NMEA 2000
output** controls. Mapping tables group their Signal K input and NMEA 2000
output columns, suggest asset ids found in the server path inventory, check
for the measurements each conversion needs, and block Save when an enabled
mapping is invalid. The inventory refreshes automatically and also provides
visible Refresh and Retry controls. Optional per-path publisher pins follow the
mapping in a collapsed **Advanced publisher filters** section. Mapping editors
cover conversions
that need explicit Signal K paths, identifiers, NMEA 2000 instances, or field
options (`BATTERY`, `ENGINE_PARAMETERS`,
`EXHAUST_TEMPERATURE`, `TANKS`, `SOLAR`, `AC_STATUS`, `CHARGER_STATUS`,
`INVERTER_STATUS`, `VESSEL_TRIP`, `RAYMARINE_BRIGHTNESS`, `NOTIFICATIONS`,
`TEMPERATURE_*`).

Signal K paths are schema-defined data identities, not user-facing labels. For
example, `environment.outside.temperature` is outside air temperature, while
`environment.water.temperature` is water temperature. The publisher field is
only a filter on the update's `$source`; it cannot redirect one path to the
other. The panel blocks a publisher filter that repeats its own input path. Use
`TEMPERATURE2_SEA` for modern PGN 130316 water temperature, or the manual
`TEMPERATURE_SEA` compatibility conversion for PGN 130312.

The config panel loads on any signalk-server 2.x admin UI. v1.4.x config
payloads migrate transparently the first time the panel loads them.

### Vessel Trip estimates

`VESSEL_TRIP` is disabled by default. In its mapping editor, add every fuel
tank that supplies the selected engines, using its canonical
`tanks.fuel.<id>` Signal K path, then add every consuming engine by the
identifier used under `propulsion.<id>`. The plugin emits remaining fuel only
after every configured tank has a current value. It adds time to empty only
when every configured engine has a current fuel rate, and adds distance to
empty when current speed over ground is also available.

For a Raymarine Fuel Manager display, also configure the chartplotter's fuel
settings and provide PGN 127489 or 127497 for fuel consumption, plus PGN
129026 with GNSS for distance to empty. Enable `ENGINE_PARAMETERS` or
`ENGINE_TRIP`, plus `COG_SOG`, when this plugin must provide those supporting
messages. Other chartplotters have model- and firmware-specific requirements.
See the PGN reference in `docs/pgn-reference.md` for the
calculation, freshness behavior, limitations, and current compatibility notes.

## Documentation

- PGN reference in `docs/pgn-reference.md`: all 61 plugin PGNs, conversion
  modules, bus-layer PGNs, and chartplotter guidance
- Troubleshooting in `docs/troubleshooting.md`
- Development guide in `docs/development.md`
- Changelog in `CHANGELOG.md`
- [Contributing](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/blob/main/.github/CONTRIBUTING.md)
- [Security policy](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/blob/main/.github/SECURITY.md)

## Development

The published plugin requires Node 22.22.2 or newer. Source builds support Node
22 from 22.22.2, Node 24 from 24.15.0, and Node 26. The repository pins Node
22.22.2 and npm 12.0.2, while CI verifies on the minimum Node release and the
current Node 24 release.
CanboatJS and `@canboat/ts-pgns` are exercised in the test suite and are not
runtime dependencies. `signalk-nearlcrews-ui` is bundled into the panel as a
pinned development dependency, while React and React DOM are supplied by Signal
K Admin.

```bash
git clone https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon.git
cd signalk-nmea2000-emitter-cannon
npm install
npm run hooks        # one-time: enable the pre-commit hook
npm run build        # esbuild plugin bundle plus webpack panel
npm test             # Vitest suite
npm run check        # type-check the plugin, the panel, and the tests
npm run lint         # code, Markdown, and spelling checks
npm run ci:workflows # action pins and release-workflow invariants
npm run format       # Biome auto-format
npm run verify       # local full verification gate
```

The repository-owned pre-commit hook runs formatting, lint, architecture, and
dead-code gates. The pre-push hook runs `npm run verify` serially. Run
`npm run verify:release` before preparing a release.
See `docs/development.md` for the full workflow.

## License

Apache-2.0: see the `LICENSE` file for the full text. The software is
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
- [Security issues](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/blob/main/.github/SECURITY.md)
