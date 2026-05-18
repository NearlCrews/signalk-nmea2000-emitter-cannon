# NMEA 2000 Emitter Cannon

[![npm version](https://img.shields.io/npm/v/signalk-nmea2000-emitter-cannon.svg)](https://www.npmjs.com/package/signalk-nmea2000-emitter-cannon)
[![npm downloads](https://img.shields.io/npm/dm/signalk-nmea2000-emitter-cannon.svg)](https://www.npmjs.com/package/signalk-nmea2000-emitter-cannon)
[![License](https://img.shields.io/github/license/NearlCrews/signalk-nmea2000-emitter-cannon.svg)](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/blob/main/LICENSE)
[![CI](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/actions/workflows/ci.yml)

A Signal K plugin that converts Signal K deltas into NMEA 2000 messages. 46
conversion modules covering 53 data PGNs, aligned with Garmin ECHOMAP / GPSMAP
/ GMI specifications and the canboatjs encoder. Pairs well with sensor-side
plugins such as [`signalk-virtual-weather-sensors`](https://github.com/NearlCrews/signalk-virtual-weather-sensors).

> Built on the foundation of [`signalk-to-nmea2000`](https://github.com/SignalK/signalk-to-nmea2000)
> by Scott Bender and the Signal K community.

## What's New in v1.6.3

v1.6.3 fixes a Config Advisor bug that could wipe saved settings. A historical
save bug could nest the stored config under repeated `configuration` keys; the
advisor's config read unwrapped only one layer, so on a deeper nesting it saw
an empty config and the recommender rebuilt it from scratch, dropping the
Battery, Notifications, Engine, Tanks, and Solar conversions along with every
per-conversion source filter. The advisor now flattens the envelope through the
same migration the admin panel already uses.

See the [v1.6.3 changelog entry](CHANGELOG.md#v163) and the
[v1.6.3 release](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/releases/tag/v1.6.3).
[Full release history](CHANGELOG.md).

## Features

- **46 conversion modules emitting 53 data PGNs**, plus 5 bus-layer PGNs
  (59392, 59904, 60928, 126993, 126996) advertised in the 126464 transmit list
- **Garmin-aligned** PGN priorities, SID fields, temperature-source enum
  values, and wind/bearing reference enums verified against the Garmin ECHOMAP
  UHD2 6/7/9 sv Owner's Manual
- **Strict TypeScript** under every TS 6 strict flag
- **Reactive subscriptions** via RxJS 7.8 with debounced multi-key aggregation
  and per-key freshness timeouts
- **Source filtering** per conversion: pick a specific `$source` label or
  accept any
- **Resend timers** per conversion plus a global default, so MFDs that expect
  periodic re-broadcast still see the data when the underlying source is quiet
- **Config Advisor** (optional): reviews the Signal K paths your boat
  publishes and recommends which conversions to enable, with optional QuestDB
  history and OpenRouter-powered plain-language explanations
- **Single ESM bundle** via esbuild; the only runtime dependency is RxJS
- **Embedded canboatjs round-trip tests** on every conversion module, plus
  advisor unit tests (113 tests across 13 files)
- **`$source: 'NMEA2000'` echo-guard** on AIS conversions to avoid re-emitting
  received AIS deltas back onto the bus
- **Apache 2.0**, pure ESM, Node 22.12+

## Requirements

- Node.js 22.12+
- Signal K server 2.27.0+ (older versions ship an admin UI that cannot load
  the federated React config panel; conversions still run, but the settings
  page will not)
- A supported NMEA 2000 gateway (e.g. Actisense NGT-1, Yacht Devices YDNR-02)
  connected so emitted messages reach the bus

## Installation

Install from the Signal K Admin UI under **AppStore -> Available**, or from
npm:

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

In the Signal K admin UI, open **Server -> Plugin Config**, find "NMEA 2000
Emitter Cannon", and enable the plugin. The plugin ships a React config panel
that the Signal K admin loads via webpack 5 Module Federation. The panel has
these areas:

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
   whose own resend is 0. Default `5`.
5. **Category tabs** (Navigation, Engine, Electrical, Tanks, Environment, AIS,
   Comms, System), each showing per-conversion cards.

Each conversion card exposes an **Enabled** toggle, a per-conversion **Resend**
override, a **Source filter** dropdown (populated live from the server's data
model), and a **Mapping editor** on conversions that need an explicit Signal K
identifier to NMEA 2000 instance mapping (`BATTERY`, `ENGINE_PARAMETERS`,
`EXHAUST_TEMPERATURE`, `TANKS`, `SOLAR`, `RAYMARINE_BRIGHTNESS`,
`NOTIFICATIONS`, `TEMPERATURE_*`).

The config panel requires `@signalk/server-admin-ui >= 2.27.0` (bundled with
signalk-server 2.x). v1.4.x config payloads migrate transparently the first
time the panel loads them.

## Documentation

- [PGN reference](docs/pgn-reference.md): all 53 data PGNs, modules, and the
  Garmin recommendations
- [Troubleshooting](docs/troubleshooting.md)
- [Development guide](docs/development.md)
- [Changelog](CHANGELOG.md)
- [Contributing](.github/CONTRIBUTING.md)
- [Security policy](.github/SECURITY.md)

## Compatibility

- **Signal K Server**: 2.27.0+ (the federated React config panel requires admin
  UI 2.27+; conversions run on older servers but the settings page does not)
- **`@signalk/server-admin-ui`**: 2.27.0+
- **Node.js**: 22.12+
- **CanboatJS**: 3.13.0+
- **`@signalk/server-api`**: 2.10.2+
- **TypeScript**: 6.0+ (development only)

## License

Apache-2.0: see [LICENSE](LICENSE).

## Author

[Nearl Crews](https://github.com/NearlCrews) - author, maintainer, and
TypeScript conversion.

## Acknowledgments

Built on the foundation of [`signalk-to-nmea2000`](https://github.com/SignalK/signalk-to-nmea2000)
by Scott Bender and the Signal K community. Full credit to the original authors
for the conversion framework and PGN implementations.

- [Signal K Project](https://signalk.org/) for the marine data standard
- [Canboat Project](https://github.com/canboat/canboat) for the NMEA 2000
  protocol implementation that the canboatjs encoder is built on

## Support

- [Report a bug](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/issues/new?template=bug_report.md)
- [Request a feature](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/issues/new?template=feature_request.md)
- [Security issues](.github/SECURITY.md)
