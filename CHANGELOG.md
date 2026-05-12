## Change Log

### v1.5.0 (2026/05/12) - React Config Panel

The hand-rolled JSON-Schema admin UI is replaced with a federated React panel built on webpack 5 Module Federation. The plugin keeps its esbuild runtime bundle untouched; the panel is a second build target that produces `public/remoteEntry.js` plus chunked `public/*.mjs`. The config payload moves from a flat shape to a nested `conversions: { KEY: { enabled, resend, sources, extras } }` shape with a load-time migration from v1.4.x, so existing installs upgrade transparently. The migration is backwards-compatible at load: downgrading back to v1.4.4 keeps the original `plugin-config.json` intact if no save has occurred under v1.5.0. No wire-level (PGN) changes.

**Added**

- React-based admin config panel loaded via webpack 5 Module Federation. Replaces the previous JSON-Schema-driven rjsf form. Categorized tabs (Navigation, Engine, Electrical, Tanks, Environment, AIS, Comms, System).
- Live status dashboard: NMEA 2000 readiness, enabled / total counts, per-conversion emit counts and error indicators (3s poll, paused when admin tab is hidden).
- Live source dropdowns populated from the running server's full data model (`vessels.self.<path>.$source` + `.values`).
- Mapping editors for battery, engine, tank, solar, brightness, and exhaust families. Replace the previous rjsf array-of-object widgets.
- Preset chips: Basic Navigation, Engine Set, Full AIS, Environmental, Raymarine. Additive; click a chip to enable the tagged conversions in one action.
- Plugin HTTP API under `/plugins/signalk-nmea2000-emitter-cannon/api/` (status, conversions, paths, sources). Admin-auth gated via `app.securityStrategy.addAdminMiddleware`. Logs a warning if the server does not expose the gating hook.

**Changed**

- Config schema migrated to `@sinclair/typebox`. Single source of truth for both the runtime JSON Schema (returned from `Plugin.schema`) and the TypeScript `Config` type (derived via `Static<>`). The legacy flat config payload is migrated to the new nested shape at load time; downgrades to v1.4.x keep the original payload intact if no save has occurred under v1.5.0.
- Each conversion module now carries `category` (required) and optional `presets` metadata. Adding a new conversion requires both fields.
- Minimum admin UI bumped to `@signalk/server-admin-ui >= 2.27.0` for ESM federation runtime support.

**Internal**

- Added per-conversion emit counters and last-error tracking inside `PluginManager`. Both are surfaced via the new `/api/status` endpoint.
- Added the `signalk-plugin-configurator` npm keyword so the Signal K admin UI loads the federated panel instead of the rjsf form.
- Webpack 5 + babel-loader + `@babel/preset-typescript` build target for the panel under `public/*.mjs`. esbuild keeps building the plugin bundle to `dist/index.js`.
- Discovery helpers use `app.getSelfPath` (correct self-to-MRN resolution path), not `app.getPath("vessels.self.<path>")` (which does not resolve `self`).
- Status snapshot walks `errorBuckets` across all source types and bucket-key forms (parent + sub-conversion `[N]` brackets), not just the `stream` suffix.
- Sub-conversion emit counters aggregate under the parent `optionKey` rather than recording per-index keys.

**Verification**: `npm run typecheck` clean, `npm test` 50/50 pass, `npm run check` (Biome) clean, `npm run build` clean (esbuild plugin bundle + webpack panel bundle). No em dashes in source or docs.

### v1.4.4 (2026/05/12) - Plugin Restart Lifecycle Fix and Supply Chain Hygiene

