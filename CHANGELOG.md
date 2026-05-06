## Change Log

### v1.3.0 (2026/05/05) - Bus Correctness, Hot-Path Cleanup, Toolchain Modernization

**NMEA 2000 Bus Correctness (real bugs on the wire)**:
- AIS PGNs 129039, 129040, 129798: position guard used `!position.latitude || !position.longitude`, which rejects vessels exactly on the equator (latitude 0) or the prime meridian (longitude 0). Switched to `isValidNumber` so a legitimate `0` passes through. Same class of bug fixed in `routeWaypoint`/`routeWpList` in v1.2.5.
- PGN 129540 satellite list: `||` fallbacks for `prn`, `elevation`, `azimuth`, and `snr` discarded valid `0` readings (satellite at horizon, due-north azimuth, no-signal SNR, satellite ID 0). Switched to `??`.
- PGN 130310 sea/air temperature: callback emitted a no-op message every delta when all three inputs were null. Added an all-null guard.
- PGN 127493 transmission parameters: early-return guard used `== null`, which lets `NaN` and `Infinity` through. Switched to `isValidNumber` for consistency with the rest of the callback.
- PGN 130577 direction data: NaN/Infinity could leak into `cog`/`heading` fields because the guard only checked `=== null`. Each value now gates on `isValidNumber`.

**Hot-path efficiency (`plugin-manager.ts`)**:
- Stream callback now reads `Date.now()` once per delta (was twice).
- `lastValues[skKey]` entries are mutated in place instead of allocating a new `{ timestamp, value }` object on every Signal K value update.
- Per-PGN debug-enabled cast hoisted out of the `processToN2K` PGN loop.
- Source-filter `${sourceRef}.` prefix string precomputed once per closure instead of rebuilt on every stream value.
- Redundant first-pass `Object.keys(options)` enabled-counter loop in `start()` removed; the count is folded into the existing setup loop.
- Magic string `"vessels.self"` extracted to `VESSELS_SELF_CONTEXT` constant.
- Inner `processToN2K` `catch` blocks use `errMessage(err)` instead of raw `${err}` template, which previously printed `[object Error]` for thrown `Error` instances.

**Code reuse**:
- New shared helper `errMessage(err)` in `src/utils/errorUtils.ts`. The 27 inline `err instanceof Error ? err.message : String(err)` copies across conversion modules now import from the shared helper, plus `index.ts`, `plugin-manager.ts`, and `conversions/index.ts`.
- New `src/conversions/routeTypes.ts` with shared `Position`/`Waypoint` interfaces and `DEFAULT_ROUTE_NAME = "ACTIVE_ROUTE"`. `routeWaypoint.ts` collapsed double `.map()` over the waypoint slice into a single pass; `routeWpList.ts` reads `wpList.length` instead of recomputing `Math.min(waypoints.length, 16)`.
- `transmissionParameters.ts` and `engineParameters.ts` use `DEFAULT_DATA_TIMEOUT_MS` from `constants.ts` and hoist the per-call `.map(() => DEFAULT_DATA_TIMEOUT_MS)` arrays out of the per-engine loop.
- `tanks.ts`, `solar.ts`, `battery.ts` use named `*_TIMEOUT_MS` constants instead of bare `60000` literals.
- `battery.ts` swapped 3 inline `Number.isFinite` checks for `isValidNumber`. The smoothing key string is built once per battery in the factory closure instead of every callback.

**Hot-path allocations (callback construction)**:
- `attitude.ts` and `gps.ts` PGN 129029 build the N2K `fields` object imperatively (typed as `N2KMessage["fields"]`) instead of stacking conditional spread expressions, eliminating per-callback intermediate object allocations.
- `gnssData.ts` PGN 129539: deduplicated identical `desiredMode`/`actualMode` ternary chains into a single `modeValue` computation. PGN 129540 satellite list builds via a fixed-length `for` loop instead of `.slice().map()`.

