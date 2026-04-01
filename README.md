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
- **Complete PGN Coverage**: Supports 100% of essential NMEA 2000 Parameter Group Numbers (74 conversion modules)
- **Signal K Native**: Seamless integration with Signal K server ecosystem using official `@signalk/server-api`
- **Garmin Compatibility**: Aligned with Garmin PGN specifications and canboatjs framework
- **Reactive Processing**: Built on RxJS 7.8 for efficient real-time data processing
- **High Performance**: Modern build system with esbuild for fast compilation (~209kb bundle)
- **Fully Tested**: Comprehensive test suite with Vitest and CanboatJS validation
- **Modern Dependencies**: es-toolkit, RxJS 7.8, pure ESM modules
- **Latest Tooling**: Biome for linting/formatting, zero errors and warnings
- **CI/CD Ready**: GitHub Actions workflow with multi-version Node.js testing
- **Developer Experience**: Pre-commit hooks with husky + lint-staged

## Installation

### Prerequisites

- Node.js 20 or higher
- Signal K server
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

**Option 2: Manual copy (for development)**
```bash
# After building from source
npm run build
cp -r dist ~/.signalk/node_modules/signalk-nmea2000-emitter-cannon
```

## Configuration

1. Navigate to Server → Plugin Config in Signal K admin interface
2. Find "SignalK to N2K Emitter" in the plugin list
3. Enable the plugin
4. Configure individual PGN conversions as needed:
   - Enable specific message types (Wind, Depth, Battery, etc.)
   - Set resend intervals for periodic transmission
   - Configure source filtering for multi-source environments

## Supported PGNs

### Navigation Data
- **PGN 127245**: Rudder position
- **PGN 127250**: Vessel heading
- **PGN 128259**: Speed (water/ground)
- **PGN 128267**: Water depth
- **PGN 129025**: Position (latitude/longitude)
- **PGN 129026**: COG & SOG rapid update
- **PGN 130306**: Wind data

### Engine & Propulsion
- **PGN 127488**: Engine parameters rapid update
- **PGN 127489**: Engine parameters dynamic
- **PGN 127505**: Fluid level (fuel tanks)

### Electrical Systems  
- **PGN 127506**: DC detailed status (battery state)
- **PGN 127508**: Battery status

### Environmental
- **PGN 130310**: Environmental parameters (outside temp/humidity)
- **PGN 130311**: Environmental parameters (pressure)
- **PGN 130312**: Temperature

### Complete Coverage (74 Conversion Modules)

**All essential marine electronics protocols supported including:**
- AIS (Class A, B, SAR, AtoN) - Multiple PGNs
- Navigation & routing - Comprehensive coverage
- Engine & propulsion - Full support
- Environmental monitoring - Complete suite
- Safety & communications - Full DSC and radio support
- Vendor-specific (Raymarine) - 4+ PGNs
- **Aligned with Garmin specifications** - Removed ISO messages, added SID fields, corrected priorities

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
├── conversions/          # PGN conversion modules (46 modules)
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

1. Create a new file in `src/conversions/`
2. Implement the `ConversionModule` interface
3. Include comprehensive test cases
4. Follow the CanboatJS message format requirements

Example conversion module:

```typescript
import type { ConversionModule, N2KMessage } from '../types/index.js'

export default function createMyConversion(): ConversionModule {
  return {
    title: "My Conversion (PGN)",
    optionKey: "MY_CONVERSION",
    keys: ["path.to.signalk.data"],
    callback: (value: unknown): N2KMessage[] => {
      if (typeof value !== 'number') return []
      
      return [{
        prio: 2,
        pgn: 12345,
        dst: 255,
        fields: {
          myField: value
        }
      }]
    },
    tests: [
      {
        input: [42],
        expected: [{
          prio: 2,
          pgn: 12345,
          dst: 255,
          fields: { myField: 42 }
        }]
      }
    ]
  }
}
```

## Technical Details

### Architecture

- **Modern TypeScript**: Leverages latest TypeScript features for type safety
- **RxJS Reactive Streams**: Replaced BaconJS with RxJS for better TypeScript support
- **ES Toolkit**: Modern utility library replacing Lodash for better performance
- **ESM Modules**: Pure ES modules for better tree-shaking and modern compatibility
- **esbuild**: Fast build system optimized for TypeScript

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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper TypeScript types
4. Add tests for new functionality
5. Ensure all tests pass and code passes linting
6. Submit a pull request

## Compatibility

- **Signal K Server**: 2.16.0+
- **Node.js**: 20.0.0+
- **CanboatJS**: 3.13.0+
- **@signalk/server-api**: 2.10.0+

## License

Apache 2.0 License - see [LICENSE](LICENSE) file for details.

## Author

- **[NearlCrews](https://github.com/NearlCrews)** - Maintainer and TypeScript conversion

## Acknowledgments

This plugin builds upon the excellent foundation of the [**signalk-to-nmea2000**](https://github.com/SignalK/signalk-to-nmea2000) project:

- **Original Author**: Scott Bender and the Signal K community
- **Original Implementation**: [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000) - NMEA 2000 conversion framework and PGN implementations
- **Foundation**: All conversion patterns and Signal K integration based on the original work

**Additional Thanks**:
- [Signal K Project](https://signalk.org/) for the excellent marine data standard
- [Canboat Project](https://github.com/canboat/canboat) for NMEA 2000 protocol implementation
- The Signal K community for feedback, testing, and contributions

This modernized version adds TypeScript conversion, enhanced Garmin compatibility, and updated dependencies while maintaining the excellent protocol implementation of the original.