**Bug fix: plugin permanently stuck after restart (Issue #5)**

The `nmea2000OutAvailable` event is one-shot at signalk-server startup; if you disabled and re-enabled the plugin after the server had already announced N2K output was available, the plugin's listener was registered too late to ever receive the event. `nmea2000Ready` stayed `false`, every emit was dropped with `NMEA2000 output not yet available, dropping message`, and the status read "Waiting for NMEA 2000 output (...)" indefinitely.

Two underlying causes addressed in `src/plugin-manager.ts`:

1. **Listener lifecycle moved from constructor to `start()`**: the constructor now only captures the `onNmea2000Ready` callback reference; `start()` does `removeListener` then `addListener` so the registration is idempotent across many disable/enable cycles. `stop()` keeps the existing `removeListener` call, so a stopped instance leaves no listener behind. Previously the constructor was the sole register-site and `start()` never re-registered after `stop()` had cleaned up.
2. **Sync state check on `start()`**: `signalk-server >= 2.x` mirrors the one-shot event to a property (`app.isNmea2000OutAvailable`). `start()` now reads it and flips `this.nmea2000Ready` directly when the value is already `true`. The event listener remains as a backup for the cold-boot path where the server has not yet announced.

`src/types/signalk.ts` adds `isNmea2000OutAvailable?: boolean` to the `SignalKApp` interface (optional so older server builds compile).

`src/test/lifecycle.test.ts` updated to reflect the new design: tests now set the sync mirror in `beforeEach` and assert that `start()` (not the constructor) owns the listener registration. New coverage: repeated `start(opts) → start(opts)` calls keep the listener count at 1, not accumulating.

**Supply chain**

- Dependabot alert #1 (`ip-address < 10.1.1` XSS in HTML-emitting methods) resolved via `package.json` `overrides`: `"ip-address": "^10.1.1"`. The vulnerable code never shipped (signalk-server is a devDependency used to load the plugin in tests; the bundle does not include it), but the override silences the alert and the resolution is now reproducible. Side effect: signalk-server bumped 2.26.0 → 2.27.0 as npm resolved a fresh tree.
- PR #6 merged: `actions/checkout@v4 → v6`, `actions/setup-node@v4 → v6`, `github/codeql-action@v3 → v4`. Clears the Node 20 deprecation warning GitHub Actions emits.
- PR #7 merged: dev-dependencies bump (5 packages, lockfile only).
- CodeQL warnings #1 and #2 (missing per-job `permissions:` block on `ci.yml`) fixed by adding `permissions: contents: read` to both jobs. The workflow-level declaration was already there; CodeQL wants per-job too.

**Verification**: `npm run typecheck` clean, `npm test` 21/21 pass, `npm run check` (Biome) clean, `npm run build` 340.3 KB. No em dashes in new content.

### v1.4.3 (2026/05/12) - Notification PGN Correctness and Repo Hygiene

A read-only Signal K agent scan surfaced gaps in the notification PGN family (126983/126985) and a handful of secondary issues across the conversion modules. This release fixes the actionable findings; PGN 126984 (inbound Alert Response) is intentionally deferred because the typed Signal K server API does not expose an inbound NMEA 2000 hook, so closing the alert-acknowledgement round-trip needs a separate design pass.

**Notification PGNs 126983 / 126985 (`src/conversions/notifications.ts`)**:
- `alertCategory` is now derived from the Signal K path instead of hardcoded to "Technical". Path prefixes `notifications.mob`, `notifications.navigation`, `notifications.anchor`, `notifications.arrival`, and `notifications.gnss` route to "Navigational" so Garmin and B&G chartplotters surface them on the chart screen instead of the alarm-list tab. Everything else still falls through to "Technical".
- `alertPriority` now maps from the Signal K state per IEC 62923: emergency=1, alarm=2, warn=3, alert=4 (lower number = higher priority). Was hardcoded to 0, which collapsed every alert into a single visual tier on the MFD alarm list.
- Unknown Signal K states (anything other than emergency/alarm/warn/alert/normal) now fall through to "Caution" with a debug log line, instead of emitting an undefined `alertType` field that the canboat encoder treats as missing.
- alertId allocator now recycles released IDs through a `Set<number>` pool. The previous monotonic counter could wrap the 16-bit `alertId` field after 65,532 unique paths in a single plugin lifetime; that limit is now structural rather than incidental. Allocator uses a rolling hint so amortised cost stays O(1) under realistic load (≤256 active paths).
- Internal state restructured around `Map<alertId, [PGN 126985, PGN 126983]>` keyed by alertId. The cached flat `N2KMessage[]` returned to the resend pipeline is now rebuilt only on mutation, restoring the pre-1.4.3 zero-allocation cost model for dedup callbacks. The reverse map (`alertIdToPath`) is load-bearing: when the PGN-cap path evicts an entry, it clears the matching `ids[path]` binding so the released alertId cannot later be re-allocated to a different path while a stale lookup still points at it.

**Schema (`src/schema.ts`)**:
- `pgnEntry` helper extended with an optional `descriptionExtra` field appended after the canonical `PGNs: <list>` description.
- NOTIFICATIONS entry now documents that it subscribes to all `notifications.*` paths on this vessel, lists the Navigational vs Technical routing rules, and the priority map. Users could previously only infer subscription scope from the README.

**Route waypoint guard (`src/conversions/routeWaypoint.ts`)**:
- PGN 129285 is no longer emitted with `nitems: 0` when only a route name is present. Per spec, a route without waypoints or a next-point position is malformed. The guard now uses the shared `isValidNumber` helper and the `Position` type from `routeTypes.ts`, so NaN/Infinity latitudes are rejected too.

**Raymarine Seatalk Alarms (`src/conversions/raymarineAlarms.ts`)**:
- Path-prefix-to-`alarmId` mapping expanded from 2 entries (anchor, MOB) to 12, covering depth (shallow/deep), WP arrival, GPS failure, cross-track error (great-circle and rhumb-line), and the most common autopilot alarms (watch, off-course, wind shift). All values come straight from the `@canboat/ts-pgns` `SeatalkAlarmId` enum.
- Subscription `keys` array now derived from the same prefix table, so adding an entry above propagates automatically to the Signal K subscription.

**PGN list (`src/conversions/pgnList.ts`)**:
- Transmit and receive PGN arrays hoisted to module-level `TRANSMIT_PGNS` / `RECEIVE_PGNS` constants. Both the runtime message and the embedded test reference the same source, so drift is no longer possible. (Trades the embedded-test convention slightly for a smaller drift surface; the test still asserts the full expected list.)

**AIS Extended (`src/conversions/aisExtended.ts`)**:
- Test now carries a comment explaining that `typeOfShip: "Sailing"` is the decoded label round-tripped through the canboatjs decoder from the numeric LOOKUP id (36) the callback actually emits. A future contributor "fixing" the callback to emit the string label would regress to a silent encode-as-zero failure mode.

**Shared utility (`src/utils/pathUtils.ts`)**:
- New `matchPathPrefix<T>(path, table)` helper. Two near-duplicate prefix-match functions (one in `notifications.ts`, one in `raymarineAlarms.ts`) now share this implementation.

**Repo hygiene (no source changes)**:
- Apache 2.0 LICENSE appendix filled in (Copyright 2026 Nearl Crews); the boilerplate `{yyyy} {name}` placeholders are no longer in the published license.
- `.gitignore` hardened: broader `.env.*` coverage with `!.env.example` exception, `.npmrc` ignored (can hold publish auth tokens), key/cert patterns (`*.pem`, `*.key`, `*.crt`, `*.cer`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`), generic secrets (`secrets/`, `secrets.json`, `credentials.json`, `*.secret(s)`, `*.credentials`), and local agent state (`.claude/`, `.remember/`).
- `SECURITY.md` supported-versions table refreshed to 1.4.x.
- Community health: added `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, link-only to avoid duplicating the full text in-repo), `.github/CODEOWNERS`, and `.github/ISSUE_TEMPLATE/config.yml` that disables blank issues and routes questions to Discussions and security reports to Security Advisories.
- Issue templates converted from markdown to structured YAML issue forms with required fields.
- PR template trimmed from 60+ checkboxes to a focused verification list plus the PGN/Signal K-specific bullets.
- CI workflow targets `main` only (default branch reconciled from `master`), declares workflow-level `permissions: contents: read`, sets `concurrency` with cancel-in-progress for PR runs, and adds `fail-fast: false` to the Node matrix.
- Added `.github/workflows/codeql.yml` (CodeQL on push, PR, and weekly schedule with `security-and-quality` queries).
- Added `.github/dependabot.yml` for npm and `github-actions`, weekly, grouped by dev/production, ignoring major updates.
- GitHub repo settings: 12 topics set, homepage points at the npm package page, branch deletion on merge enabled, wiki disabled, Dependabot security updates enabled, and a `main` branch ruleset added requiring CI status checks (`build-and-test (20.x/22.x/24.x)`, `code-quality`) and blocking force-push, deletion, and non-linear history.

**Deferred (out of scope for this release)**:
- **PGN 126984 (Alert Response, inbound)**: the typed `@signalk/server-api` does not expose an inbound NMEA 2000 hook. The plugin would need to negotiate an untyped event surface with the Signal K server (probably via `app.on('N2KAnalyzerOut', ...)`) or convert inbound 126984 messages to Signal K deltas on a `notifications.*.acknowledgedBy` path through a separate provider. Until that lands, helm-side acknowledgements at the MFD do not flow back into Signal K and the plugin keeps re-emitting `acknowledgeStatus: "No"`. Tracking issue: TBD.
- **PGN 126986 (Alert Configuration)**: only meaningful once PGN 126984 round-trip lands.
- **`dataSourceNetworkIdName` ISO-Name plumbing**: the field currently carries the alertId as a 1-byte number widened to an 8-byte IsoName slot, which canboatjs accepts but is not strictly spec-compliant. A correct fix requires the plugin to own its NAME claim, out of scope.
- **`alertType` / `alertCategory` / `alertState` enum imports from `@canboat/ts-pgns`**: would catch typos at compile time but adds a runtime dependency on a package currently held as a transitive dev dep through canboatjs. The string literals are kept inline with a comment cross-referencing the enum.

**Verification**: `npm run typecheck` clean, `npm test` 21/21 pass, `npm run check` (Biome) clean, `npm run build` 340.1 KB. No em dashes in source.

### v1.4.2 (2026/05/11) - Admin UI, Status Lifecycle, and Error Throttling

A four-expert team review of the plugin's user-visible surfaces (admin schema, plugin status messages, conversion module titles) followed by a three-lane simplify pass (reuse, quality, efficiency). All 47 source files touched; behaviour changes are additive and conservative.

**Admin UI (`src/schema.ts`)**:
- Top-level title and description rewritten; brand normalized to "NMEA 2000" (was "NMEA2000") across every title, description, status string, and comment.
- "Magnetic Variance" renamed to "Magnetic Variation" so the schema label matches the SK spec path `navigation.magneticVariation`.
- Section title normalization: "COG and SOG" (was "COG & SOG"), "Bearing and Distance Between Marks", "Route and Waypoint List" (was "Route/WP List"), "Raymarine Seatalk Alarms" (was "Raymarine (Seatalk) Alarms"), "Environmental Parameters" (was a duplicate "Atmospheric Pressure" entry).
- Source-filter and resend-override descriptions rewritten with concrete examples and actionable language; `globalResendInterval` now explains why periodic re-emission matters for N2K displays.
- Array-mapping fields ("Signal K battery id", "Signal K tank path", etc.) get descriptions with concrete examples ('house', 'starter', 'tanks.fuel.0').
- `ATTITUDE` source filters collapsed to the single subscribed parent path `navigation.attitude`. The previous per-axis filters were dead UI: the conversion never subscribed to children.
- Required arrays added to BATTERY, ENGINE_PARAMETERS, TANKS, RAYMARINE_BRIGHTNESS, EXHAUST_TEMPERATURE array mappings, so half-filled rows can no longer be silently dropped at runtime.
- Source-filter completeness gaps closed for SEA_TEMP (added `environment.outside.pressure`), TRANSMISSION_PARAMETERS (added `discreteStatus1`, `discreteStatus2`), and NAVIGATION_DATA_GREAT_CIRCLE (added the four `calcValues` paths mirroring NAVIGATION_DATA).
- AIS PGN list ordered ascending; `globalResendInterval` gets `minimum: 0`; SOLAR.chargers refactored to use the shared `arrayMapping` helper.

**Conversion module titles (45 modules, 54 edits)**:
- Canonical format adopted across every module: `"<Title> (PGN <n>)"` for single-PGN modules, `"<Title> (PGNs <a>, <b>)"` for multi-PGN modules, ascending order with comma-space.
- Notable renames so admin-UI titles read consistently: `TrueHeading` to `True Heading`, `Sea/Air Temp` to `Sea Temperature`, `Location` to `GPS Position`, `Set/Drift` to `Set and Drift`, `Heading` to `Vessel Heading`, `Atmospheric Pressure (130311)` to `Environmental Parameters`, `Raymarine (Seatalk) Alarms` to `Raymarine Seatalk Alarms`.

**Plugin status and error lifecycle (`src/plugin-manager.ts`)**:
- N=0 case shows "No conversions enabled. Enable at least one in plugin settings." instead of the misleading "Running with 0 conversions enabled".
- "Waiting for NMEA 2000 output (N conversions enabled)" surfaces when `start()` finishes before `nmea2000OutAvailable` fires. A constructor-installed listener refreshes the status to the running form once emission becomes possible, without re-running the full enablement sweep.
- New per-key error throttle (60 s window) routes callback, output, resend, subscription, and stream errors through one helper. The first error per key passes through; subsequent identical-key errors are counted and appended as a summary on the next emit. Prevents a flaky source from flooding the server log on every delta.
- Subscription and stream errors now include `moduleLabel` (was a bare `errMessage`), so the log line identifies which PGN/path is failing.
- Startup-failure message points users to "plugin configuration and the Signal K server log for details".
- Sub-conversions returned from `conversions:` factory closures (BATTERY, ENGINE_PARAMETERS, TANKS, SOLAR, EXHAUST_TEMPERATURE, RAYMARINE_BRIGHTNESS, and the TEMPERATURE_*/TEMPERATURE2_* family) now get distinct throttle keys and useful log labels via a spread-copy per sub-conversion (`${parent.optionKey}[${idx}]` and `${parent.title} #${idx}`). Previously all of a parent's sub-conversion errors merged into one bucket and rendered as "<unnamed>".
- New `bucketKey(prefix, conversion, suffix?)` helper consolidates five duplicated key-formulation sites.
- Debug-noise cleanup: dropped the `=== STARTING ===` / `=== COMPLETE ===` banners and shouty "*** SETTING UP ***" line; per-conversion startup debug consolidated to one `Enabling: <label>` line per enabled conversion.

**Plugin icon refresh (`assets/icons/`)**:
- Plugin now ships the family icon set (`icon.svg` + `icon-{72,96,192,512}.png`) shared with `signalk-virtual-weather-sensors` and `signalk-openrouter-companion`: a deep-ocean gradient with three stylized wave lines and a project-coloured badge in the bottom-right. `package.json` `signalk.appIcon` points at `icon-192.png`.
- Badge glyph: three concentric arcs radiating from a transmitter dot in the badge interior, sized to fill most of the orange badge and anchored slightly up-and-right of the badge's lower-left corner for visual balance. Reads as directional broadcast / emit. Replaces an earlier up-arrow variant that read as an upload/update indicator, and the pre-family standalone cannon icon (`icon-72x72.png`) is removed.

**Verification**: `npm run typecheck` clean, `npm test` 21/21 pass, `npm run build` 337.8 KB clean. No em dashes in source.

### v1.4.0 (2026/05/10) - Multi-agent Compliance Review, Fix Pass, and Simplify Pass

A four-expert Signal K compliance review surfaced about thirty findings spanning lifecycle, conversions, schema, types, and utilities. A six-agent fix team then resolved them, followed by a four-lane simplify pass (reuse, quality, efficiency, Signal K compliance) that caught two BLOCKER regressions introduced during the fix pass.

**Wire-level correctness (PGN encoding bugs)**:
- `magneticVariance.ts`: `ageOfService` now treats the SK value as Unix epoch seconds (the canonical spec interpretation: "seconds since 1 Jan 1970 that the variation calculation was made"), not as a delta. Previously the fix pass mis-interpreted it as "seconds since last update" and produced a 1970 date on the wire.
- `dscCalls.ts`: `mmsi` typed as `string | null` (per SK spec) and parsed via `parseMmsi` from `aisUtils`. Was typed as `number | null`, producing a string-into-numeric-field on the wire for live data.
- `smallCraftStatus.ts`: SK `steering.trimTab.{port,starboard}` is ratio -1..1, multiplied by 100 for PGN 130576. Dropped the `Math.abs(position) < PI` heuristic and `/0.52*100` scaling that assumed radians and produced ~2x error.
- `aisExtended.ts`: PGN 129798 SAR Aircraft `altitude` now `undefined` (canboatjs emits the "not available" sentinel) when SK has no altitude, instead of substituting `0` (sea-level aircraft on the wire).
- `transmissionParameters.ts`: gear classification fixed (`> 0` Forward, `< 0` Reverse, `= 0` Neutral). 1:1 direct-drive and overdrive transmissions previously misclassified as Neutral. When `gearRatio` is invalid, `transmissionGear` is now omitted so canboatjs emits the "data not available" sentinel instead of a fabricated "Neutral".
- `bearingDistanceBetweenMarks.ts`: PGN 129302 now sets `bearingReference: "True"` and `calculationType: "Great Circle"` explicitly. Subscription prefers `navigation.courseGreatCircle.nextPoint.bearingTrue` with fallback to `bearingMagnetic + magneticVariation`.
- `aisExtended.ts`: `safetyMessage` cap raised from 156 to 161 chars per ITU-R M.1371-5.
- `wind.ts`, `windTrueWater.ts`, `windTrueGround.ts`: PGN 130306 now emits when EITHER `windAngle` OR `windSpeed` is valid (the absent field is sent as the canboatjs "not available" sentinel), aligning with the SK spec's partial-delta semantics instead of suppressing every angle-only or speed-only update.

**Schema correctness (admin UI surfaces real controls)**:
- `RAYMARINE_BRIGHTNESS` and `EXHAUST_TEMPERATURE` schemas now expose `groups` and `engines` arrayMappings respectively. Previously these conversions had no UI surface for their required option arrays, so they could be enabled but produced no output.
- `RAYMARINE_BRIGHTNESS.groups[].instanceId` typed `string` (matches `BrightnessGroup` runtime check which expects "Helm 1"-style labels). Was typed `number`, causing every UI-entered group to be rejected by the type guard.
- `RUDDER` source paths and `rudder.ts` subscription keys corrected to the canonical SK paths `steering.rudderAngle` and `steering.rudderAngleTarget` (no `.main` suffix, which is not part of the SK spec).
- `MAGNETIC_VARIANCE` source path typo `navigation.magneticVariance` -> `navigation.magneticVariation`. Added `navigation.magneticVariationAgeOfService`.
- `ENGINE_STATIC` sources include `propulsion.main.VIN` and `propulsion.main.softwareVersion` (de-facto SK paths; not in the canonical SK schema but widely used).
- `ROUTE_WP_LIST` advertised PGN corrected from 129285 to 130074 (the PGN actually emitted by `routeWpList.ts`).
- `HUMIDITY_INSIDE` source switched to canonical `environment.inside.relativeHumidity` (the subscribed path).
- Seven additional source-filter mismatches in SMALL_CRAFT_STATUS, DIRECTION_DATA, NAVIGATION_DATA, GPS, ROUTE_WAYPOINT, HEADING normalised so every schema source matches a real subscription.
- Temperature entries unified via `pgnEntry` helper (was a parallel `buildTemperatureEntry` envelope); shape now consistent with every other PGN.

**Lifecycle hardening (`plugin-manager.ts`, `index.ts`)**:
- `startPlugin` now stops any live `PluginManager` before allocating a fresh one. Prevents listener / timer / subscription leaks on re-entry.
- `stop()` clears `this.conversions` to release callback closures so prior `PluginManager` instances can be garbage-collected across restarts (mitigates the upstream lack of an `unregisterDeltaInputHandler` API).
- `start()` catch now calls `stop()` to clean up partial subscriptions and the constructor-installed `nmea2000OutAvailable` listener on startup failure.
- Added `stopped` guards in `mapSubscription`'s deltaCb, the RxJS Subject `next` handler, and the resend timer's async race window.
- `mapRxJS` now snapshots `args.slice()` into `lastInputs` so the resend timer sees the value at debounce-emit time, not a live view into the per-onValue reusable buffer.
- `getSelfBus` consumers typed via `NormalizedDelta` from `@signalk/server-api`; dropped two unsafe casts.

**Type-system tightening**:
- `JSONSchema` widened to `JSONSchema7` from `@types/json-schema`; admin-UI schema can now use `minimum`, `additionalProperties`, `pattern`, `oneOf`, etc.
- `PluginOptions` split into nested internal `{ globalResendInterval?, conversions: Record<string, ConversionOptions> }` plus `RawPluginOptions` wire format. `normalizePluginOptions` round-trips both. `start()` boundary types use `RawPluginOptions` to match what Signal K actually delivers.
- `ConversionModule.properties` field removed (was dead-but-populated by 6 modules with no merger reading it); per-conversion sub-properties now live exclusively in `src/schema.ts`.
- `ConversionModule` / `SubConversionModule` `outputType?` field removed (set but never read; dispatch uses `OUTPUT_TYPE.TO_N2K` directly). Same for the speculative `policy?` / `period?` subscription fields that no conversion exercised.
- `notifications.ts`: `delta` typed via SK's `Delta`; `app.handleMessage` second arg typed `Partial<Delta>`. Drops two `as` casts.
- `N2KFieldObject` recursive type makes `N2KFieldValue` symmetric (objects carry `N2KFieldValue`, not `unknown`).
- `BearingDistanceInputs` tuple arity corrected (was 7 elements, callback takes 6).

**Utilities (`src/utils/`)**:
- `messageUtils.validateN2KMessage` now rejects NaN/Infinity numeric fields by routing `isValidN2KFieldValue`'s numeric branch through `isValidNumber` (previously `typeof === "number"` admitted NaN/Infinity, contradicting the documented behavior).
- `dateUtils.toN2KTime` adds sub-second precision via `getUTCMilliseconds() / 1000` so PGN 126992 SystemTime hits its 0.0001s resolution.
- `smoothing.ExponentialSmoother.smooth` guards non-finite input so a single NaN no longer poisons a key for the rest of the process lifetime.
- New `utils/debugUtils.isDebugEnabled(app)` helper; the `(app.debug as unknown as { enabled?: boolean })` cast lives in exactly one place.
- New `utils/pathUtils.getSelfValue(app, path)` helper; `gps.ts` and `depth.ts` now use the same `getSelfPath` -> envelope `.value` extraction convention.
- New `constants.DEFAULT_GLOBAL_RESEND_SECONDS = 5`; literal `5` removed from `plugin-manager.ts` and `schema.ts`.
- `N2K_DEFAULT_SID` (87) vs `N2K_SID_ZERO` (0) docstring clarifies the intended usage.
- Orphan `N2KMessage.src?` field removed (no consumer; `cleanN2KMessage` strips it before validation anyway).
- Unused exports `UnknownRecord` (from `types/index.ts`) and `PluginFactory` (from `types/plugin.ts`) removed; neither had a consumer.
- Stale `plan item H3/L2` review-finding markers in `src/test/lifecycle.test.ts` and `src/test/pathUtils.test.ts` headers stripped (matches the v1.2.5 pass that removed `(M3)`/`(H5)`/etc).

**Post-release follow-up (rolled into v1.4.0)**:

- `battery.ts` PGN 127506 / 127508: every numeric field now routes through `toValidNumber` and missing fields are emitted as `undefined` rather than `null`. canboatjs rejects `null` field values (`Invalid field value for stateOfCharge`) and was dropping every battery message when any of `stateOfCharge` / `stateOfHealth` / `timeRemaining` / `rippleVoltage` was absent from the Signal K source. With the fix, canboatjs encodes the "not available" sentinel and the messages reach the bus cleanly. Surfaced by live-bus monitoring; logged at ~3/sec on a real install with three configured batteries.

**Operational guidance for Garmin installs**:

- For modern Garmin ECHOMAP / GPSMAP / GMI chartplotters, prefer the current PGN set: `TEMPERATURE2_*` (PGN 130316), `HUMIDITY_OUTSIDE` (PGN 130313), `PRESSURE` (PGN 130314), `WIND` / `WIND_TRUE_GROUND` / `WIND_TRUE` (PGN 130306). Disable the deprecated `TEMPERATURE_*` (PGN 130312) and `ENVIRONMENT_PARAMETERS` (PGN 130311) variants unless you have an older display that requires them.
- ECHOMAP UHD2 6/7/9 sv (verified against Garmin's April 2026 Owner's Manual v13) receives 130306 / 130311 / 130312 / 130313 / 130314 / 130316. The `temperatureSource` enum on PGN 130316 carries Dew Point (9), Apparent Wind Chill (10), Theoretical Wind Chill (11), and Heat Index (12), which Garmin reads as distinct temperature sources rather than computing them locally. To get these on Garmin, enable the corresponding `TEMPERATURE2_DEWPOINT` / `TEMPERATURE2_APPARENTWINDCHILL` / `TEMPERATURE2_HEATINDEX` conversions and ensure your Signal K source (e.g. `signalk-virtual-weather-sensors`) is publishing the matching `environment.outside.*` paths.

**Configuration hygiene**:

- Source filters bind to a specific Signal K `$source` value (e.g., `accuweather`, `nmea2000_feed.c078be001cb01cc9`). If you decommission or rename a Signal K plugin, the filters that pointed to it remain in the saved config and silently reject every delta. The plugin will appear to be enabled but emit nothing. Periodically audit your filters against `GET /signalk/v1/api/vessels/self/<path>` to confirm the live `$source` matches what the filter expects.
- Conversions with no Signal K source for their path are inert. They cost a little startup work but otherwise do nothing. If you know a path will not be published on your boat (for example, your hardware has no rate-of-turn sensor), disable the conversion to keep the admin UI honest.
- The v1.4.0 schema renamed the `MAGNETIC_VARIANCE` source-filter propname from `navigationmagneticVariance` (pre-v1.4.0 typo) to `navigationmagneticVariation` (canonical Signal K path). Configurations saved against the old name carry a stale key that no schema-driven UI control writes to. Delete the stale `navigationmagneticVariance` key from `~/.signalk/plugin-config-data/signalk-nmea2000-emitter-cannon.json` and re-save through the admin UI if needed.

### v1.3.2 (2026/05/09) - Full-Codebase Simplify Pass and CI Publish

**Schema correctness (admin UI / config persistence)**:
- `src/schema.ts` GNSS DOPs entry: typo `navigationgnsstitimeDilution` corrected to `navigationgnsstimeDilution`. Source-filter for `navigation.gnss.timeDilution` was silently inert because the schema key never matched the runtime `pathToPropName` output.
- `src/schema.ts` TANKS block: field renamed `signalkId` -> `signalkPath` to match what `tanks.ts` reads at runtime. Admin-UI tanks were configurable but never matched at runtime; `Invalid tank path` errored on every dispatch.
- `src/schema.ts` SOLAR block: added `instanceId` field (battery-side instance for PGN 127508). `solar.ts` reads `charger.instanceId`; the schema only exposed `panelInstanceId`, so PGN 127508 emitted `instance: undefined`.

**PGN 126464 transmit-list completion**:
- `pgnList.ts` advertised list expanded from 34 to 56 PGNs to match every PGN this plugin actually emits. The omitted 21 PGNs (130577, 130313, 130314, 130311, 130310, 130074, 129284, 129291, 129301, 129302, 128000, 127505, 127252, 127257, 127251, 127250, 126992, 126983, 126985, 126720, 65288) were emitted but never declared, so receivers polling 126464 wouldn't surface them in their device source lists.

**AIS hot-path correctness (`ais.ts`)**:
- Position guard `!position?.latitude || !position.longitude` rejected vessels at the equator or prime meridian. Switched to `isValidNumber`, accepting `0`.
- `cog`/`heading` validity gates now use `isValidNumber(x) && x >= 0 && x <= 2*PI` instead of `x != null && x <= 2*PI`, rejecting NaN/negatives.
- `beam`/`fromCenter`/`fromBow` checks switched to `isValidNumber` (previously `!= null` accepted NaN). `fromBowScaled` now preserves a valid `0`.

**Validation utilities (`src/utils/`)**:
- `validation.ts`: `toValidNumber` now expressed via `isValidNumber` (was duplicate predicate). Hoisted `TWO_PI = Math.PI * 2` at module scope; `normalizeAngle` no longer recomputes per call.
- `errorUtils.ts`: `errMessage` now `JSON.stringify`s plain-object throws (with String fallback for cyclic refs) instead of producing the lossy `[object Object]`.

**Constants (`src/constants.ts`)**:
- Added `VESSELS_SELF_CONTEXT = "vessels.self"` (was a private const in `plugin-manager.ts`) and `STREAM_DEBOUNCE_MS = 10` (was a magic number in the RxJS pipe).

**Plugin manager (`plugin-manager.ts`)**:
- Removed dead `Array.isArray(conversion)` outer wrapper (`this.conversions: ConversionModule[]` is never nested).
- Imports `VESSELS_SELF_CONTEXT` and `STREAM_DEBOUNCE_MS` from `constants.ts` (single source of truth).
- `subConversions` derivation is now an explicit if/else cascade with a typed local instead of a let-and-narrow chain.
- Conversion factory error path now also calls `setPluginError` so admin UI surfaces a startup failure (was log-only).

**Validation hardening across conversions** (`typeof === "number"` and `isValidNumber(...)?x:undef` chains -> `toValidNumber`):
- `engineStatic.ts`, `transmissionParameters.ts`, `smallCraftStatus.ts`, `timeToMark.ts`, `bearingDistanceBetweenMarks.ts`, `depth.ts`, `radioFrequency.ts`, `battery.ts`. Completes the v1.3.1 migration that was started in `engineParameters.ts` and `directionData.ts`. Tests still pass; behavior on valid input unchanged, NaN/Infinity now consistently rejected.

**Magic-number naming**:
- `engineStatic.ts`: `STATIC_DATA_TIMEOUT_MS = 60 * 60 * 1000`.
- `smallCraftStatus.ts`: `TRIM_TAB_FULL_DEFLECTION_RAD = 0.52`.
- `depth.ts`: `N2K_DEPTH_PRIORITY = 3` (was raw literal in `prio:` field).
- `radioFrequency.ts`: `DEFAULT_TX_POWER_W`, `DEFAULT_ANTENNA_HEIGHT_M`, `DEFAULT_SQUELCH_LEVEL`, `MHZ_TO_HZ`.
- `battery.ts`: `BATTERY_TIME_REMAINING_ALPHA`, `DISCHARGE_THRESHOLD_A`, `MAX_TIME_REMAINING_S`, `PERCENT_SCALE`.
- `routeTypes.ts`: `MAX_RPS_WAYPOINTS = 8` (PGN 129285), `MAX_WP_LIST_WAYPOINTS = 16` (PGN 130074).

**Route waypoints (Null Island fix)**:
- `routeWaypoint.ts` and `routeWpList.ts`: waypoints with missing or invalid `position.latitude` / `position.longitude` are now dropped rather than emitted at `(0, 0)`. The previous `?? 0` zero-fill silently planted false marks at the null island.

**DSC and radio cleanup**:
- `dscCalls.ts`: dropped 4 subscription paths (`communication.dsc.{position,workingFrequency,vesselInDistress,callTime}`) the callback never used. Replaced 4-deep `dscCategory` nested ternary with a `dscCategoryMapping` lookup. Hoisted `callTypeMapping` and `distressMapping` to module scope (were rebuilt per delta).
- `radioFrequency.ts`: dropped unused `mode` subscription. `normalizeFreq` extracted to a module-scope helper.

**CI / release automation**:
- `.github/workflows/publish.yml`: auto-publish to npm on `release: published` plus a `workflow_dispatch` fallback for tags created before the workflow existed. Runs typecheck + tests + version-match before `npm publish --provenance --access public`. Requires `NPM_TOKEN` repo secret (npm Automation token, or Granular token with publish + read on this package).

**Bundle**: 208.7 KB (was 207.3 KB after v1.3.1; the added validation guards and named constants are net additive).

---

### v1.3.1 (2026/05/08) - Spec 1.8.2 Compliance and Wire-Output Corrections

**NMEA 2000 wire-output corrections (real bugs on the wire)**:
- PGN 127489 / 127488 engine pressures: `oilPressure`, `coolantPressure`, `fuelPressure`, and `boostPressure` were divided by 100 before being passed to canboatjs. Pa is the spec unit and the encoder applies `Resolution` internally, so a real Garmin saw a 102733 Pa Signal K input as 1000 Pa on the wire. The companion conversions `pressure.ts`, `environmentParameters.ts`, and `seaTemp.ts` already passed Pa unmodified. Embedded test expected values updated to the correct round-trip (`oilPressure: 102700`, `coolantPressure: 202100`, `fuelPressure: 11111000`, `boostPressure: 20300`).
- PGN 130577 direction data: replaced seven invented field names (`sidForCog`, `sogReference`, `sidForSog`, `headingReference`, `sidForHeading`, `speedThroughWaterReference`, `sidForStw`) with the canonical `@canboat/ts-pgns` schema (`sid`, `dataMode`, `cogReference`, `cog`, `heading`). The PGN defines a single `sid` and a single `cogReference`; the extras were silently dropped by the encoder, and the actual `sid` field was never set. Heading now ties to the same reference as cog so consumers don't misinterpret it; heading-only-magnetic cases stay covered by PGN 127250 in `heading.ts`. Tests updated to expect `sid: 0` in the round-trip.

**Subscription path corrections (Signal K spec 1.8.2)**:
- `leeway.ts`: `performance.leeway` -> canonical `navigation.leewayAngle`. Schema source-filter key `performanceleeway` renamed to `navigationleewayAngle` to match.
- `battery.ts`: dropped the non-canonical `Temperature1` fallback path and its callback slot. Renamed `ripple` -> canonical `voltage.ripple`. Test inputs reshaped from 10 to 9 args.

**API conformance against `@signalk/server-api` 2.24**:
- AIS migrated from the undocumented `app.on("delta")` event to `app.registerDeltaInputHandler(handler)`. The handler calls `next(delta)` first so `app.getPath()` reflects the just-applied state, matching the post-processing semantics of the legacy hook. Lifecycle is owned by signalk-server: registered handlers are torn down on plugin stop via `onStopHandlers`.
- `ais.ts`: short-circuits non-vessel/non-aton contexts before allocating the delta index, since `registerDeltaInputHandler` fires on every server-wide delta.
- `combinedBus.complete()` added to per-conversion stream teardown so the RxJS Subject is released across plugin restarts.
- Dead guards dropped on `app.handleMessage` (`notifications.ts`) and `app.reportOutputMessages` (`plugin-manager.ts`); both methods are non-optional in `ServerAPI` 2.x.
- `index.ts`: `console.error` replaced with `app.debug` per the plugin developer guide; declared the optional `restartPlugin` second argument from the official `Plugin.start` type.

**Type and code cleanup**:
- `src/types/signalk.ts`: deleted unused local `StreamBus`, `Subscription`, `Delta`, `DeltaUpdate`, `DeltaValue`, and the dead `OfficialDelta` re-export. None were imported anywhere outside `signalk.ts`. Tightened `SignalKApp` event signatures to literal types for `nmea2000JsonOut` and `nmea2000OutAvailable`.
- `directionData.ts`, `engineParameters.ts`: pure-passthrough `isValidNumber(x) ? x : null` chains swapped for `toValidNumber`, matching the convention in `cogSOG.ts` and `heading.ts`.
- `index.ts`: hoisted the duplicate `errMessage(error)` call into a single `const msg`.

**AppStore keywords (verified against `signalk-server/src/categories.ts`)**:
- `signalk-category-nmea2000` corrected to canonical `signalk-category-nmea-2000`. The unhyphenated form is not in the AppStore category list.
- Removed unrecognized `signalk-category-navigation`. Added `signalk-category-ais` since the plugin emits seven AIS PGNs (129038, 129039, 129040, 129041, 129794, 129798, 129802).

**Test mock**:
- `src/test/lifecycle.test.ts`: added `reportOutputMessages` and `registerDeltaInputHandler` stubs to the mock `app` to faithfully model `ServerAPI` 2.x.

**CI / release automation**:
- New `.github/workflows/publish.yml`. On `release: published` it runs typecheck and tests, verifies that the release tag matches `package.json` version, then `npm publish --provenance --access public`. Requires an `NPM_TOKEN` repo secret. Also exposes a `workflow_dispatch` trigger with a `tag` input so a release tagged before the workflow existed can be published manually from the Actions tab.

**Bundle**: 207.3 KB (was 209 KB) due to dead-code removal.

---

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
  for waypoint coordinate defaults: a valid `0` latitude (equator) or `0`
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
  across 35 files: net 162 lines removed.
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
  Upstream Signal K humidity sources disagree on which path is canonical.
  `signalk-virtual-weather-sensors`, for example, publishes to `.humidity`,
  while the emitter-cannon previously only listened on `.relativeHumidity`,
  so the Garmin showed no reading. `relativeHumidity` still wins when both
  are present. Inside humidity is unchanged (no sibling `.humidity` path).

### v1.2.3 (2026/04/19) - Bus Correctness, Lifecycle Hardening, Type Safety

**NMEA 2000 Bus Correctness (wrong data on the wire, fix first)**:
- PGN 127245 rudder `directionOrder` now emits the canboat enum values
  (`Move to starboard`, `Move to port`) instead of `Turn Right`/`Turn Left`,
  which canboatjs silently dropped to `No Order`. Rudder direction commands
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
  `"No GNSS"` when Signal K reports mode `"Auto"`. Chart plotters no longer
  show "No GNSS fix" while the receiver is in auto-2D/3D mode.
- PGN 128267 depth: `surfaceToTransducer` is now negated when used as the
  N2K offset (freeboard offset is signed negative per the PGN spec).
- PGN 127257 attitude: `pitch`/`yaw`/`roll` are validated with `isValidNumber`
  and dropped when NaN/Infinity. Faulty IMU readings no longer leak corrupt
  bits onto the bus.
- PGN 130306 true wind (water/ground) now includes a `sid` field matching
  the apparent-wind variant, so correlated wind messages share a sequence ID.
- Temperature instance collisions resolved: eight sources that previously
  defaulted to instance `107` (Main Cabin, Refrigerator, Heating System,
  Dew Point, Apparent Wind Chill, Theoretical Wind Chill, Heat Index, Freezer)
  now have unique defaults (104–111).
- AIS: `isN2K()` now actually detects NMEA2000-originated deltas via
  `updates[].source.type === "NMEA2000"`, closing an echo loop that doubled
  AIS frames on vessels with a hardware receiver + this plugin.
- AIS: own-vessel filter no longer falls back to the literal `"vessels.self"`
  (which never matched real urn-form contexts, letting own-vessel data leak
  out as if it were a remote target). Missing `app.selfId` skips the callback.

**Plugin Host Lifecycle**:
- `nmea2000OutAvailable` listener is now removed in `stop()`. Previously
  every restart leaked a listener plus the PluginManager it closed over,
  eventually tripping `MaxListenersExceeded`.
- Timer-source conversions (e.g. `systemTime`) no longer get a redundant
  global resend timer. `systemTime` was emitting PGN 126992 both on its
  1s main interval and every 5s from the resend timer.
- Replaced `BehaviorSubject<unknown[]>([])` seed with a plain `Subject`.
  The pipeline no longer fires callbacks with empty args at startup before
  any real Signal K value has arrived.
- `clearAllSmoothers()` now releases registry entries so
  `ExponentialSmoother` instances can be garbage-collected across restarts.
- Notifications subscribe with `policy: "instant"` instead of the default
  `fixed` 1s period, so bursts of alerts are no longer throttled.
- Source-filter predicate now matches label prefixes (`gps1` matches
  `gps1.0`, `gps1.1`, …) instead of requiring an exact match against the
  composite `$source`. The admin UI description now reflects real behavior.
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
  `typeof x === "function"`: TypeScript narrows properly.

**Test & Build Hardening**:
- Coverage thresholds wired into `vitest.config.ts`
  (statements 70, branches 55, functions 80, lines 70) so PRs can't
  silently tank coverage.
- Module-count assertion pinned to `74` (was `toBeGreaterThan(0)`, which
  masked silent factory-load failures).
- Production build no longer emits linked sourcemaps: 387kb of broken map
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
- Removed `resendTime` entirely: timers now resend indefinitely until the plugin stops or new data arrives

---

### v1.2.0 (2026/04/08) - Codebase Simplification & Bug Fixes

**Critical Bug Fixes**:
- Fixed duplicate `design.draft` entry in AIS `staticKeys` that corrupted positional argument mapping for `fromBow` and `imo` fields
- Fixed unreachable code branch in notifications where `value.state === "normal"` was checked inside a `value.state !== "normal"` guard
- Fixed event listener leak in `mapOnDelta`: delta handlers now properly clean up on plugin stop via `removeListener`

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
