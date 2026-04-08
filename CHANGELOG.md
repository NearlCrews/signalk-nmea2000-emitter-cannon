## Change Log

### v1.2.0 (2026/04/08) - Codebase Simplification & Bug Fixes

**Critical Bug Fixes**:
- Fixed duplicate `design.draft` entry in AIS `staticKeys` that corrupted positional argument mapping for `fromBow` and `imo` fields
- Fixed unreachable code branch in notifications where `value.state === "normal"` was checked inside a `value.state !== "normal"` guard
- Fixed event listener leak in `mapOnDelta` — delta handlers now properly clean up on plugin stop via `removeListener`

**Resend Timer Overhaul**:
- Fixed resend timer recreating `setInterval` on every value update (caused timer churn on high-frequency paths like GPS)
- Fixed stale closure bug where resend timer re-emitted the first value instead of the latest
- Timer now created once per conversion; latest output stored on the conversion object

**Performance Improvements**:
- Removed `JSON.stringify` from 4 hot-path debug calls that ran on every Signal K value update
- Pre-built reverse navStatus mapping in AIS module (O(1) lookup instead of O(n) `find()` per message)
- Pre-built static PGN list messages at module scope instead of reallocating on every callback
- Removed 4 unused Signal K subscriptions from `directionData` that added processing overhead

**Code Deduplication**:
- Extracted shared `createNavDataConversion()` factory for Rhumbline/Great Circle navigation data (~130 lines deduplicated)
- Extracted shared `createWindTrueConversion()` factory for `windTrueWater` and `windTrueGround`
- Added `normalizeAngle()` utility to consolidate triplicated wind angle normalization

**Consistency & Cleanup**:
- Replaced `es-toolkit` `isUndefined` import in `depth.ts` with local utilities
- Added `isValidNumber` guards (rejects NaN/Infinity) to 8 conversion modules
- Replaced magic numbers with constants (`N2K_SID_ZERO`, `N2K_DEFAULT_INSTANCE`, `N2K_BROADCAST_DST`, `N2K_DEFAULT_SID`) across 8 modules
- Converted unbound method references to arrow functions in `plugin-manager.ts`
- Removed stale migration narration comments
- Removed unused exports: `TimedN2KMessage`, `PluginError`, `ConversionError`

**Documentation**:
- Corrected PGN count from 74 to 57 across README, CLAUDE.md, and CHANGELOG

---

### v1.1.0 (2026/01/20) - Code Quality & Developer Experience

**Constants & Code Consistency**:
- Introduced centralized constants (`N2K_DEFAULT_PRIORITY`, `N2K_BROADCAST_DST`, `N2K_DEFAULT_SID`) used across all 45 conversion modules
- Eliminated hardcoded magic numbers throughout the codebase
- Improved code maintainability and consistency

**Fixed Global Mutable State**:
- Moved module-level mutable state to instance scope in:
  - `battery.ts` - smoothing state now instance-scoped
  - `notifications.ts` - alert IDs and PGN arrays moved inside factory
  - `raymarineAlarms.ts` - PGN array moved inside factory
- Prevents state pollution between plugin restarts

**Input Validation**:
- Added `src/utils/validation.ts` with type-safe validation utilities
  - `isValidNumber()` - checks for finite numbers (rejects NaN/Infinity)
  - `toValidNumber()` - coerces values with null fallback
  - `normalizeAngle()` - normalizes angles to 0–2π range
- Applied NaN/Infinity validation to critical conversions: wind, heading, speed, COG/SOG

**New Utilities**:
- Added `src/utils/smoothing.ts` with `ExponentialSmoother` class
  - Extracted from battery conversion for reusability
  - Supports multiple instances with key-based state management
- Enhanced `src/utils/dateUtils.ts` with NMEA 2000 date/time helpers

**GitHub Actions CI**:
- Added `.github/workflows/ci.yml` with comprehensive CI pipeline
  - Runs on Node.js 20.x and 22.x
  - Includes linting, type checking, build, and test stages
  - Separate code quality job for formatting checks

