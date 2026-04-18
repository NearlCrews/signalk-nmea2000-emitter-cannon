# Signal K NMEA2000 Emitter Cannon

![npm version](https://badge.fury.io/js/signalk-nmea2000-emitter-cannon.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Signal K](https://img.shields.io/badge/Signal%20K-00D4AA?style=flat&logo=sailboat&logoColor=white)

A modern TypeScript Signal K server plugin that converts Signal K data to NMEA 2000 format with enhanced Garmin compatibility. Features complete TypeScript conversion with 100% PGN coverage for comprehensive marine electronics integration.

> **Built on the foundation of [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000)**
>
> This plugin is a modernized and enhanced version of the original signalk-to-nmea2000 plugin by Scott Bender and the Signal K community. Full credit to the original authors for the excellent foundation and protocol implementation.

## Features

- **Modern TypeScript**: Fully converted to TypeScript 5.9+ with strict type safety
- **Complete PGN Coverage**: 45 conversion modules supporting 57 NMEA 2000 Parameter Group Numbers
- **Signal K Native**: Seamless integration with Signal K server ecosystem using official `@signalk/server-api`
- **Garmin Compatibility**: Aligned with Garmin PGN specifications and canboatjs framework
- **Reactive Processing**: Built on RxJS 7.8 for efficient real-time data processing
- **High Performance**: Modern build system with esbuild for fast compilation (~207kb bundle)
- **Fully Tested**: Comprehensive test suite with Vitest and CanboatJS validation
- **Modern Dependencies**: es-toolkit, RxJS 7.8, pure ESM modules
- **Latest Tooling**: Biome for linting/formatting, zero errors and warnings
- **CI/CD Ready**: GitHub Actions workflow with multi-version Node.js testing
- **Developer Experience**: Pre-commit hooks with husky + lint-staged

## Installation

### Prerequisites

- Node.js 20 or higher
- Signal K server
- A supported NMEA 2000 gateway (e.g., Actisense NGT-1, Yacht Devices YDNR-02) connected to Signal K for messages to reach the NMEA 2000 bus
- npm or compatible package manager

### Install via Signal K AppStore

1. Open Signal K server admin interface
2. Navigate to AppStore
3. Search for "signalk-nmea2000-emitter-cannon"
4. Click Install

### Manual Installation

**Option 1: From npm registry**
```bash
cd ~/.signalk
npm install signalk-nmea2000-emitter-cannon
```

**Option 2: Link for development**
```bash
# Build and link from the source directory
npm run build
cd ~/.signalk
npm link /path/to/signalk-nmea2000-emitter-cannon
```

## Configuration

1. Navigate to Server → Plugin Config in Signal K admin interface
2. Find "Signal K NMEA2000 Emitter Cannon" in the plugin list
3. Enable the plugin
4. Configure individual PGN conversions as needed

### Configuration Options

Each conversion can be individually enabled and configured:

- **Enabled**: Toggle individual PGN conversions on/off
- **Resend interval** (seconds): How often to re-emit the message even when the source value hasn't changed. Many NMEA 2000 displays expect periodic updates — set to 0 to only send on value change.
- **Resend duration** (seconds): How long to keep resending after the last source update. Prevents stale data from being emitted indefinitely.
- **Source filter**: When multiple Signal K sources provide the same data path (e.g., two GPS receivers), enter a source name here to use only that source. Leave blank to accept any source.

Some conversions require instance mapping to match your NMEA 2000 network:

- **Battery**: Map each Signal K battery ID to an NMEA 2000 battery instance ID
- **Engine**: Map each Signal K engine ID to an NMEA 2000 engine instance ID
- **Tank**: Map each Signal K tank path to an NMEA 2000 tank instance ID
- **Solar**: Map each Signal K solar charger ID to an NMEA 2000 battery instance ID

## Supported PGNs (57 PGNs across 45 modules)

All PGNs are aligned with Garmin specifications (corrected priorities, SID fields, field names).

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
| 128259 | Speed (water/ground) | `speed.ts` |
| 128267 | Water Depth | `depth.ts` |
| 128275 | Distance Log | `speed.ts` |
| 129025 | Position (lat/lon) | `gps.ts` |
| 129026 | COG & SOG Rapid Update | `cogSOG.ts` |
| 129029 | GNSS Position Data | `gps.ts` |
| 129033 | System Time (Date & Time) | `systemTime.ts` |
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

| PGN | Description | Module |
|--------|-------------|--------|
| 130306 | Wind Data (apparent, true ground, true water) | `wind.ts`, `windTrueGround.ts`, `windTrueWater.ts` |
| 130310 | Sea/Air Temperature | `seaTemp.ts` |
| 130311 | Atmospheric Pressure | `pressure.ts` |
| 130312 | Temperature (exhaust) | `engineParameters.ts` |
| 130313 | Humidity (inside/outside) | `humidity.ts` |
| 130314 | Actual Pressure | `pressure.ts` |

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
| 126983 | Alert Response | `notifications.ts` |
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

### ISO (in PGN list announcement only)

| PGN | Description |
|--------|-------------|
| 59392 | ISO Acknowledgement |
| 59904 | ISO Request |
| 60928 | ISO Address Claim |

## Development

### Prerequisites

- Node.js 20+
- TypeScript 5.9+
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
│   ├── validation.ts     # Input validation (NaN/Infinity checks)
│   └── smoothing.ts      # Exponential smoothing for sensor data
├── conversions/          # PGN conversion modules (45 modules)
│   ├── index.ts          # Module loader
│   ├── wind.ts           # Wind data conversion
│   ├── depth.ts          # Depth conversion
│   ├── battery.ts        # Battery status conversion
│   └── ...               # Additional conversions
└── test/                 # Test suites
    └── index.test.ts     # Main test file
.github/
└── workflows/
    └── ci.yml            # GitHub Actions CI pipeline
```

### Adding New Conversions

1. Create `src/conversions/yourConversion.ts` using the factory pattern below
2. Import and register in `src/conversions/index.ts` (add to imports and `conversionFactories` array)
3. Add a configuration entry in `src/schema.ts` with `enabled`, `resend`, and `resendTime` properties
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

### Configuration changes don't take effect

Signal K reloads plugin configuration when you save it, but some changes (for example, schema additions or new conversion modules) require a full Signal K server restart before they appear.

### Plugin won't start

- Check the Signal K log for `Signal K NMEA2000 Emitter Cannon` errors.
- A common cause is the NMEA 2000 output channel not being initialized — the plugin waits for the `nmea2000OutAvailable` event before emitting messages, so confirm your NMEA 2000 gateway is connected and Signal K has registered an output provider.

### Time/GNSS PGNs broadcast stale values

This is a known issue with cached resends — the resend timer re-emits the last computed value rather than recomputing time-derived fields. See the issue tracker for current status.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper TypeScript types
4. Add tests for new functionality
5. Ensure all tests pass and code passes linting
6. Submit a pull request

## Compatibility

- **Signal K Server**: 2.20.0+
- **Node.js**: 20.0.0+
- **CanboatJS**: 3.13.0+
- **@signalk/server-api**: 2.10.2+

## License

Apache 2.0 License - see [LICENSE](LICENSE) file for details.

## Author

- **[Nearl Crews](https://github.com/NearlCrews)** - Author, maintainer, and TypeScript conversion

## Acknowledgments

This plugin builds upon the excellent foundation of the [**signalk-to-nmea2000**](https://github.com/SignalK/signalk-to-nmea2000) project:

- **Original Author**: Scott Bender and the Signal K community
- **Original Implementation**: [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000) - NMEA 2000 conversion framework and PGN implementations

**Additional Thanks**:
- [Signal K Project](https://signalk.org/) for the excellent marine data standard
- [Canboat Project](https://github.com/canboat/canboat) for NMEA 2000 protocol implementation
- The Signal K community for feedback, testing, and contributions