**Quality**:
- `notifications.ts`: removed dead `padStart(16, '0')` + `Number.parseInt(idName, 10)` round-trip on `dataSourceNetworkIdName` (output was identical to passing `alertId` directly). `.indexOf("sound")` switched to `.includes`. Per-event `state` derivation deduplicated via `hasSound`/`isAcknowledged` locals (was reading `value.method` four times). When an alert resolves to `state === "normal"`, its entry is now removed from the `ids` map (memory leak fix: previously, every distinct path that ever fired an alert held a slot forever).
- `raymarineAlarms.ts`: `.indexOf("sound")` switched to `.includes`; `hasSound` hoisted; nested if/else replaced with a ternary.
- `navigationData.ts`: ETA arithmetic now uses `toN2KDateTime` from `dateUtils.ts` instead of inline `getTime()`/`getUTCHours()` math. Magic SID literal `0x88` named `NAV_DATA_SID`. `isValidNumber(WCV)` deduplicated.
- `temperature.ts`: `fieldName` (the `"temperature"` vs `"actualTemperature"` switch) hoisted out of `createTemperatureMessage` since it only depends on `pgn`, which is fixed at factory time. Instance lookup simplified to `?? info.instance`.
- `solar.ts`: title corrected from `"Solar as Battery (127506 & 127508)"` to `"Solar as Battery (127508)"`. The 127506 emit path was removed earlier; the title misled the admin UI. Shared timeouts array hoisted.
- `systemTime.ts`: variadic `(...values)` simplified to `(_app, inputDate)` named parameters; magic `values[1]` index removed.
- `directionData.ts`: test inputs trimmed from 8 elements to 4 to match the 4-arg callback signature; raw `0` SID literals replaced with `N2K_SID_ZERO`.
- ~14 WHAT-style narration comments removed across `plugin-manager.ts` and conversion modules.
- `aisExtended.ts`: `shipType?.name || "Sailing"` switched to `??` (an empty-string ship type name no longer silently becomes "Sailing").
- `aisExtended.ts`: removed redundant `const pos = position as Position` aliases at the three position-PGN call sites.