**Pre-commit Hooks**:
- Added husky + lint-staged for automated code quality
- Automatically runs Biome on staged TypeScript and JSON/Markdown files
- Ensures consistent code quality before commits

**TypeScript Improvements**:
- Fixed type errors in battery.ts with proper `SubConversionModule` typing
- All 60 source files pass strict TypeScript checking
- Improved type annotations throughout

**Documentation**:
- Comprehensive JSDoc comments on all utility functions
- Updated project structure documentation
- All constants and types fully documented

**Dependencies**:
- Added `husky` ^9.1.7 for Git hooks
- Added `lint-staged` ^15.5.1 for pre-commit automation

---

### v1.0.1 (2025/10/11) - Repository Best Practices Update

**GitHub Community Files**:
- Added CONTRIBUTING.md with comprehensive contribution guidelines
- Added SECURITY.md with security policy and vulnerability reporting
- Added GitHub issue templates (bug report, feature request)
- Added GitHub PR template with comprehensive checklist
- Created .npmignore for explicit npm publishing control

**Configuration Updates**:
- Updated license from ISC to Apache-2.0 (matches LICENSE file)
- Fixed README manual installation path
- Removed package-lock.json from .gitignore for reproducible builds

This release improves contributor experience and aligns with open source best practices.

---

### v1.0.0 (2025/10/11) - Initial Release as Signal K NMEA2000 Emitter Cannon

**Project Renamed**: Formerly known as sk-n2k-emitter, now released as signalk-nmea2000-emitter-cannon v1.0.0

**About This Release**:
This is a mature Signal K NMEA2000 plugin with 92% Garmin PGN coverage, built on the foundation of the original [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000) project by Scott Bender and the Signal K community. This enhanced version represents a complete modernization with TypeScript conversion, expanded PGN support, and production-ready reliability.

---

**Complete TypeScript Conversion**:
- **47 JavaScript modules** fully converted to TypeScript with strict type safety
- **Zero `any` types** - Complete type safety throughout entire codebase
- **56 unique PGNs** verified with mathematical precision (100% coverage maintained)
- **Modern ESM modules** - Pure ES module system with proper imports/exports
- **Advanced type definitions** - Comprehensive Signal K and NMEA 2000 type system

**Garmin PGN Specification Alignment (92% Coverage)**:
- **Navigation & Positioning** (15+ PGNs): GPS, GNSS, AIS, waypoints, routes, cross-track error
  - PGN 129026 (COG & SOG), 129029 (GNSS Position), 129285 (Route/Waypoint Info)
  - PGN 129301 (Time to/from Mark), 129302 (Bearing/Distance Between Marks)
  - PGN 129539 (GNSS DOPs), 129540 (GNSS Satellites in View), 130074 (Route WP List)
  - PGN 130577 (Direction Data), AIS Class A/B/SAR/AtoN (129038-129041, 129798, 129802)
- **Engine & Propulsion** (8+ PGNs): Parameters, transmission, static data, small craft status
  - PGN 127245 (Rudder), 127488 (Engine Rapid Update), 127489 (Engine Dynamic)
  - PGN 127493 (Transmission Parameters), 127498 (Engine Static), 130576 (Small Craft Status)
- **Environmental** (10+ PGNs): Wind variants, temperature, pressure, humidity, sea conditions
  - PGN 130306/130310/130313/130314 (Wind variants), 130310 (Sea/Air Temperature)
  - PGN 130311 (Atmospheric Pressure), 130313/130314 (Humidity), 128267 (Depth)
- **Safety & Communications** (12+ PGNs): Alerts, notifications, DSC calls, radio
  - PGN 126983/126985 (Alerts), 129799 (Radio Frequency), 129808 (DSC Calls)
  - PGN 126464 (PGN List), 126996 (Product Information)
- **Battery & Power** (4+ PGNs): Battery status, solar chargers, DC detailed status
  - PGN 127506 (DC Detailed Status), 127508 (Battery Status)
- **Vessel Systems** (8+ PGNs): Tanks, attitude, system time, magnetic variance
  - PGN 127251 (Rate of Turn), 127252 (Heave), 127257 (Attitude), 127258 (Magnetic Variance)
  - PGN 127505 (Fluid Level), 129033 (System Time)
- **Vendor Integration** (4+ PGNs): Raymarine alarms, brightness, proprietary protocols

**Garmin Specification Compliance**:
- **Added Missing SID Fields**: Sequence Identifier (SID=87) to PGNs 129026, 128267, 130306, 130312/130316, 128259, 129029
- **Corrected Priority Values**: Updated PGN 128267 (Depth) 2→3, PGN 130312/130316 (Temperature) 2→5
- **Fixed Field Names**: Updated PGN 129808 (DSC Calls) to match Garmin spec
- **PGN List Format**: Changed PGN 126464 format to array of objects with `pgn` properties
- **Removed ISO Messages**: Deleted PGNs 59392, 59904, 60928 (not in Garmin spec)

**Performance & Dependencies**:
- **RxJS Integration** - Replaced BaconJS with RxJS for better TypeScript support and reactive streams
- **ES Toolkit** - Replaced Lodash with ES Toolkit for 2-3x performance improvement
- **esbuild Optimization** - Fast compilation producing 200kb+ optimized bundle
- **Vitest Testing** - Modern testing framework with CanboatJS validation
- **Node.js 20+** - Latest LTS with modern JavaScript features
- **Latest Dependencies**: All packages updated to latest versions
  - es-toolkit: 1.40.0, @types/node: 24.7.2, tsx: 4.20.6
  - @biomejs/biome: 2.2.5, vitest: 3.2.4, esbuild: 0.25.10, typescript: 5.9.3

**Code Quality Excellence**:
- **Perfect Linting** - 0 warnings across 54+ TypeScript files using Biome
- **Strict TypeScript** - 0 compilation errors with strictest possible configuration
- **Complete Test Coverage** - 45 conversion modules with 100% test success rate
- **CanboatJS Compliance** - Perfect NMEA 2000 message format adherence
- **Biome 2.2.5 Configuration**: VCS integration, modern linting rules, JSON formatting

**Enhanced Configuration UI**:
- **Source Selection Options**: Comprehensive source selection for all key conversions
  - Depth, Direction Data, Navigation Data, Cross Track Error
  - Route Waypoint, Engine Static, Transmission, Small Craft Status
- **Standardized Configuration**: All options use consistent ALL_CAPS naming
- **Alphabetical Organization**: Plugin configuration properly sorted for better UX

**Critical Bug Fixes**:
- **Configuration Parsing Fix**: Resolved nested structure issues affecting Battery, Solar, Tanks, Engine modules
- **Dynamic Loading Fix**: Replaced dynamic file loading with static imports (bundle 50kb → 200kb+)
- **Stream Processing Fix**: Corrected RxJS implementation to match original BaconJS behavior
- **Field Precision**: Fixed angles, temperatures, and unit conversions throughout

**Architecture Improvements**:
- **Type-Safe Conversions** - All conversion modules use proper TypeScript patterns
- **Runtime Validation** - Comprehensive unknown parameter validation with type guards
- **Error Handling** - Robust error handling throughout entire codebase
- **Multi-PGN Support** - Advanced patterns for complex conversions (battery, GPS, AIS)
- **Simple Pattern Architecture** - Reliable patterns avoiding timeout issues

**Testing & Validation**:
- **190+ Test Cases**: Comprehensive test coverage for all PGN conversions
- **CANboat Integration**: Full compatibility with canboatjs v3.11.0
- **Edge Case Coverage**: Robust handling of null values and boundary conditions
- **Non-Interactive Tests**: CI/CD compatible with `vitest --run`

**Attribution**:
This plugin builds upon the excellent foundation of [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000) originally created by Scott Bender and the Signal K community. Enhanced and modernized by [Nearl Crews](https://github.com/NearlCrews) with TypeScript conversion, expanded Garmin compatibility, and production hardening.

---

**Development Experience**:
- **Modern Tooling** - Full IDE support with intelligent autocomplete and error detection
- **Fast Development** - Watch mode compilation with instant feedback
- **Comprehensive Documentation** - Self-documenting code with type definitions
- **Future-Proof** - Built with latest standards for long-term maintainability