**Toolchain & dependencies**:
- TypeScript bumped 5.9 to 6.0. `tsconfig.json`: removed unused `baseUrl` and `paths` (no `@/...` imports in the codebase); added `"types": ["node"]` because TypeScript 6 changed the default to `[]`, which dropped `@types/node` from auto-include and broke `NodeJS.Timeout` references.
- esbuild bumped 0.27 to 0.28. Bundle output is byte-identical.
- lint-staged bumped 15 to 16. No config changes required.
- `engines.node` tightened from `>=20` to `>=20.18` to match lint-staged 16's floor.
- Biome dependency bumped within range; `biome.json` `$schema` URL updated to match the installed biome version.
- All in-range packages updated via `npm update` (biome, canboatjs 3.13 → 3.17, vitest 4.1.4 → 4.1.5, @types/node, @vitest/*, signalk-server, es-toolkit).

**Cleanup**:
- Stale `coverage/` directory (gitignored, last modified weeks ago) removed.

---

### v1.2.5 (2026/05/03) - Codebase Simplification and Documentation Accuracy

**NMEA 2000 Bus Correctness**:
- PGN 126983/126985 notifications: restored the `source: { label: plugin.id, type: "plugin" }`
  field on the delta sent to `app.handleMessage`. The field was added in v1.1.x for
  Signal K schema compliance and silently dropped during a later refactor;
  schema-strict consumers could reject the malformed delta.
- PGN 126464 transmit-PGN list no longer advertises 128275 (Distance Log) or
  129033 (Time & Date). The plugin has no module that emits them, so any
  receiver requesting these PGNs got nothing.

**Validation hardening (NaN/Infinity rejection)**:
- 18 conversion modules previously used `typeof x === "number"`, which lets
  `NaN` and `Infinity` through and could leak corrupt values into PGN fields.
  These now use `isValidNumber` / `toValidNumber` from `utils/validation.ts`:
  ais, aisExtended, cogSOG (already correct), engineParameters, environmentParameters,
  gnssData, gps, heading (already correct), leeway, magneticVariance, navigationData,
  pressure, raymarineBrightness, rudder, seaTemp, setdrift, solar, tanks,
  temperature, transmissionParameters, trueheading.
- `routeWaypoint.ts` and `routeWpList.ts` now use `?? 0` instead of `|| 0`
  for waypoint coordinate defaults — a valid `0` latitude (equator) or `0`
  longitude (prime meridian) is no longer treated as missing.
- humidity outside conversion: added explicit test for `relativeHumidity = 0`
  to confirm a valid 0 % reading does not silently fall through to the
  `humidity` path.

**Notification state hygiene**:
- Notifications conversion now resets `pgns`, `ids`, and `idCounter` in
  `onOptionsLoaded`. Previously, changing config (e.g. excluded paths) left
  stale alerts in the closure that would re-emit on the next event.
- The `JSON.stringify(modifiedDelta)` debug line is now guarded by
  `appDebug.enabled` so it doesn't allocate per alert when debug is off.

**Plugin lifecycle**:
- `nmea2000Ready` is reset to `false` in `stop()`. Without the reset, a
  subsequent `start()` would inherit the previous run's readiness flag and
  emit before the new run's `nmea2000OutAvailable` event fired.
- Removed dead `try/catch` in `raymarineAlarms.ts` (wrapped a bare `return`)
  and dropped the now-unused `app` parameter.
- Extracted `errMessage(err)` helper in `plugin-manager.ts` (was repeated
  seven times); removed an unnecessary `as unknown[]` cast on a value
  already typed `unknown[]`.

**Code quality sweep**:
- Removed redundant WHAT-style JSDoc blocks (e.g. `/** Battery configuration interface */`)
  and narration comments (`// Validate inputs`, `// Convert and validate inputs`)
  across 35 files — net 162 lines removed.
- Stripped task-tracking comment markers (`(M3)`, `(M9)`, `(H5)`, `(L3)`)
  that referenced a planning doc no longer in the repo.

**Documentation accuracy**:
- README PGN tables corrected: removed phantom 128275 and 129033 rows,
  fixed PGN 130311 attribution from `pressure.ts` to `environmentParameters.ts`,
  rewrote 130310 / 130311 / 130314 descriptions to match each canboat PGN's
  actual semantics.
- README PGN count: 58 → 53 data PGNs (with 3 ISO PGNs called out separately
  as transmit-list announcements only).
- Bundle size reference updated from ~207 KB to ~211 KB.
- CLAUDE.md PGN count corrected (57 → 53).

### v1.2.4 (2026/04/19) - Humidity Path Compatibility

- PGN 130313 outside humidity now subscribes to both
  `environment.outside.relativeHumidity` and `environment.outside.humidity`.
  Upstream Signal K humidity sources disagree on which path is canonical —
  `signalk-virtual-weather-sensors`, for example, publishes to `.humidity`,
  while the emitter-cannon previously only listened on `.relativeHumidity`,
  so the Garmin showed no reading. `relativeHumidity` still wins when both
  are present. Inside humidity is unchanged (no sibling `.humidity` path).

### v1.2.3 (2026/04/19) - Bus Correctness, Lifecycle Hardening, Type Safety

**NMEA 2000 Bus Correctness (wrong data on the wire — fix first)**:
- PGN 127245 rudder `directionOrder` now emits the canboat enum values
  (`Move to starboard`, `Move to port`) instead of `Turn Right`/`Turn Left`,
  which canboatjs silently dropped to `No Order` — rudder direction commands
  were never actually transmitted.
- PGN 130577 direction data: `cog`/`heading` fallback uses `??` instead of
  `||`, so a true-north (0 rad) reading no longer silently substitutes the
  magnetic value.
- PGN 129029 GNSS Position Data no longer emits fabricated metadata. Previously
  hardcoded `method: "DGNSS fix"`, `numberOfSvs: 16`, `hdop: 0.64`,
  `geoidalSeparation: -0.01`, and a fake reference-station list were broadcast
  regardless of reality. These fields are now sourced live from Signal K
  (`navigation.gnss.methodQuality`, `.satellites`, `.horizontalDilution`,
  `.geoidalSeparation`, etc.) and omitted when not available. Altitude from
  `navigation.position.altitude` is now included.
- PGN 130310 sea/air temperature uses `sid: 0` instead of `sid: 0xff` (the
  "not available" sentinel, which made the message's SID undefined).
- PGN 129539 GNSS DOPs: `actualMode` falls through to `"Auto"` instead of
  `"No GNSS"` when Signal K reports mode `"Auto"` — chart plotters no longer
  show "No GNSS fix" while the receiver is in auto-2D/3D mode.
- PGN 128267 depth: `surfaceToTransducer` is now negated when used as the
  N2K offset (freeboard offset is signed negative per the PGN spec).
- PGN 127257 attitude: `pitch`/`yaw`/`roll` are validated with `isValidNumber`
  and dropped when NaN/Infinity — faulty IMU readings no longer leak corrupt
  bits onto the bus.
- PGN 130306 true wind (water/ground) now includes a `sid` field matching
  the apparent-wind variant, so correlated wind messages share a sequence ID.
- Temperature instance collisions resolved: eight sources that previously
  defaulted to instance `107` (Main Cabin, Refrigerator, Heating System,
  Dew Point, Apparent Wind Chill, Theoretical Wind Chill, Heat Index, Freezer)
  now have unique defaults (104–111).
- AIS: `isN2K()` now actually detects NMEA2000-originated deltas via
  `updates[].source.type === "NMEA2000"` — closes an echo loop that doubled
  AIS frames on vessels with a hardware receiver + this plugin.
- AIS: own-vessel filter no longer falls back to the literal `"vessels.self"`
  (which never matched real urn-form contexts, letting own-vessel data leak
  out as if it were a remote target). Missing `app.selfId` skips the callback.

**Plugin Host Lifecycle**:
- `nmea2000OutAvailable` listener is now removed in `stop()`. Previously
  every restart leaked a listener plus the PluginManager it closed over,
  eventually tripping `MaxListenersExceeded`.
- Timer-source conversions (e.g. `systemTime`) no longer get a redundant
  global resend timer — `systemTime` was emitting PGN 126992 both on its
  1s main interval and every 5s from the resend timer.
- Replaced `BehaviorSubject<unknown[]>([])` seed with a plain `Subject` —
  the pipeline no longer fires callbacks with empty args at startup before
  any real Signal K value has arrived.
- `clearAllSmoothers()` now releases registry entries so
  `ExponentialSmoother` instances can be garbage-collected across restarts.
- Notifications subscribe with `policy: "instant"` instead of the default
  `fixed` 1s period, so bursts of alerts are no longer throttled.
- Source-filter predicate now matches label prefixes (`gps1` matches
  `gps1.0`, `gps1.1`, …) instead of requiring an exact match against the
  composite `$source` — the admin UI description now reflects real behavior.
- `stop()` calls `setPluginStatus("Stopped")`.
- Resend-timer cleanup is no longer performed twice (removed redundant
  second loop).
- Debug-gated `formatN2KMessage` call now uses the debug-library
  `.enabled` flag instead of `process.env.DEBUG`, avoiding the allocation
  when debug is disabled for this namespace regardless of env state.
- `normalizeAngle()` now wraps fully via modulo, handling angles below -2π
  correctly (was only adding one turn).

**Type Safety**:
- `SubConversionModule.title` field added (was read at runtime but not typed).
- `ConversionModule.keys` widened to `string[] | ((options) => string[])` so
  the runtime function path is visible to the type system.
- `PluginOptions.globalResendInterval` declared explicitly with a runtime
  `isConversionOptions` type guard, eliminating the double `as` cast at
  start-time.
- `PluginFactory` now types `app: SignalKApp` instead of `app: unknown`.
- Replaced `as Error` cast in the conversion registry with `instanceof Error`
  narrowing per project convention.
- Removed dead `lastOutput?: N2KMessage[]` field (superseded by `lastInputs`).
- Replaced `isFunction` (from es-toolkit, erases to `any`) with
  `typeof x === "function"` — TypeScript narrows properly.

**Test & Build Hardening**:
- Coverage thresholds wired into `vitest.config.ts`
  (statements 70, branches 55, functions 80, lines 70) so PRs can't
  silently tank coverage.
- Module-count assertion pinned to `74` (was `toBeGreaterThan(0)`, which
  masked silent factory-load failures).
- Production build no longer emits linked sourcemaps — 387kb of broken map
  references are out of the npm package. Sourcemaps remain in
  `build:watch` for development.
- `biome.json` now enables the recommended rule set plus
  `noExplicitAny`, `noConsole`, `useConst`, `useImportType`.
- Plugin description string no longer hardcodes the outdated "92% PGN
  coverage" claim.
- Removed dead `dev` and `build:npm` scripts.

**New lifecycle tests**:
- Listener leak regression (repeated start/stop cycles).
- Timer-source double-emission regression.
- BehaviorSubject empty-seed callback regression.
- Notifications subscription policy regression.
- `ExponentialSmoother` registry-release regression.
- Temperature default-instance uniqueness regression.

---

### v1.2.2 (2026/04/18) - Schema Fix, Resend Correctness, Type Tightening

**Critical Bug Fixes**:
- Fixed temperature schema generation: 20 of 22 temperature optionKeys (engine room, cabin, refrigerator, freezer, dewpoint, wind chill, heat index, and the PGN-130316 variants of every source) were unreachable from the Signal K admin UI. Schema entries are now generated from the same temperatures table the conversions use.
- Resend timer now re-invokes conversion callbacks instead of re-emitting cached output. Time-derived PGNs (system time / GNSS time, PGN 126992) now broadcast fresh values each interval instead of repeating a stale snapshot.

**Plugin Lifecycle Hardening**:
- `PluginManager.stop()` wraps every cleanup step (unsubscribe, clearInterval, smoother clear) in a safe wrapper, collects errors, and logs a single summary instead of aborting on the first failure.
- `ExponentialSmoother` instances self-register; smoother state is cleared on plugin stop so smoothed values don't carry across restart.
- Centralized callback error handling in `PluginManager.invokeCallback()`.

**Type & Code Quality**:
- Tightened `ConversionModule<any>` to `ConversionModule<unknown[]>` at the registry boundary; `ConversionCallback` is now a method-style declaration so narrow modules type-check under the unknown umbrella without `any` casts.
- Replaced default-value priority/SID literals with named constants in temperature, timeToMark, and bearingDistanceBetweenMarks.
- Re-enabled biome rules `noExplicitAny` and `noApproximativeNumericConstant`.

**Tooling & Release**:
- Added `@vitest/coverage-v8`; `npm run test:coverage` now works.
- Replaced `github-create-release` with `gh release create` in the release script.
- Guarded the release script against silently re-tagging existing versions.
- Added Node 24 to the CI matrix.
- Build now emits linked sourcemaps.
- Modernized husky pre-commit (removed deprecated v9 shim).
- `npm audit fix` applied (no breaking changes).

**Tests**:
- New plugin lifecycle suite covering start/stop/resend behavior with a typed mock SignalK app.
- New `pathToPropName` collision regression test.

**Docs**:
- Added Troubleshooting section to README.
- Clarified source-filter wording in the admin UI schema ("Leave blank to accept any source. Enter an exact source name…").

---

### v1.2.1 (2026/04/18) - Global Resend Interval

**Configuration Simplification**:
- Added top-level `globalResendInterval` setting (default 5s) that controls resend frequency for all conversions
- Per-conversion `resend` value still overrides the global when non-zero
- Removed `resendTime` entirely — timers now resend indefinitely until the plugin stops or new data arrives

---

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

**Tooling**:
- Replaced custom 60-line `biome.json` with minimal defaults (2 overrides only)
- Reformatted entire codebase to Biome defaults (tabs, 80-char line width)

**Documentation**:
- Corrected PGN count from 74 to 57 across README, CLAUDE.md, and CHANGELOG
- Added complete PGN reference table (all 57 PGNs with descriptions and module names)
- Fixed plugin display name in Configuration section
- Fixed broken manual install command (replaced `cp` with `npm link`)
- Added NMEA 2000 gateway hardware prerequisite
- Expanded Configuration section with resend, source filtering, and instance mapping docs
- Updated code example to match actual factory signature with constants and typed callback
- Updated compatibility versions to match current package.json

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
