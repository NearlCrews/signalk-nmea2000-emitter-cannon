# Changelog

All notable changes to NMEA 2000 Emitter Cannon are documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- The configuration panel now explains when its required native CSS scope
  support is unavailable.

### Changed

- The panel targets `signalk-nearlcrews-ui` 0.7.0, uses its shared relative-age
  formatter, docks save actions to the viewport when needed, and consumes
  React and React DOM as host-provided Module Federation singletons.
- Save and discard actions now report that the host request was issued and
  move focus to the stable completion message.
- Compatible dependencies and workflow checks are refreshed, Vitest loads its
  configuration as native ESM, and release tarballs verify their source commit
  through npm `gitHead` metadata.

### Fixed

- Configuration migrations and Advisor saves preserve unknown top-level and
  per-conversion keys for forward-compatible round trips.

<a id="v1106"></a>

## [1.10.6] - 2026-08-04

### Fixed

- Standalone atmospheric-pressure output now rejects values above the PGN
  130314 wire ceiling instead of allowing Canboat to truncate them.
- Hand-edited or migrated temperature and humidity source overrides now fall
  back to each conversion's default when the stored value is not a valid
  Canboat enum.
- Partial tank messages now omit unavailable numeric fields consistently while
  retaining their NMEA 2000 not-available encoding.
- README references to repository-only documents now remain useful in the
  Signal K App Store and npm package views.

### Changed

- The configuration panel now bundles `signalk-nearlcrews-ui` 0.6.2.
- Coverage floors now enforce 90 percent lines, 80 percent branches, and 90
  percent functions while retaining the independently measured 85 percent
  statement floor.
- Refreshed compatible development dependencies.

<a id="v1105"></a>

## [1.10.5] - 2026-08-02

### Changed

- The configuration panel now bundles `signalk-nearlcrews-ui` 0.6.1. Fresh
  profiles follow the Signal K host through Auto theme, explicit preferences use
  the shared storage key, and the footer uses the current directional sticky
  action-bar contract. The panel component budget moves from 40 kB to 46 kB
  brotlied for the bundled shared-UI upgrade, while the plugin and federation
  runtime budgets remain unchanged.
- Production plugin builds now use esbuild's syntax and whitespace minimization
  to keep the expanded safety checks within the existing bundle budget without
  obscuring identifiers. Panel builds use size-oriented internal export names
  and function hoisting while preserving the public Module Federation contract.
- Compatible development dependencies are refreshed, including Biome,
  Playwright, Axe, Size Limit, Knip, Dependency Cruiser, React type definitions,
  Webpack, its minimizer, and Webpack CLI. TypeScript stays on 6.0.3 because the
  current typed-lint toolchain does not support TypeScript 7.
- Workflow validation now enforces full action commit pins and release
  invariants locally. GitHub Actions also runs actionlint and zizmor, release
  jobs disable package-manager caching, checkout credentials are not persisted,
  Dependabot updates observe a seven-day cooldown, and the repository's
  GitHub-managed CodeQL default setup scans JavaScript, TypeScript, and Actions.
- The dependency audit now exposes separate runtime and policy-aware full-audit
  commands. The combined `audit` command runs both gates, and portfolio tooling
  can verify their coverage directly.

### Fixed

- The panel no longer reads the retired `skn-theme` key, which could pin a
  fresh installation instead of following the host theme. Browser verification
  now proves the Auto default and checks both initial and edited mobile states
  with Axe.
- `WIND_WEATHER_TRUE` now accepts `navigation.headingTrue` from an NMEA 2000
  sensor, including a Garmin GPS24xd, as a supporting input when deriving the
  relative forecast-wind angle. It now emits the `True (water referenced)` PGN
  130306 form used by the tested ECHOMAP UHD2 setup. Garmin does not document
  enum-specific display behavior, so results remain model- and firmware-specific.
  The echo guard remains active for received wind inputs.
- Live wind and Direction Data inputs now expire after ten seconds. Forecast
  wind direction and speed use a 125-second window that accommodates a
  60-second weather rebroadcast cadence, while the live heading used by
  `WIND_WEATHER_TRUE` still expires after ten seconds. Resend ticks enforce the
  same per-input freshness windows. Configuration validation and runtime startup
  also prevent real and forecast producers from competing for the same apparent
  or true-wind display data on PGN 130306.
- Source filtering and NMEA 2000 echo protection now apply to subscription and
  whole-delta conversions, honor canonical `$source` values, preserve safe
  values in mixed-source deltas, and support narrowly allowed upstream PGNs.
  This restores safe NMEA 2000 inputs for Vessel Trip and Direction Data without
  allowing their own output PGNs to loop.
- AIS relays now reject bus-origin updates identified only by `$source` while
  retaining non-bus updates from the same delta. Per-field freshness prevents
  stale navigation or static details from being paired with a new position,
  protocol states follow the current Signal K schema, and an allow-listed,
  bounded cache prevents unrelated vessel data from growing retained state.
- Standard alerts now use canonical status fields, safe control-capability
  flags, printable bounded text, collision-safe IDs, and terminal clear frames.
  Raymarine alarms now recognize current waypoint-arrival paths, aggregate all
  source-and-path contributors into one SeaTalk wire identity, retain alarms
  until the final contributor clears, and time-gate terminal clear retries.
- Config Advisor saves now propagate asynchronous failures, preserve unapplied
  recommendations after a failed save, serialize concurrent changes, restore
  saved and running configuration after a failed restart, and never start a
  disabled or failed plugin. Canonical and legacy dotless publisher pins can
  both be detected, changed, and cleared. Source-clear approvals are bound to
  the complete reviewed path and publisher set, so stale or partial approvals
  cannot remove a newer source choice. Slow parked-result responses can no
  longer restore an already-applied recommendation in the panel.
- Enabled factory conversions that produce no runnable mappings now report a
  configuration error instead of counting as active. Startup failures are
  returned to the plugin lifecycle, periodic Advisor scheduling starts only
  after conversion startup succeeds, and host-managed delta handlers and NMEA
  readiness listeners now survive plugin and Advisor restart boundaries without
  leaking, duplicating, or processing before Signal K updates its model.
  Asynchronous conversion callbacks also stop without emitting or arming resend
  timers when their manager is retired while they are in flight.
- PGN 126464 now broadcasts once at startup before continuing on its five-minute
  interval. Its transmit list contains only plugin-owned PGNs because Signal K's
  output-ready event does not prove which transport-layer capabilities the
  provider owns. GNSS DOP output derives VDOP from valid HDOP and PDOP,
  suppresses unusable PDOP-only frames, and no longer re-emits cached satellite
  detail when only the scalar satellite count changes.
- Repository CI and npm publishing now invoke the pinned npm 12 CLI without
  replacing setup-node's bundled npm installation, which prevents incomplete
  in-place npm upgrades on Node 22 runners.

<a id="v1104"></a>

## [1.10.4] - 2026-07-27

### Changed

- The configuration panel now bundles `signalk-nearlcrews-ui` 0.4.1, including
  improved Night-theme contrast, loading-button contrast, responsive action
  overflow handling, and current shared-control behavior. Panel checks derive
  the exact bundled version from package metadata instead of duplicating it.
- The development baseline is Node 22.22.2 with npm 12.0.1. Repository CI now
  runs the complete release gate on both the minimum Node release and current
  Node 24.
- Compatible development libraries are refreshed to current releases,
  including Biome 2.5.5, Playwright 1.62.0, ESLint 10.8.0, Knip 6.29.0,
  React 19.2.8, Webpack 5.109.0, Size Limit 13.0.1, and updated package and
  Markdown validation tools. TypeScript remains on 6.0.3 because the current
  typed-lint toolchain does not support TypeScript 7.

### Fixed

- Shared buttons using `aria-disabled` no longer receive Emitter Cannon's local
  hover or active brightness filters.
- Package validation now accepts the npm 11 and npm 12 JSON report shapes, and
  Publint checks the built package metadata without launching a mismatched
  nested package manager. The separate npm 12 pack check remains authoritative
  for shipped file contents.
- The npm compatibility floor admits the npm 10.9.7 bootstrap used by
  setup-node and the official Signal K Plugin CI while repository-owned
  development and release jobs remain pinned to npm 12.0.1.
- Release auditing now accepts only the identified development-only
  `GHSA-mh99-v99m-4gvg` chain inherited from the latest canboatjs while
  continuing to require a clean runtime audit and rejecting every unknown
  package or advisory.

<a id="v1103"></a>

## [1.10.3] - 2026-07-22

### Added

- Canonical `environment.water.temperature` conversions now emit Sea
  Temperature on modern PGN 130316 and superseded PGN 130312, using NMEA 2000
  temperature instance 100 by default. Obsolete PGN 130310 remains available
  as a manual compatibility conversion.
- Dynamic engine, electrical, tank, and display mappings now expose their
  resolved Signal K paths to the panel and Config Advisor. Mapping controls
  suggest asset ids and paths from the server path inventory, visually separate
  Signal K input from NMEA 2000 output, distinguish asset discovery from
  required measurement availability, and provide automatic polling plus manual
  Refresh and Retry controls.
- Per-conversion status now distinguishes waiting for Signal K input,
  publisher-filter mismatch, blocked NMEA 2000 echo input, input that produced
  no encodable output, stale previously active input, overdue scheduled
  activity, and active emission. Factory conversions expose separate mapping
  rows with each input path and its last-seen age.

### Changed

- The Environmental preset now selects current PGN 130316 temperature
  conversions. PGN 130312 and obsolete PGN 130310 remain manually selectable
  for receivers that require them.
- Fixed-path editors now display the Signal K path as read-only and label the
  optional publisher selector as a `$source` filter. Publishers found in the
  server model, manual entry, filter mismatch warnings, and exact or dot-prefix
  matching use one consistent model across the panel, Config Advisor, and
  runtime. A publisher filter that repeats its own Signal K path is rejected
  before Save.
- The panel component budget is 40 kB Brotli to cover path discovery, shared
  mapping validation, per-row runtime health, and accessible issue navigation
  while retaining an enforced production size ceiling.
- Enabled mapping rows are validated before Save. Invalid identifiers,
  instances, tank paths, enum values, duplicate rows, and inconsistent engine
  instances are surfaced instead of being saved and silently ignored. Shared
  PGN identities and linked battery, solar, AC, charger, and inverter instances
  are checked across conversions.
- Config Advisor never auto-enables superseded or obsolete conversions. Legacy
  frames remain explicit compatibility choices.
- Publisher filters for mapped conversions now follow the mapping in a
  collapsed Advanced section, and horizontally scrollable mapping tables are
  labeled keyboard-focusable regions.

### Fixed

- Publisher ids ending in a numeric device segment, including
  `venus.com.victronenergy.temperature.24`, are no longer misclassified as
  NMEA 2000 sources. Origin classification now relies on authoritative source
  metadata when available, and unknown origins are handled conservatively.
- Stream conversions now reject input authoritatively identified as NMEA 2000,
  preventing off-bus-to-bus conversions from echoing received bus traffic.
- Timer ticks no longer count as Signal K input, unrelated synchronous and
  asynchronous empty delta output no longer counts as accepted input, and one
  healthy mapped asset no longer hides a failed sibling row.
- Publisher inventory failures are reported as unverified lookups with a Retry
  action instead of falsely claiming that the configured publisher does not
  exist.
- Validation messages now identify their mapping collection, so issue
  navigation and `aria-invalid` target the correct table in conversions with
  more than one mapping table.
- Config Advisor now tells operators to enable a legacy PGN only when the
  receiver requires that legacy frame, while naming the modern replacement as
  the preferred choice.
- App store screenshots now reflect the current 83-module panel catalog,
  including the dedicated Sea Temperature conversion. Screenshot generation is
  reproducible through `npm run screenshots`.

<a id="v1102"></a>

## [1.10.2] - 2026-07-22

### Fixed

- Mapped Signal K instance ids now accept safe hyphenated and underscored
  segments, restoring output from established provider paths such as the Venus
  plugin's `electrical.batteries.258-second.voltage`. Dots, slashes,
  whitespace, and full paths remain rejected, and the Battery mapping now
  explains that it expects only the instance id.

<a id="v1101"></a>

## [1.10.1] - 2026-07-21

### Added

- Environmental Parameters (PGN 130311) now combines outside temperature, outside relative humidity, and atmospheric pressure in one frame, with configurable temperature and humidity source types for Raymarine i70 and i70s compatibility.

### Changed

- PGN 130310 is identified by its standard name, Environmental Parameters (obsolete), instead of the narrower Sea Temperature label.
- The typed ESLint toolchain is refreshed to `typescript-eslint` 8.65.0, the latest release compatible with the project's TypeScript and Node baselines.

### Fixed

- Humidity conversions now reject Signal K relative-humidity ratios outside the canonical 0 to 1 range instead of emitting invalid percentages.

<a id="v1100"></a>

## [1.10.0] - 2026-07-20

### Added

- Configurable Vessel Trip Parameters (PGN 127496) aggregates selected fuel tanks and engine fuel rates to emit fuel remaining, time to empty, and distance to empty without inventing trip runtime.
- Distance Log (PGN 128275) now emits total and trip distance from the canonical Signal K navigation paths in SI meters.
- Vessel Speed Components (PGN 130578) now emits canonical longitudinal and transverse water-referenced speeds for compatible chartplotters and instruments.
- Time and Date (PGN 129033) now emits the canonical UTC Signal K GNSS time without inventing a local offset.
- Configurable AC input and output status (PGNs 127503 and 127504) maps single-phase or three-phase Signal K AC buses, configurable Charger Status (PGN 127507) maps unambiguous charger state and role values to a battery instance, and Inverter Status (PGN 127509) maps unambiguous inverter modes.
- Release verification now launches the production Module Federation panel in Chromium and exercises the new mapping editors, Light, Dark, and Night themes, and a 320-pixel viewport.

### Fixed

- AIS output now rejects partial, malformed, and out-of-range MMSIs, coordinates, speeds, rates, dimensions, and lookup identifiers. Remote Class B targets retain their class through PGNs 129039, 129809, and 129810. DSC appends the required trailing address digit and suppresses non-distress categories that canboatjs 3.20 cannot encode faithfully.
- Active-course PGNs 129283, 129284, 129301, and 129302 now consume the current v2 Course Provider deltas, preserve calculation state across notification-only updates, enforce Canboat ranges, and use mark-to-mark values for PGN 129302.
- Incomplete PGN 129285 and 130074 route broadcasts were removed. Their implementations did not provide a complete versioned route transaction or register the directed Route and WP Service exchange needed for reliable transfer; PGN 129284 continues to carry active next-waypoint navigation.
- The embedded conversion harness now fails when a conversion has no callback result instead of silently skipping that case.
- System Time (PGN 126992) now identifies its host-clock source as a local crystal clock instead of claiming unverified GPS discipline.
- Chartplotter documentation now treats support as model-specific, corrects the current Garmin battery-PGN claim, and labels Raymarine behavior as field-tested rather than universal.
- Fixed timestamps and event-driven conversions no longer offer or honor resend controls, preventing old GNSS time, AIS targets, and course calculations from being replayed as current data.

### Changed

- The configuration panel now uses `signalk-nearlcrews-ui` 0.3.0 for its shared theme root, theme and view controls, banners, buttons, and save action bar. Existing `skn-theme` preferences migrate into the shared theme contract, fresh profiles start in Light, and unsupported browsers receive an explicit native CSS `@scope` compatibility message.
- `markdownlint-cli2` and its resolved Markdown tooling were refreshed to their latest releases. TypeScript remains on the latest 6.0 release required by `typescript-eslint`, and Node types remain on the latest 24.x release matching the repository's supported Node baseline.
- Coverage floors now sit just below the verified project baseline, the panel component budget includes the new electrical mapping editors and resend metadata, the official Signal K reusable workflow is pinned to an immutable commit, and PGN 126464 documentation records the provider API limitation on directed ISO Request responses.

<a id="v191"></a>

## [1.9.1] - 2026-07-15

### Fixed

- The panel TypeScript project now includes the React panel sources it was intended to validate. The stricter pass fixed exact-optional-property handling, guarded indexed access, preserved optional engine fields correctly, and made mapping-row identities total.
- Periodic resend callbacks no longer pass an async function directly to `setInterval`, so rejected work cannot escape the plugin's error handling.
- Babel explicitly uses its production React transform, eliminating development-only `jsxDEV` calls from the shipped panel. The unused webpack `main.js` entry was also removed, so the package contains only the federation container and its on-demand chunks.
- Standalone panel builds now clean obsolete webpack output, and package validation rejects unexpected JavaScript entries under `public/`, preventing removed bundles from leaking into a later tarball.
- Plugin API routes now rely on the admin protection Signal K applies to registered `/plugins` routers, removing unsupported access to the server's internal `securityStrategy` object and its redundant authorization fallback.

### Changed

- The development baseline now follows Binnacle: Node 22.18, the latest compatible npm 11 release, TypeScript 6.0, Biome 2.5.4, typed ESLint, Markdown linting, spelling checks, dependency-cruiser boundaries, Knip dead-code checks, coverage, bundle budgets, publint, package-content validation, and repository-owned Git hooks.
- Direct dependencies are at their latest mutually compatible releases. Redundant transitive overrides, Husky, and lint-staged were removed; the lockfile resolves with no audit findings. Required CanboatJS, serialport, and esbuild install scripts are pinned to reviewed versions, while the unnecessary `es5-ext` postinstall is explicitly denied.
- The package-manager compatibility floor now admits the npm 10.9.8 bundled by Signal K's official Node 22 plugin-CI lanes, while local development and repository-owned CI remain pinned to npm 11.18.
- Runtime-neutral recommendation logic and types moved out of the server-side advisor directory into `src/recommendation/`, making the browser and server dependency boundary explicit.
- Shared panel styles are split into focused action, disclosure, feedback, form, and foundation modules behind a stable facade. Repeated input, checkbox, status-dot, table-cell, and disclosure dimensions now use semantic CSS tokens.
- CI and npm publication now run the same complete release gate on Node 24 with the current GitHub Actions pinned by commit. Publication packs a verified artifact first, then publishes it from a separate least-privilege job.
- Package metadata now declares CommonJS as the default `.js` interpretation and exports the `.mjs` plugin entry explicitly, preserving the classic federation container while giving Node an unambiguous ESM entry point.

<a id="v190"></a>

## [1.9.0] - 2026-07-14

### Fixed

- **Every emitted standard PGN now uses its Canboat 7.1.0 arbitration priority at the transport boundary.** Conversions previously defaulted most frames to priority 2, including lower-priority AIS, route, environmental, battery, engine-static, and PGN-list traffic. Proprietary PGNs without a defined priority keep the conversion-supplied value, and the SeaTalk Alarm variant of PGN 65288 uses its variant-specific priority 7.
- **Transmission Parameters (PGN 127493) now supplies its discrete status byte as an empty bit-lookup set.** This matches Canboat 7.1.0 while remaining wire-compatible with the current canboatjs decoder, which still reports the empty byte as numeric zero.
- NMEA 2000 envelope validation now rejects fractional or out-of-range CAN identifiers, PGNs above the 18-bit maximum, array-shaped field maps, and non-plain nested objects before emission.
- Status polling and conversion-catalog retries now cancel obsolete requests and serialize refreshes, so a slow older response cannot overwrite newer panel state. Polling also stops while the page is hidden.
- The panel now distinguishes loading, inactive, waiting, and ready output states, reports the real catalog total while inactive, and gives disabled or startup-failed plugins actionable guidance. First-run setup prompts now follow the current panel configuration instead of inactive runtime counters.
- A failed plugin start no longer hides the standalone conversion catalog needed to repair configuration in the panel.
- Re-applying an active preset or dispatching an unchanged config value no longer marks the panel dirty. The setup wizard now returns keyboard focus to the control that opened it.
- **Bearing between marks (PGN 129302) now wraps a negative true bearing into the unsigned 0 to 2pi field range** the same way the magnetic-bearing fallback and PGN 129284 already do, instead of writing the raw signed value onto an unsigned wire field.
- **AIS static and voyage data (PGN 129794) now drops non-finite length, beam, bow offset, and draft values** instead of writing NaN or Infinity onto the wire when a vessel publishes bad design data.
- **A notification whose upstream-supplied alertId changes no longer leaks the old id.** The old id's cached PGNs, emit tracker, and pool slot are released when the id changes, so a reused number cannot silently collide with the wrong alert.

### Changed

- All dependencies refreshed to current, including Babel 8 and TypeScript 7. The directly imported `@canboat/ts-pgns` test database is now declared explicitly, three unused development packages were removed, `npm outdated` is empty, and both full and runtime audits stay clean. Babel 8 requires Node 22.18 or newer within the 22.x line, or Node 24.11+, for development; the built plugin retains its Node 22.12 runtime floor.
- Panel theme tokens now live in a dedicated module, repeated control dimensions and interaction values use semantic CSS tokens, advisor, conversion, status, toolbar, and wizard styles have cohesive modules, responsive table styles are shared, and the battery and engine instance editors share one mapping primitive. Five obsolete card-style entries were removed with the old UI remnants.
- Lightweight configuration defaults no longer import the server-only TypeBox schema into the browser graph, reducing the panel entry bundle from 64.9 KiB to 15.4 KiB.
- Internal-only exports identified by static analysis are private to their modules now.
- Maintenance documentation now identifies the current supported release line and accurately describes the Canboat packages as test-only dependencies.

<a id="v182"></a>

## [1.8.2] - 2026-06-27

### Added

- **The Config Advisor now also flags a pinned source that has gone completely silent.** The 1.8.0 check caught a conversion whose path had moved to a different live source. This release adds the case where the pinned source stops publishing entirely and nothing replaces it: when QuestDB history shows the path was active within the look-back window, a review surfaces a lower-confidence "Fix source" recommendation, so you can clear the dead pin and let the conversion follow whatever source returns. The check needs QuestDB history, so it makes no claim when history is unavailable, which keeps a momentarily idle sensor from being reported as stale. Like the other source fixes, it always waits for your approval.

### Changed

- The "Works well with" list now points to signalk-synthetic-values, whose sensor fusion feeds the emitter clean Signal K paths to convert, and drops signalk-openrouter-companion, which no longer shares a data path with this plugin.

<a id="v181"></a>

## [1.8.1] - 2026-06-27

### Added

- **Per-conversion NMEA 2000 source type and instance on the temperature and humidity conversions.** Each temperature (PGN 130312 and 130316) and humidity (PGN 130313) conversion now carries a source-type dropdown and an instance field in its editor, so you can relabel a sensor's source or place it on a chosen instance. This lets several inside sensors appear on a display that only renders one source type and tells them apart by instance.
- **A one-click "Raymarine" preset.** It enables the inside-family temperatures (inside, main cabin, refrigerator, freezer, and engine room) and inside humidity, and remaps them all onto the "Inside" source at distinct instances 0 to 4, with humidity paired to instance 0. Raymarine Axiom and i70 displays render only the "Inside Temperature" source and separate multiple sensors by instance, so without this remap those sensors never appear on a Raymarine MFD. The dedicated source labels still work on displays that read them (Garmin, Victron, Maretron).
- **`WIND_WEATHER_TRUE` conversion** emits the forecast wind as a boat-referenced true wind on PGN 130306 (reference `True (boat referenced)`), so a chartplotter that fills its True Wind Speed and Angle from that reference (Garmin in particular) has a true wind to display. It computes the true wind angle as `environment.wind.directionTrue` minus `navigation.headingTrue` and carries `environment.wind.speedOverGround` as the speed. Like `WIND_WEATHER_APPARENT` it is opt-in, intended for a vessel with no masthead anemometer, and needs a true heading on the bus to produce an angle. `WIND_TRUE_GROUND` still carries the same wind as a ground-referenced wind keyed to North.

### Fixed

- **The temperature instance setting now takes effect.** The per-conversion temperature instance configured in the panel was read from the wrong option shape at runtime and silently ignored, so every temperature emitted on its default instance no matter what you set. It is applied now. A hand-typed instance is clamped to the encodable 0 to 252 range so it cannot wrap into the reserved or not-available values on the wire.

<a id="v180"></a>

## [1.8.0] - 2026-06-23

### Added

- The Config Advisor now flags an enabled conversion whose pinned `$source` no longer publishes its path, the silent failure that happens when a weather provider is renamed (for example `open-meteo` becoming `vws-merged`) or an NMEA 2000 sensor re-enumerates its address. Such a conversion stays enabled but emits nothing, with no error. A review now surfaces it as a "Fix source" recommendation that clears the stale pin so the conversion follows whatever source is actually publishing the path. Like disables, these fixes always wait for your approval and are never applied automatically.
- **Per-category Enable all and Disable all controls** sit in each category section header, so you can turn on or off every conversion in a category in one action. They appear in the tab view, not on search results.

### Changed

- **Conversions now render as dense one-line rows instead of tall cards, so a category fits in roughly one screen where it used to take about four.** Each row shows an enable checkbox, the title and PGN run, an error glyph, and the emit recency, with a 3px left status rail that reads solid when the conversion is emitting and dashed when it is enabled but silent.
- **Editing is now a single-open inline accordion.** Clicking a row expands its editor (resend interval, source fields, extras editors, and the purpose, note, and compatibility prose) full width below the row, and opening another row closes the previous one.
- **A compact sticky toolbar replaces the old control bar and status dashboard.** It carries the catalog search, a condensed status chip (the enabled-over-total count, a readiness word, a stale-poll marker, and a jump-to-error button), the Configure and Status toggle, the theme toggle, and the Setup wizard shortcut, and it stays pinned to the top as you scroll.
- **Quick presets, the Config Advisor, and Global settings collapse into three one-line sections below the toolbar**, so the catalog leads and the optional pieces stay out of the way until you open them.
- **The Config Advisor applies a recommendation as soon as you Approve it.** Approving an enable, a disable, or a source fix applies it immediately and removes it from the list, and rejecting dismisses it. The separate two-step Apply is gone.

### Removed

- The Config Advisor's optional OpenRouter integration was removed, along with its settings (the API key, model, and per-day call cap) and the `/api/advisor/test-key` and `/api/advisor/models` endpoints. The recommendation logic was always rule-based and deterministic; OpenRouter only rewrote each explanation in plainer language and never changed what was recommended, so its removal changes no recommendations. An `advisor.openRouter` block left in a saved configuration, including any stored API key, is dropped on load.

<a id="v173"></a>

## [1.7.3] - 2026-06-22

**A bug fix: the admin config panel now loads the full conversion catalog before the plugin is enabled, so a freshly installed plugin no longer shows every category at zero with nothing to configure. No breaking changes.**

On a plugin that had not been enabled yet, the config panel showed all eight conversion categories with a `(0)` count and offered nothing to turn on. signalk-server mounts a plugin's API routes as soon as it loads but only calls the plugin's `start()` once it is enabled, so the panel's `/api/conversions` endpoint had no running plugin manager to read from and returned an empty catalog until the first enable, which is the one moment the catalog is needed to choose conversions to save. The catalog is pure module metadata with no runtime state, so it is now built from a manager-independent source: the conversion-to-metadata mapping moved into a shared `buildConversionMetadata()` helper, and a single catalog provider feeds both the API router and the Config Advisor, returning the running plugin manager's catalog when started and a standalone copy built once otherwise. A freshly installed plugin now shows all 75 conversions across their categories so they can be configured and the configuration saved to enable the plugin. The suite grew from 141 to 142 tests, covering the disabled-plugin catalog path.

<a id="v172"></a>

## [1.7.2] - 2026-06-21

**A maintenance release: internal code consolidation that leaves the emitted PGNs unchanged, two small admin-panel and wire-format fixes, refreshed dependencies, and a bolder app-store icon. No breaking changes.**

Two fixes lead the release. The tank-mapping and Raymarine brightness-group mapping editors could drop a text cell from controlled to uncontrolled when a saved row was missing its value, producing a React warning; both now render through a shared text-column helper that keeps the field controlled. PGN 129041 (Aid to Navigation) now clamps `atonType` to the 0 to 31 range of its 5-bit field, so an out-of-range value from an upstream provider can no longer wrap on the wire.

The rest is non-behavioral cleanup with no change to the emitted PGNs. Duplicated logic was consolidated into single sources of truth: a numeric coercion that omits a field rather than nulling it (`toFiniteOrUndefined`), the `[N]` sub-conversion key builder (`subIndexKey`), one abort-timeout wrapper shared by the OpenRouter and QuestDB clients, and the OpenRouter default-model id. The plugin manager's start path was split into smaller focused methods (`buildPluginOptions`, `wireConversion`) and its single-entry output-dispatch table collapsed to a direct call; several hand-rolled object guards were replaced with the shared `isPlainObject`; and the admin panel's repeated small-text and error-badge styles, its mapping-table text columns, and its per-section enabled and error tallies were hoisted into shared utilities. Dependencies were refreshed to their latest compatible versions (Biome 2.5, @signalk/server-api 2.28, the Vitest 4.1.9 toolchain, esbuild, sharp, and lint-staged), the unused signalk-server devDependency was dropped, and the runtime audit stays clean. The plugin icon badge was redrawn bolder so the radiating-arcs transmit glyph reads better at app-store thumbnail size, with the deep-ocean gradient and three wave lines unchanged and every PNG size regenerated from the updated SVG. The suite stays at 141 tests, green.

<a id="v171"></a>

## [1.7.1] - 2026-06-10

**Two wire-correctness fixes lead this patch release: route PGNs no longer overflow the fast-packet transport, and unsigned angle fields are normalized before encoding. The Config Advisor's apply path is hardened, and the admin config panel gets a ground-up UX overhaul. No breaking changes.**

The route PGNs 129285 (Navigation Route/WP Information) and 130074 (Route and WP Service, WP List) sized their waypoint caps against the canboatjs 500-byte encode buffer, but the NMEA 2000 fast-packet transport maxes out at 223 bytes; a 16-waypoint list encoded to 458 bytes, the frame-0 length byte wrapped, and the MFD silently dropped or garbled the route. A shared `packWaypointsToBudget()` now trims the waypoint list against the real per-PGN header and each name's actual encoded length, so every emitted frame stays transmittable. Seven modules (heading, true heading, COG and SOG, set and drift, navigation data, direction data, and the extended AIS reports) passed Signal K angles straight into unsigned fields, where the encoder wraps a negative by the uint16 modulus instead of 2 pi, so a heading of -0.001 rad went on the wire as roughly 15 degrees; every unsigned angle field now runs through `normalizeAngle()`. TRUE_HEADING left the basic-nav preset (it stays available) because two PGN 127250 frames from one source that differ only in reference make naive consumers flicker by the magnetic variation; the canonical default is Magnetic 127250 plus the 127258 variation PGN. Raymarine pilot alarms (Pilot Watch, Pilot Off Course, and Pilot Wind Shift) now carry the Autopilot alarm group instead of Instrument. Smaller wire fixes: a negative (astern) speed through water is dropped before the unsigned PGN 128259 field, an unconfigured depth transducer offset is emitted as not-available instead of asserting 0, PGN 126992 declares its time source as GPS, and an out-of-enum Raymarine brightness group label can no longer encode a corrupt byte. The Config Advisor's apply path is hardened on both layers: the HTTP route rejects malformed decision payloads with 400 and `applyReview` allow-lists option keys against the loaded conversions, so an arbitrary key can no longer be persisted to the saved config; on servers without `addAdminMiddleware` the mutating advisor routes now fail closed with 403 while the read-only endpoints keep the old-server compat fallback. The advisor also reads its schedule through the same config migration as everything else (a nested legacy envelope no longer silently disables periodic reviews), parked decisions from a scheduled review now load when the panel opens instead of only after a manual review, a review with no actionable recommendations no longer consumes a day's OpenRouter budget, and unknown-model responses fail fast instead of retrying. A notification alert id supplied by an upstream provider is now registered in the allocator so a later auto-allocated alert cannot collide with it. The config migration backfills partially-saved legacy entries, fixing a panel crash on configs written before sources and extras became required. Setting the global resend interval to 0 now genuinely disables global resend (it was silently coerced back to 5 seconds) and the panel documents it. Tooling: the `prepack` lifecycle script is gone (the publish workflow builds explicitly), dev dependencies were refreshed with `npm outdated` now empty, and the runtime audit stays clean.

The admin config panel got a ground-up UX overhaul. Marine ergonomics: touch targets grew to 36 px or more (this panel gets used with wet fingers at the helm), faint text now meets WCAG AA contrast in every theme, and a new theme toggle adds a red-preserving Night mode alongside Auto, Light, and Dark. Trust and data safety: the Save bar is sticky so the unsaved-changes indicator is always visible, a `beforeunload` guard protects unsaved edits, and config saves are now conflict-safe: when the advisor or a scheduled review rewrites the saved config while the panel holds edits, a three-way merge adopts the external changes for untouched keys and keeps the user's edits on conflict, so neither side silently clobbers the other. Findability: a catalog search filters all 75 conversions by title, PGN number, or Signal K path, category tabs show per-tab error counts, the dashboard error badge jumps straight to the offending card, and expanded cards now show their last error, compatibility notes, and emit recency ("42 emits, last 2 s ago") inline instead of in hover tooltips a touchscreen never sees. New capabilities: a first-run setup wizard proposes conversions backed by the boat's live data using the advisor's own recommender, a Status view renders a live emit table for post-setup monitoring, advisor recommendations apply only the decisions the user actually made (undecided items are no longer silently rejected), the OpenRouter key and QuestDB connection got working Test buttons, and API errors surface the server's explanation instead of a bare HTTP status. Follow-up polish: pinned Dark and Night themes now paint the whole panel surface and native widgets (`color-scheme`), buttons gained hover and pressed states, the advisor section leads with Review now and folds its integrations into a collapsed settings disclosure, advisor results show conversion titles instead of raw config keys, the setup wizard stays reachable from the control bar after first run, card headers shed badge clutter and became fully tappable, mapping tables flex to phone widths, and the type and spacing scales were snapped to tokens; a closing cleanup consolidated the caret-disclosure rows into one shared component and moved table-cell input sizing into the stylesheet. The panel work finished with helpers deduplicated into single sources of truth, dead props and derived state removed, and the hot paths kept allocation-free. The test suite grew from 118 to 141 tests, adding coverage for the event-driven NMEA 2000 readiness flip, the error-throttle window, the config three-way merge, and every fix above.

<a id="v170"></a>

## [1.7.0] - 2026-05-30

**Three wire-correctness fixes, all previously masked by dead or missing tests, plus a non-behavioral cleanup across the whole codebase. One behavior change: AIS no longer periodically re-emits.**

The correctness fixes: NMEA 2000 readiness could latch false forever when the plugin was enabled or installed after the one-shot `nmea2000OutAvailable` event had already fired, silently dropping every PGN; readiness is now also seeded from the registration-time `app.isNmea2000OutAvailable` snapshot, not only the latched event. PGN 129041 (Aid to Navigation) emitted `positionReferenceFromTrueNorthFacingEdge` at ten times the correct distance, so a 9 m offset went on the wire as 90 m; the field is now passed in SI metres like its sibling geometry fields. PGN 126720 (Raymarine display brightness) emitted a field set that matched no canboat variant, so the frame was undecodable and a real Raymarine MFD ignored it; it now uses the SeaTalk1 Display Brightness variant. The AIS conversion, the only on-delta module, no longer arms a resend timer: re-broadcasting one stale target on a timer could make a dead AIS contact look live on an MFD, so AIS stays purely event-driven. The rest is non-behavioral cleanup: dead code removed (the `JSONSchema` type, `STATIC_DATA_TIMEOUT_MS`, `ExponentialSmoother.clearKey`, and the advisor `origin` "none" member); shared helpers extracted to cut duplication (`instanceList` for per-instance option arrays with a uniform `Array.isArray` guard so a malformed config can no longer crash a conversion, `markTypeFor` and `toWaypointEntry` for the route PGNs, `starboardOffset` and `AisShipType` shared between the AIS modules, `stripSubIndex` in the plugin manager, the wind builder moved to its own `windData.ts`, and a shared `extraRows` accessor plus a memoized `ConversionCard` in the admin panel); the `ENGINE_PARAMETERS` title no longer advertises PGN 130312 (which only its sibling `EXHAUST_TEMPERATURE` emits); the admin panel's source field no longer drops keyboard focus mid-edit, and its duplicate Save control was removed; the advisor now prunes applied recommendations from its pending list, enriches only actionable recommendations, and surfaces periodic-review failures instead of swallowing them. The test suite grew from 113 to 118 with new readiness, smoothing-math, and AtoN and brightness round-trip coverage.

<a id="v168"></a>

## [1.6.8] - 2026-05-29

**Maintenance release: dependencies refreshed to current (including canboat 3.20), the emitted PGNs aligned with canboat 3.20 and enriched with several Garmin-relevant fields, and a fix for a load-time failure an ESM-bundling regression could trigger. No breaking changes.**

The load fix: the notification conversion imported a value (`hasValues`) from `@signalk/server-api`, which forced esbuild to bundle the entire package; under `@signalk/server-api` 2.25.0 that bundle reached a dynamic `require("events")` that throws on load ("Dynamic require of events is not supported"). The plugin now keeps `@signalk/server-api` a type-only import behind a local guard, so the package is no longer bundled: the runtime bundle dropped from about 510 KB to about 350 KB, and `@signalk/server-api` moved to devDependencies since it is compile-time only. Dependencies were refreshed (canboatjs 3.18 to 3.20, plus `@signalk/server-api`, Biome, Babel, and webpack). Reviewed against canboat 3.20's definitions, two AIS fields that had been emitting reserved-sentinel defaults are now set correctly (PGN 129038 `specialManeuverIndicator` is "Not available" and PGN 129794 `repeatIndicator` is "Initial"), and five Garmin-relevant fields the plugin already had data for are now emitted: PGN 129794 `imoNumber` (from `registrations.imo`), PGN 129029 `pdop` (from `navigation.gnss.positionDilution`), PGN 127506 `remainingCapacity` (from `capacity.remaining`), PGN 129041 `aisTransceiverInformation`, and a SID on PGNs 130313 and 130314. A correctness fix: the PGN 127505 tank instance is a 4-bit field (0 to 13), and an out-of-range mapping silently wrapped onto a different gauge (for example 20 became 4); the encoder now clamps it and the admin panel caps the input at 13. A cleanup added a shared `clamp()` helper that replaces four hand-rolled clamps, co-located `parseImo` beside `parseMmsi`, and removed dead code. Git hooks no longer auto-install on `npm install` (the husky `prepare` lifecycle broke the app-store install simulation on Node 22's npm 10); run `npm run hooks` once after cloning. The test suite remains 113 tests across 13 files.

<a id="v167"></a>

## [1.6.7] - 2026-05-29

**Maintenance release: a richer Signal K app store listing, an official cross-platform plugin CI workflow, and an internal code-simplification pass. No on-the-wire output changes.**

The Signal K app store page now shows screenshots and a "Works well with" section. `package.json` declares `signalk.screenshots` with three admin-panel captures (the conversion config panel, the Environment category, and the Config Advisor) shipped in the npm tarball, and `signalk.recommends` lists the companion plugins it pairs with: [`signalk-virtual-weather-sensors`](https://github.com/NearlCrews/signalk-virtual-weather-sensors), the source of the `environment.*` forecast paths this plugin puts on the bus, and [`signalk-openrouter-companion`](https://github.com/NearlCrews/signalk-openrouter-companion). A new `.github/workflows/plugin-ci.yml` calls the official SignalK reusable plugin-ci workflow, exercising install, build, and the full test suite on Linux x64, Linux arm64, macOS, and Windows across Node 22 and 24; the build's `clean` step was rewritten as a small Node script so it runs on Windows runners instead of a unix-only `rm`. An internal cleanup tidied the code without changing behavior: it removed the dead exported types `OutputType` and `AdvisorConfigType` and two unused `errorBuckets` fields, added a shared `emptyConversionConfig()` factory used by the admin panel and the advisor, extracted a NaN-safe `starboardOffset()` helper so the AIS static-data and AtoN paths share one guard, routed the advisor and OpenRouter client error handling through the shared `errMessage()` helper, and corrected two import paths missing their `.js` extension. The test suite remains 113 tests across 13 files.

<a id="v166"></a>

## [1.6.6] - 2026-05-24

**Bug-fix release: hardening clamps on two more PGNs, a non-string-safe `clampString`, stricter advisor response types, dead-code removal, and refreshed internal docs. No on-the-wire output changes for healthy inputs.**

This release fixes defects in the plugin core, the conversions, the panel, the advisor, the tests, and the docs that v1.6.5 did not reach. Two more PGNs gained `clampString` guards against the canboatjs 500-byte buffer overflow that signalk-server re-raises as an uncatchable process crash: PGN 129041 `atonName` (clamped to 18 chars, matching canboatjs's hardcoded per-field cap for this STRING_LAU) and PGN 127498 `vin` / `softwareId` (clamped to 17 chars per SAE J1939 / ISO 3779 and 32 chars per project convention; canboat itself declares both fields as length-prefixed with no cap). Each clamp is paired with a regression test that drives an over-long input through the encoder; the engine-static oracle uses an independent `.slice` truncation rather than calling `clampString` itself, so a regression in `clampString` shows up as a test failure instead of slipping through both producer and expected in lockstep. `clampString` itself is now hardened against non-string input: a Signal K provider that publishes a number or object where a name is expected returns `undefined` instead of crashing at `.slice`. The plugin's `getModuleVersion` hook was removed: signalk-server's plugin loader reads the version directly from `package.json` and never calls this method, and the upstream `@signalk/server-api` `Plugin` type does not declare it. `isConversionOptions` is now correctly typed against the call site (`ConversionOptions | undefined` rather than the dead `| number` branch left over from a previous wire shape). The admin-panel HTTP router now types every advisor response body through dedicated interfaces, with `AdvisorPendingResponse` separated from `AdvisorReviewResponse` so the synthetic pending payload omits `ranAt` rather than carrying an empty string the panel would mis-parse, and the QuestDB / test-key / models response types track the `Advisor` class via `Awaited<ReturnType<...>>` so they cannot drift. The panel's `useAdvisor` and `useOpenRouterModels` hooks now use the same response types as the router. Documentation drift was cleaned up: the CLAUDE.md "Notification PGNs" section now describes the actual `emitTracker` + per-entry-digest rate-limited emit gate (the prior text described a removed `cachedFlat` array) and calls out the gate's allocation profile, the engineStatic.ts inline comment now correctly identifies PGN 127498's `vin` / `softwareId` as STRING_LAU rather than STRING_FIX, the troubleshooting doc picked up an Oxford comma, and the dead `signalk: { on: () => {} }` field was removed from every test mock that carried it. The test suite remains 113 tests across 13 files.

<a id="v165"></a>

## [1.6.5] - 2026-05-21

**Bug-fix release: the admin config panel works again on Signal K servers older than 2.27.0, plus a batch of correctness and PGN-alignment fixes.**

Since v1.5.4 the configuration panel shipped as an ESM Module Federation remote, which only the Signal K admin UI bundled with signalk-server 2.27.0 and newer can load; every older server showed a bare "Error loading component" with no settings page while the conversions still ran. The panel is now built as a classic container that loads on every signalk-server 2.x. Further defects are fixed: PGN 129284 kept its perpendicular-crossed and arrival-circle flags raised for up to a minute after a notification cleared; the NMEA 2000 emit path logged errors without the per-key throttle, so one bad PGN could flood the server log; and the Config Advisor consumed its OpenRouter daily budget on failed calls, sent its apply request without session credentials, and never retried a failed model-list fetch. Two conversions mis-encoded PGNs because they used enum strings absent from the canboat lookup tables: a "fault" transmission gear (PGN 127493) and several DSC call formats (PGN 129808). In the admin panel, expanding a disabled conversion card now shows its options so a source or resend can be set before enabling. The dev toolchain was updated to current releases; the test suite remains 113 tests across 13 files.

<a id="v164"></a>

## [1.6.4] - 2026-05-19

**Bug-fix release: thirteen code and logic bugs fixed across conversions, lifecycle, the advisor, and the panel.**

Two affected data on the wire. Water Depth (PGN 128267) encoded its transducer `offset` with the sign inverted on both the surface and keel branches, so a chartplotter computed depth below the surface or keel from the wrong datum. The Raymarine alarms conversion crashed its callback on a cleared notification (Signal K sends `value: null`), so those alarms never cleared and the failure flooded the log. The plugin lifecycle had two leaks: the delta input handler was re-registered on every restart with no way to unregister it, pinning every retired manager in memory, and a resend timer armed by an in-flight `processOutput` could survive a concurrent `stop()`. A nested config carrying an `ENGINE_STATIC` entry with no `extras` threw during migration and stopped the plugin from starting. The remaining fixes harden the Config Advisor (model-list fetch timeout, NaN review interval, QuestDB lookback validation, accurate recommendation text) and the admin panel: it now adopts a config the advisor wrote server-side, keeps a stale `$source` value selectable, and clears stale Approve/Reject choices between reviews. The GNSS satellites PGN now reports a satellite count that always matches the list it emits.

<a id="v163"></a>

## [1.6.3] - 2026-05-16

**Bug fix: the Config Advisor no longer wipes settings when the saved config is nested.**

A historical save bug could wrap the plugin's saved options under repeated `configuration` keys. The admin panel already flattened that nesting on load, but the Config Advisor's own config read unwrapped only a single `.configuration` layer. On a config nested deeper than one level the advisor saw no `conversions`, so the recommender rebuilt the config from scratch, dropping every factory-module conversion that has no static path keys (Battery, Notifications, Engine, Tanks, Solar) along with all per-conversion source filters. The advisor now flattens the envelope through the same migration the panel uses, so it reads the real config regardless of nesting depth. Test suite is now 114 tests across 13 files.

<a id="v162"></a>

## [1.6.2] - 2026-05-16

**Bug fix: a disabled button now visibly greys out.**

The admin panel's buttons set their background as an inline style, which outranks the browser's default disabled appearance, so a button disabled because there was nothing to do (Save with no unsaved changes, Discard, "Review now" while a review runs) still rendered fully colored. Disabled buttons now grey out with a not-allowed cursor. The Save controls give clear feedback as a result: the button is visibly inert when there is nothing to save, and visibly changes state right after a save.

<a id="v161"></a>

## [1.6.1] - 2026-05-16

**The admin panel now supports the Signal K admin's dark theme.**

The configuration panel previously hardcoded light-mode colors, so it rendered unreadable when the Signal K admin UI was in dark mode. Every color is now a `--skn-*` design token with explicit light and dark values, deliberately not derived from the host's page-background variable. The category tabs also became a proper keyboard-navigable WAI-ARIA tablist.

**Bug fix: a config file with nested `configuration` envelopes no longer strands settings.**

A historical save bug could wrap the saved options under repeated `configuration` keys, burying top-level settings such as the global resend interval so the panel showed a default instead of the saved value. Config load now flattens any envelope nesting, recovering the real values, and the panel writes a clean flat config on the next save.

**The PGN list is now organized into collapsible sections.**

Each category tab splits its conversions into a Modern and a Legacy section. The Modern section is expanded by default and Legacy collapsed; an empty section is hidden. Every conversion card is itself collapsible, collapsed by default even when enabled, so the list stays scannable: a collapsed card shows its enable checkbox, title, PGN, compatibility and Legacy badges, and live status, and expands to reveal the resend, source, and extras settings.

**The Config Advisor gained an auto-apply toggle.**

A new "Apply recommended enables automatically" setting controls review behavior. With it on (the default) a review enables recommended conversions immediately; with it off, those enables wait for approval alongside disables. The advisor's Save button moved to the bottom of the panel with explicit save feedback, auto-applied recommendations now show their explanation as visible text rather than only a tooltip, and the OpenRouter help text was corrected to state that the recommendation logic is rule-based and OpenRouter only rewrites explanations. Test suite is now 113 tests across 13 files.

<a id="v160"></a>

## [1.6.0] - 2026-05-16

**New feature: the Config Advisor.**

A new optional subsystem (`src/advisor/`) reviews the Signal K paths the vessel publishes and recommends which conversions to enable, so an operator no longer has to know which Signal K path maps to which PGN. It is dormant unless turned on and adds no work to the emit hot path.

A deterministic recommender matches observed paths to conversions by each module's declared `keys`. Source-based bus detection skips a path whose `$source` is already an NMEA 2000 device, so the advisor never recommends a conversion that would echo bus data back onto the bus. The trust model is hybrid: a confident enable is auto-applied, while anything that disables a conversion is parked for explicit approval in the panel.

Optional inputs extend the review. With QuestDB enabled, the advisor queries history (the `signalk`, `signalk_str`, and `signalk_position` tables) so paths that are not live right now are still considered, within a configurable look-back window. With an OpenRouter API key, each recommendation's explanation is rewritten into plain language via a strict JSON-schema structured-output call, bounded by a per-day budget; the recommender still owns which conversions are recommended. Every optional path degrades safely: a disabled or unreachable QuestDB, or any OpenRouter failure (no key, quota, network error, malformed response), falls back to the deterministic result plus a non-fatal note.

A new collapsible "Config Advisor" panel section carries a settings sub-panel (master toggle, OpenRouter, QuestDB, scheduled review, every control with inline help), a "Review now" button, and the review result with per-item Approve/Reject. An optional periodic scheduler re-runs the review on a configurable interval. New admin-gated endpoints: `POST /api/advisor/review`, `POST /api/advisor/apply`, `GET /api/advisor/pending`, `GET /api/advisor/questdb-test`, `POST /api/advisor/test-key`.

The whole feature is zero-new-dependency (the QuestDB and OpenRouter clients use the Node 22 global `fetch`). The design spec and four phase plans live under `docs/superpowers/`.

**New conversion: `WIND_WEATHER_APPARENT` (PGN 130306).**

An opt-in conversion bridges the synthetic apparent wind that `signalk-virtual-weather-sensors` publishes on its producer namespace (`environment.weather.windSpeedApparent` / `windAngleApparent`). That plugin deliberately keeps this value off the canonical `environment.wind.*` leaves a real anemometer owns, so the conversion is disabled by default and carries a warning; enable it only on a vessel with no real masthead anemometer. The advisor's OpenRouter model field also gained autocomplete sourced from the OpenRouter `/models` endpoint. Test suite is now 108 tests across 13 files.

<a id="v157"></a>

## [1.5.7] - 2026-05-16

**Bug fix: an over-long notification message no longer crashes signalk-server.**

A Signal K notification with a long `message` (for example a multi-sentence analyzer report) was placed verbatim into PGN 126985's text field. canboatjs encodes every PGN into a fixed 500-byte buffer and throws if a field writes past it, and signalk-server re-raises that throw as an uncatchable process-level exception, so a single over-long alert could take the whole server down on every 1 Hz rebroadcast. Alert text is now clamped, and the AIS (PGN 129794, 129040) and route (PGN 129285, 130074) string fields are clamped the same way so no relayed value can overflow the encoder.

**Bug fix: `nominal` notifications are no longer emitted as alarms.**

`nominal` is a valid Signal K notification state meaning "no alert", but it was unhandled: the notification conversion emitted it as a "Caution" alert and the Raymarine alarm conversion (PGN 65288) encoded it as an active alarm condition. Both now treat `nominal` like `normal`, clearing the alert and emitting no PGN.

<a id="v156"></a>

## [1.5.6] - 2026-05-15

**Brand: "NMEA 2000" is now spelled with a space everywhere.**

The plugin display name, description, README, and contributor docs used the no-space "NMEA2000" form in user-facing text. Every such string is now "NMEA 2000" to match NMEA's own branding. The npm package id (`signalk-nmea2000-emitter-cannon`) and the Signal K event identifiers (`nmea2000OutAvailable`, `nmea2000JsonOut`) are unchanged: those are protocol and identifier strings, not display text.

**Admin panel: "Legacy" badge on superseded-PGN conversions.**

A conversion whose PGN has a more modern replacement now carries a "Legacy" badge with a hover note naming the modern PGN. This covers PGN 130310 (Sea Temperature) and PGN 130311 (Environmental Parameters), both flagged obsolete in the NMEA 2000 spec, and PGN 130312 (Temperature), superseded by the extended-range PGN 130316. The badge is informational: a legacy PGN often stays enabled for older MFDs that read only the old frame.

**Admin panel: per-PGN hover tooltips.**

Each PGN number in a conversion card's title is now individually hoverable and shows a one-line plain-language summary of what that message carries, verified against canboat's PGN definitions. A build-time test guards against a conversion introducing a PGN with no summary. Test count is now 57.

<a id="v155"></a>

## [1.5.5] - 2026-05-15

**Bug fix: PGN 126464 (Transmit/Receive PGN List) is now actually delivered.**

The previous version triggered the conversion off `keys: ["communication.pgnListRequest"]`, a non-canonical Signal K path that no provider emits. The conversion was effectively dormant: Garmin's "Device Information" panel saw no transmit-list advertisement from the plugin, falling back to PGN-by-PGN passive discovery (which only populates as live data flows). Switched to a `sourceType: "timer"` with a 300 s interval. The first emission goes out within 5 minutes of plugin start, and ISO Request (PGN 59904) solicitations from chartplotters during address claim are handled by canboatjs's `N2kDevice` against its own internal PGN table.

**Bug fix: PGN 126993 (Heartbeat) added to the advertised transmit list.**

canboatjs's `N2kDevice` (>= 2.5) auto-emits PGN 126993 at the spec-recommended ~60 s nominal interval, but the plugin's hardcoded `TRANSMIT_PGNS` constant never listed it. Garmin chartplotters cross-check 126464 against received traffic and age devices out of their Network panel after about 30 s when no heartbeat is declared. This was the most likely cause of the "device shows briefly then disappears" failure pattern on Garmin installs (issue surface area: canboat/canboatjs#157).

**Refactor: PGN 126464 transmit list is now derived at module load from every conversion's title.**

Previously a hand-maintained 54-entry `TRANSMIT_PGNS` constant in `src/conversions/pgnList.ts`. Adding a new conversion required a second edit to keep the advertised list in sync, and the list silently drifted: PGNs 130316 (TEMPERATURE2_*) and 127497 (engine trip parameters, added in this release) were emitted on the wire but never declared. The list is now derived in `createConversionModules` by walking each module's `title` field through `extractPgnsFromTitle` (hoisted to a new `src/utils/pgnUtils.ts` so the registry and the plugin-manager can share it). Bus-layer PGNs that no conversion module owns are kept in a small `ALWAYS_TX_PGNS` constant inside `pgnList.ts` and unioned with the derived set: 59392 / 59904 / 60928 (ISO transport), 126464 (this conversion's own PGN, which the walk cannot self-advertise), 126993 (Heartbeat), 126996 (Product Information, canboatjs auto-emit).

The on-wire receive list expands from `[59904, 126464]` to `[59904, 60928, 126208, 126464]`. canboatjs already handles 60928 (ISO Address Claim) and 126208 (Group Function) at the transport layer; declaring them in the receive list closes a cosmetic gap on Garmin's "device receives" panel.

**Refactor: `productInfo.ts` conversion removed.**

The module emitted a competing PGN 126996 with a non-matching serial number against canboatjs's own auto-emit, causing last-write-wins flapping on Garmin's device-info panel. canboatjs's `N2kDevice` emits PGN 126996 on every address claim and in response to every ISO request for product information, so the plugin-side module was redundant by design (verified at `node_modules/@canboat/canboatjs/dist/n2kDevice.js` lines 31, 94, 202, 237, 400). The `PRODUCT_INFO` `optionKey` is now unknown to the registry; saved `PRODUCT_INFO: { enabled: true }` entries in user configs load as a no-op (the typed config schema accepts arbitrary `Record<string, ConversionConfig>` keys and `plugin-manager.start()` simply skips keys with no matching module).

**New conversion: PGN 127497 (Trip Parameters, Engine).**

`src/conversions/engineTrip.ts` emits per-engine trip fuel used and trip fuel rate. It is a per-engine sub-conversion factory keyed off `propulsion.*.fuel.*`, matching the identity model used by Engine Parameters and Engine Static, so all three engine PGNs pair correctly by instance on an MFD.

**Refactor: PGN 127498 (Engine Configuration / Static) is now per-engine.**

`engineStatic.ts` was a single-instance module; it is now a per-engine sub-conversion factory consistent with Engine Parameters and Engine Trip. Rated engine speed, VIN, and software version are entered per engine in the plugin config (Signal K has no canonical source for them). A v1.5.4 to v1.5.5 config migration normalizes the old single-instance `engineStaticMapping` shape into the per-engine `engines` array.

**Bug fix: range validation on GPS position and depth.**

`gps.ts` now rejects latitude outside +/-90 and longitude outside +/-180; `depth.ts` rejects negative below-transducer depth. An out-of-range value is dropped rather than encoded into a PGN that an MFD would render as a glitch position or depth.

**Change: magnetic variation source label.**

`magneticVariance.ts` reports its PGN 127258 source as "Automatic Calculation" rather than a fixed model year, since the value is computed from Signal K's live `navigation.magneticVariation` rather than a bundled World Magnetic Model table.

**Admin panel UI.**

The federated config panel gained Garmin compatibility badges per conversion card (displays / partial / ignores), short purpose text on engine and battery cards, and inline help text on the mapping editors explaining how Signal K ids and NMEA 2000 instance numbers pair across the engine tables. Accessibility pass: real `h3` card headings, a consistent `:focus-visible` ring, `role="alert"` error banners with a Retry action, a transient "Saved" status pill, horizontal scroll on wide mapping tables, and proper `scope` on table headers.

### Side effects

- Total conversion count (excluding pgnList itself) drops by 1 (productInfo) and gains 2 (engineTrip, the per-engine engineStatic split is identity-only), net +1.
- 126464 is now emitted as a Fast Packet message every 300 s plus on every ISO Request from a peer.
- 56 of 56 tests pass; typecheck and biome clean; both esbuild and webpack panel builds clean.

<a id="v154"></a>

## [1.5.4] - 2026-05-12

### Bug fix: ping-pong loop with signalk-server's notifications API

For every `notifications.*` delta the plugin received, it allocated an `alertId`, rewrote the value with the alertId injected, and re-published via `app.handleMessage(plugin.id, ...)` so downstream consumers could see the assigned id. signalk-server's built-in notifications API (the same one that owns the `notifications.*` namespace) intercepted that re-emit via its `registerDeltaInputHandler`, stripped the notification value out of our delta because our delta did not carry the `notificationId` field it uses to recognise its own messages, rebroadcast under `$source: notificationApi.*` without `alertId`, and the cycle reached the plugin's callback again. The callback could not detect this as "already handled" (the inbound value had its `alertId` stripped), allocated against the existing path entry, re-emitted, and the loop ran at ~48 round-trips per second per active alert.

Fix: the alertId is now published exactly once per path (the first time the plugin sees it). Subsequent updates on the same path build PGNs and update the cache but do not re-emit to Signal K.

**Bug fix: emit throttle for `notifications.*` callback fan-out**

The conversion subscribes to `notifications.*` and the callback fires for every notification delta on the vessel, regardless of which path carries the change. Some installs (Garmin / Evinrude / Mercury) broadcast tens of `notifications.propulsion.*.<symbol>` paths at 1-3 Hz each with `state="normal"`, which kept the callback running at 50-60 Hz. Each invocation used to return the full cached PGN array, so a single active alert produced ~100 PGN/s on the wire.

Each cached alert now carries a payload digest. The callback emits a PGN pair only when (a) the digest changed (state, ack, silence, message edit), or (b) at least 1000 ms has elapsed since the last emit for that alert (matching the NMEA 2000 transmission cadence for PGN 126983). Bus traffic for one active alert drops from ~100 PGN/s to 2 PGN/s. Multiple active alerts scale linearly: N alerts produce 2N PGN/s.

**Bug fix: `$source` on plugin-emitted notifications no longer reads `signalk-nmea2000-emitter-cannon.XX`**

signalk-schema's `getSourceId(source)` appends the literal string `.XX` to the source label when the source object lacks `canName`, `src`, or `talker`. The plugin's notification re-emit only set `source: { label, type }`, so it hit the fallback. Fix: the re-emit now sets `$source` directly, which short-circuits signalk-server's `handleMessage` derivation. Note that signalk-server's own `notificationApi` plugin hits the same `.XX` fallback for the same reason; in practice the plugin's `$source` only wins on paths the notifications API does not own.

### Misc

- Display name simplified to "NMEA2000 Emitter Cannon" in `Plugin.name`, `package.json` `displayName`, and README references. The npm package id stays `signalk-nmea2000-emitter-cannon`.
- `buildAlertPgns(...)` helper extracted: the two PGN-construction blocks in `notifications.ts` (path with explicit `alertId` and path with plugin-allocated `alertId`) now share a single options-keyed builder.
- `setAlertPgns(...)` and `evictOldestIfOverCap()` helpers centralise the cache + digest write and the overflow-eviction code that previously appeared twice in the callback.

**Verification**: live-tested against a synthetic notification probe on signalk-server v2.x. Pre-fix: 48 round-trips/sec, 97 PGN/s on the wire while one alert active. Post-fix: 0 round-trips, 2 PGN/s on the wire (1 Hz per alert as designed). Idle (no active alerts): 0 PGN/s. 52/52 tests pass, typecheck / biome / build clean. Bundle 464 KB (was 466 KB).

<a id="v153"></a>

## [1.5.3] - 2026-05-12

### Bug fix: plugin stuck on "Waiting for NMEA 2000 output" after every Save

After clicking Save in the React config panel (or otherwise triggering a plugin restart), the plugin would freeze with status `Waiting for NMEA 2000 output (N conversions enabled)` and emit zero PGNs until `signalk` was restarted. Same shape as v1.4.4 Issue #5, different root cause.

signalk-server passes plugins a SHALLOW COPY of the `app` object (`_.assign({}, app, ...)` in `interfaces/plugins.js`), so the `appCopy.isNmea2000OutAvailable` we read is frozen at plugin-registration time. It stays `false` forever even after canboatjs flips the live `app.isNmea2000OutAvailable` to true. The `nmea2000OutAvailable` event still reaches us on the initial start because event-listener registration goes through prototype methods that reach the live emitter, but the event is one-shot: subsequent PluginManager restarts attach a new listener that never fires.

Fix: the plugin's factory closure (which outlives PluginManager instances) installs its own listener once at registration time and latches the real ready flag. PluginManager's `start()` consults the latched flag via a constructor-injected getter instead of reading the stale `app.isNmea2000OutAvailable`. Survives any number of save / restart cycles.

### Other fixes

- `getModuleVersion()` was returning `"1.5.0"` (stale literal in `src/index.ts` since the React panel landing). Now read directly from `package.json` via a JSON import (esbuild inlines it into the bundle), so the version can never drift again.
- Status dashboard panel: explicit spaces between the "Enabled / NMEA 2000" labels and their values so the rendered text doesn't run together on every browser. Was relying on a CSS `marginLeft: 4` that didn't survive the federation host's CSS.

**Verification**: 5 rapid back-to-back saves all recover correctly (was: all stuck). 52/52 tests pass, typecheck / biome / build clean. Bundle unchanged (~466 KB).

<a id="v152"></a>

## [1.5.2] - 2026-05-12

The hand-rolled JSON-Schema admin UI is replaced with a federated React panel built on webpack 5 Module Federation. The plugin keeps its esbuild runtime bundle untouched; the panel is a second build target that produces `public/remoteEntry.js` plus chunked `public/*.mjs`. The config payload moves from a flat shape to a nested `conversions: { KEY: { enabled, resend, sources, extras } }` shape with a load-time migration from v1.4.x, so existing installs upgrade transparently. The migration is backwards-compatible at load: downgrading back to v1.4.4 keeps the original `plugin-config.json` intact if no save has occurred under v1.5.2. No wire-level (PGN) changes.

### Added

- React-based admin config panel loaded via webpack 5 Module Federation. Replaces the previous JSON-Schema-driven rjsf form. Categorized tabs (Navigation, Engine, Electrical, Tanks, Environment, AIS, Comms, System).
- Live status dashboard: NMEA 2000 readiness, enabled / total counts, per-conversion emit counts and error indicators (3s poll, paused when admin tab is hidden).
- Live source dropdowns populated from the running server's full data model (`vessels.self.<path>.$source` + `.values`).
- Mapping editors for battery, engine, tank, solar, brightness, and exhaust families. Replace the previous rjsf array-of-object widgets.
- Preset chips: Basic Navigation, Engine Set, Full AIS, Environmental, Raymarine. Additive; click a chip to enable the tagged conversions in one action.
- Plugin HTTP API under `/plugins/signalk-nmea2000-emitter-cannon/api/` (status, conversions, paths, sources). Admin-auth gated via `app.securityStrategy.addAdminMiddleware`. Logs a warning if the server does not expose the gating hook.
- `getModuleVersion()` lifecycle method so the admin UI displays the running plugin version.

### Changed

- Config schema migrated to `@sinclair/typebox`. Single source of truth for both the runtime JSON Schema (returned from `Plugin.schema`) and the TypeScript `Config` type (derived via `Static<>`). The legacy flat config payload is migrated to the new nested shape at load time; downgrades to v1.4.x keep the original payload intact if no save has occurred under v1.5.2.
- Each conversion module now carries `category` (required) and optional `presets` metadata. Adding a new conversion requires both fields.
- Minimum admin UI bumped to `@signalk/server-admin-ui >= 2.27.0` for ESM federation runtime support.
- Minimum Node.js bumped to `>=22.12` (was `>=20.18`). Node 20 reached end of life in April 2026; the CI matrix runs on Node 22.x and 24.x. esbuild target moved from `node20` to `node22`.
- Dev dependency `lint-staged` bumped to `^17.0.4` (was `^16.4.0`). Same Biome integration; requires Node 22.22.1+ which the engines bump above already enforces.
- All other dependency ranges refreshed via `npm update`; range floors tightened to match installed versions. Zero security audit findings.

### Bug fixes

- Notifications conversion short-circuits on its own delta to prevent a reentrant loop if `signalk-server` ever re-fans the rewritten alert delta.
- AIS Class B / SAR / Safety-Message conversions return `[]` until `app.getSelfPath("mmsi")` is populated, preventing emission of frames with `userId: 0`.
- `index.ts` nulls out `pluginManager` after a failed `start()`, so the next enable cycle sees a clean slate instead of calling `stop()` on a half-constructed instance.
- `/api/sources` trims the `path` query before lookup, so copy-pasted paths with whitespace return the expected source list.
- `setPluginError` set during a failed `start()` is no longer overwritten by the `stop()` epilogue's `setPluginStatus("Stopped")`.
- Notifications PGN 126983 uses a stable `dataSourceNetworkIdName` value instead of stuffing the local 16-bit `alertId` into a 64-bit ISO NAME field; restores ack correlation semantics per IEC 61162-1 App B.
- `PluginManager` reads source filters from both the dotted Signal K path and the legacy dotless propName form, so source-locks set in the v1.5.2 panel keep working on configs that still have the v1.4.x shape on disk.

### Internal / performance

- `Categories` and `PresetTags` moved into `src/config/enums.ts` so the React panel no longer pulls TypeBox into its bundle. Panel total dropped from ~144 KiB to ~54 KiB (a 62% reduction).
- Per-conversion emit counters and last-error tracking inside `PluginManager`. Both are surfaced via `/api/status`. Latest-error lookup indexed per parent `optionKey` for O(1) status snapshots.
- Identity-based dirty detection in the panel (saved-state ref) replaces the O(N) `JSON.stringify` per render.
- `useSources` deduplicates concurrent fetches for the same path, skips re-renders when the fetched list matches the cached one, and guards against unmount-mid-fetch state updates.
- `useStatus` polls every 3 seconds with visibility-pause and cancellation on unmount; status responses skip re-render when the snapshot is byte-equivalent.
- Status snapshot walks `errorBuckets` across all source types and bucket-key forms (parent and sub-conversion `[N]` brackets), not just the `stream` suffix. Bucket-prefix strings are named via a `BUCKET_PREFIX` const map.
- Sub-conversion emit counters aggregate under the parent `optionKey` rather than recording per-index keys.
- `extractPgnsFromTitle` regex hoisted to module scope.
- Discovery helpers use `app.getSelfPath` (correct self-to-MRN resolution path), not `app.getPath("vessels.self.<path>")` (which does not resolve `self`).
- Added the `signalk-plugin-configurator` npm keyword so the Signal K admin UI loads the federated panel instead of the rjsf form.
- Webpack 5 + babel-loader + `@babel/preset-typescript` build target for the panel under `public/*.mjs`. esbuild keeps building the plugin bundle to `dist/index.js`.
- TypeBox `Conversion` schema makes `sources` and `extras` required with `{}` defaults; eliminates a class of `?? {}` defensive spreads at the read sites.
- Removed unused `RawPluginOptions` / `normalizePluginOptions` exports. Removed the unused `init` reducer action and unreachable guards in the config reducer.
- Inline-style aria-labels on every form input in the panel; keyboard focus paths preserved.
- Single `PLUGIN_API_BASE` constant for the panel's fetch URLs.
- Timeout constants consolidated into `src/constants.ts` (`SLOW_DATA_TIMEOUT_MS`, `STATIC_DATA_TIMEOUT_MS`).
- BrightnessMappingEditor's `instanceId` field renamed to `groupLabel` everywhere (panel + conversion read).
- 52 tests across 9 files (up from 50; added `/api/sources` trim regression guards and PGN-presence validation).

### Signal K path corrections

- Navigation Data, Cross Track Error, Navigation Data Great Circle, Bearing and Distance Between Marks, Time to Mark, Route and Waypoint Information, Route and Waypoint List: switched from v2-only `navigation.course.*` paths to v1 siblings under `navigation.courseRhumbline.*` / `navigation.courseGreatCircle.*`. The v2 Course API is not pushed into the v1 streambundle that `getSelfBus` reads.
- Set and Drift: subscribe to `environment.water.current.{set,drift}` (live signalk-server compat) instead of `environment.current.{setTrue,drift}`.
- GNSS DOPs: subscribe only to canonical `horizontalDilution` / `positionDilution`; drop non-canonical `verticalDilution`, `timeDilution`, `mode` leaves.
- GNSS Satellites: subscribe to the composite `navigation.gnss.satellitesInView` (returns `{count, satellites}`) plus the scalar `navigation.gnss.satellites`, instead of non-existent `.count` / `.satellites` sub-paths.
- AIS SAR Aircraft: read altitude from `position.altitude` (canonical) instead of a non-canonical top-level `navigation.altitude`.
- Transmission Parameters: read gear from the canonical `propulsion.<id>.transmission.gear` enum instead of non-canonical `discreteStatus1/2` leaves.
- Engine Configuration Parameters (PGN 127498): moved to plugin-config inputs (rated engine speed, VIN, software version) emitted on a 60-second timer; there is no canonical Signal K source for these fields. Adds a `fields` extras meta type so the panel renders the three text/number inputs.
- Battery `voltage.ripple` subscription dropped: no canonical Signal K source. `rippleVoltage` is omitted from PGN 127506 (canboatjs encodes as "data not available").
- DSC, VHF, PGN-list, AIS safety message, and trim-tab subscriptions documented inline as non-canonical conventions that require a domain-aware upstream provider.

### Cleanup pass (low-priority follow-ups)

- AIS Safety Message conversion now carries an inline ITU-R M.1371 licensing note next to its declaration so the regulatory constraint is visible to anyone reading the source.
- Radio Frequency MHz / Hz heuristic documented: explains the magnitude-based boundary and the future SDR / L-band case where it would need to be replaced with an explicit units field rather than widened.
- `PluginManager` collapsed four parallel per-conversion Maps (emit counters, last-emit timestamps, enabled set, latest-error secondary index) into a single `Map<optionKey, PerConversionState>`. Status snapshot read shrinks from two Map lookups per conversion to one; `recordEmit` becomes one Map.get plus two in-place field writes.
- `src/api/router.ts` exposes an `HTTP_STATUS` constant (`BAD_REQUEST`) instead of the bare literal 400 used for the `/api/sources` missing-path response.
- `findOrphanExtrasMetaKeys(loaded)` runs once from the `PluginManager` constructor and logs (via `app.debug`) any entry in `EXTRAS_BY_OPTION_KEY` that does not match a loaded conversion. Catches a typo or renamed conversion that would otherwise silently break the panel's per-card editor without breaking runtime emission. Pure function: the caller decides the log channel.
- `PluginConfigurationPanel` `save` prop carries a JSDoc note documenting it as fire-and-forget; do not await.
- `useStatus` interval cleanup simplified: the id was unconditionally assigned so the nullable type and null-guard at teardown were dead code.
- `useSources` cache capped at 256 entries with insertion-order eviction; bounds memory if an admin session queries a large number of ad-hoc paths.
- `magneticVariance.ts` notes the historical optionKey-vs-path mismatch (`MAGNETIC_VARIANCE` vs `navigation.magneticVariation`); kept for config backwards compatibility.

**Verification**: `npm run typecheck` clean (root + panel tsconfigs), `npm test` 52/52 pass, `npm run check` (Biome) clean, `npm run build` clean (esbuild plugin bundle 466 KB + webpack federation panel total 54 KiB). No em dashes in source or docs.

<a id="v144"></a>

## [1.4.4] - 2026-05-12

### Bug fix: plugin permanently stuck after restart (Issue #5)

The `nmea2000OutAvailable` event is one-shot at signalk-server startup; if you disabled and re-enabled the plugin after the server had already announced N2K output was available, the plugin's listener was registered too late to ever receive the event. `nmea2000Ready` stayed `false`, every emit was dropped with `NMEA2000 output not yet available, dropping message`, and the status read "Waiting for NMEA 2000 output (...)" indefinitely.

Two underlying causes addressed in `src/plugin-manager.ts`:

1. **Listener lifecycle moved from constructor to `start()`**: the constructor now only captures the `onNmea2000Ready` callback reference; `start()` does `removeListener` then `addListener` so the registration is idempotent across many disable/enable cycles. `stop()` keeps the existing `removeListener` call, so a stopped instance leaves no listener behind. Previously the constructor was the sole register-site and `start()` never re-registered after `stop()` had cleaned up.
2. **Sync state check on `start()`**: `signalk-server >= 2.x` mirrors the one-shot event to a property (`app.isNmea2000OutAvailable`). `start()` now reads it and flips `this.nmea2000Ready` directly when the value is already `true`. The event listener remains as a backup for the cold-boot path where the server has not yet announced.

`src/types/signalk.ts` adds `isNmea2000OutAvailable?: boolean` to the `SignalKApp` interface (optional so older server builds compile).

`src/test/lifecycle.test.ts` updated to reflect the new design: tests now set the sync mirror in `beforeEach` and assert that `start()` (not the constructor) owns the listener registration. New coverage: repeated `start(opts) → start(opts)` calls keep the listener count at 1, not accumulating.

### Supply chain

- Dependabot alert #1 (`ip-address < 10.1.1` XSS in HTML-emitting methods) resolved via `package.json` `overrides`: `"ip-address": "^10.1.1"`. The vulnerable code never shipped (signalk-server is a devDependency used to load the plugin in tests; the bundle does not include it), but the override silences the alert and the resolution is now reproducible. Side effect: signalk-server bumped 2.26.0 → 2.27.0 as npm resolved a fresh tree.
- PR #6 merged: `actions/checkout@v4 → v6`, `actions/setup-node@v4 → v6`, `github/codeql-action@v3 → v4`. Clears the Node 20 deprecation warning GitHub Actions emits.
- PR #7 merged: dev-dependencies bump (5 packages, lockfile only).
- CodeQL warnings #1 and #2 (missing per-job `permissions:` block on `ci.yml`) fixed by adding `permissions: contents: read` to both jobs. The workflow-level declaration was already there; CodeQL wants per-job too.

**Verification**: `npm run typecheck` clean, `npm test` 21/21 pass, `npm run check` (Biome) clean, `npm run build` 340.3 KB. No em dashes in new content.

<a id="v143"></a>

## [1.4.3] - 2026-05-12

This release closes gaps in the notification PGN family (126983/126985) and a handful of secondary issues across the conversion modules. This release fixes the actionable findings; PGN 126984 (inbound Alert Response) is intentionally deferred because the typed Signal K server API does not expose an inbound NMEA 2000 hook, so closing the alert-acknowledgement round-trip needs a separate design pass.

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
- `.gitignore` hardened: broader `.env.*` coverage with `!.env.example` exception, `.npmrc` ignored (can hold publish auth tokens), key/cert patterns (`*.pem`, `*.key`, `*.crt`, `*.cer`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`), generic secrets (`secrets/`, `secrets.json`, `credentials.json`, `*.secret(s)`, `*.credentials`), and local tooling state (`.claude/`, `.remember/`).
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

<a id="v142"></a>

## [1.4.2] - 2026-05-11

A rework of the plugin's user-visible surfaces: the admin schema, the plugin status messages, and the conversion module titles. All 47 source files were touched; behavior changes are additive and conservative.

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
- Debug-noise cleanup: dropped the `=== STARTING ===` / `=== COMPLETE ===` banners and shouty "***SETTING UP***" line; per-conversion startup debug consolidated to one `Enabling: <label>` line per enabled conversion.

**Plugin icon refresh (`assets/icons/`)**:

- Plugin now ships the family icon set (`icon.svg` + `icon-{72,96,192,512}.png`) shared with `signalk-virtual-weather-sensors` and `signalk-openrouter-companion`: a deep-ocean gradient with three stylized wave lines and a project-coloured badge in the bottom-right. `package.json` `signalk.appIcon` points at `icon-192.png`.
- Badge glyph: three concentric arcs radiating from a transmitter dot in the badge interior, sized to fill most of the orange badge and anchored slightly up-and-right of the badge's lower-left corner for visual balance. Reads as directional broadcast / emit. Replaces an earlier up-arrow variant that read as an upload/update indicator, and the pre-family standalone cannon icon (`icon-72x72.png`) is removed.

**Verification**: `npm run typecheck` clean, `npm test` 21/21 pass, `npm run build` 337.8 KB clean. No em dashes in source.

<a id="v140"></a>

## [1.4.0] - 2026-05-10

This release resolves about thirty findings spanning lifecycle, conversions, schema, types, and utilities, including two blocker regressions introduced and caught during the fix work itself.

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

<a id="v132"></a>

## [1.3.2] - 2026-05-09

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

<a id="v131"></a>

## [1.3.1] - 2026-05-08

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

<a id="v130"></a>

## [1.3.0] - 2026-05-05

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

**Toolchain and dependencies**:

- TypeScript bumped 5.9 to 6.0. `tsconfig.json`: removed unused `baseUrl` and `paths` (no `@/...` imports in the codebase); added `"types": ["node"]` because TypeScript 6 changed the default to `[]`, which dropped `@types/node` from auto-include and broke `NodeJS.Timeout` references.
- esbuild bumped 0.27 to 0.28. Bundle output is byte-identical.
- lint-staged bumped 15 to 16. No config changes required.
- `engines.node` tightened from `>=20` to `>=20.18` to match lint-staged 16's floor.
- Biome dependency bumped within range; `biome.json` `$schema` URL updated to match the installed biome version.
- All in-range packages updated via `npm update` (biome, canboatjs 3.13 → 3.17, vitest 4.1.4 → 4.1.5, @types/node, @vitest/*, signalk-server, es-toolkit).

**Cleanup**:

- Stale `coverage/` directory (gitignored, last modified weeks ago) removed.

---

<a id="v125"></a>

## [1.2.5] - 2026-05-03

**NMEA 2000 Bus Correctness**:

- PGN 126983/126985 notifications: restored the `source: { label: plugin.id, type: "plugin" }`
  field on the delta sent to `app.handleMessage`. The field was added in v1.1.x for
  Signal K schema compliance and silently dropped during a later refactor;
  schema-strict consumers could reject the malformed delta.
- PGN 126464 transmit-PGN list no longer advertises 128275 (Distance Log) or
  129033 (Time and Date). The plugin has no module that emits them, so any
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

<a id="v124"></a>

## [1.2.4] - 2026-04-19

- PGN 130313 outside humidity now subscribes to both
  `environment.outside.relativeHumidity` and `environment.outside.humidity`.
  Upstream Signal K humidity sources disagree on which path is canonical.
  `signalk-virtual-weather-sensors`, for example, publishes to `.humidity`,
  while the emitter-cannon previously only listened on `.relativeHumidity`,
  so the Garmin showed no reading. `relativeHumidity` still wins when both
  are present. Inside humidity is unchanged (no sibling `.humidity` path).

<a id="v123"></a>

## [1.2.3] - 2026-04-19

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
  now have unique defaults (104 to 111).
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

**Test and Build Hardening**:

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

<a id="v122"></a>

## [1.2.2] - 2026-04-18

**Critical Bug Fixes**:

- Fixed temperature schema generation: 20 of 22 temperature optionKeys (engine room, cabin, refrigerator, freezer, dewpoint, wind chill, heat index, and the PGN-130316 variants of every source) were unreachable from the Signal K admin UI. Schema entries are now generated from the same temperatures table the conversions use.
- Resend timer now re-invokes conversion callbacks instead of re-emitting cached output. Time-derived PGNs (system time / GNSS time, PGN 126992) now broadcast fresh values each interval instead of repeating a stale snapshot.

**Plugin Lifecycle Hardening**:

- `PluginManager.stop()` wraps every cleanup step (unsubscribe, clearInterval, smoother clear) in a safe wrapper, collects errors, and logs a single summary instead of aborting on the first failure.
- `ExponentialSmoother` instances self-register; smoother state is cleared on plugin stop so smoothed values don't carry across restart.
- Centralized callback error handling in `PluginManager.invokeCallback()`.

**Type and Code Quality**:

- Tightened `ConversionModule<any>` to `ConversionModule<unknown[]>` at the registry boundary; `ConversionCallback` is now a method-style declaration so narrow modules type-check under the unknown umbrella without `any` casts.
- Replaced default-value priority/SID literals with named constants in temperature, timeToMark, and bearingDistanceBetweenMarks.
- Re-enabled biome rules `noExplicitAny` and `noApproximativeNumericConstant`.

**Tooling and Release**:

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

<a id="v121"></a>

## [1.2.1] - 2026-04-18

**Configuration Simplification**:

- Added top-level `globalResendInterval` setting (default 5s) that controls resend frequency for all conversions
- Per-conversion `resend` value still overrides the global when non-zero
- Removed `resendTime` entirely: timers now resend indefinitely until the plugin stops or new data arrives

---

<a id="v120"></a>

## [1.2.0] - 2026-04-08

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

**Consistency and Cleanup**:

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

<a id="v110"></a>

## [1.1.0] - 2026-01-20

**Constants and Code Consistency**:

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
  - `normalizeAngle()` - normalizes angles to 0..2π range
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

<a id="v101"></a>

## [1.0.1] - 2025-10-11

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

<a id="v100"></a>

## [1.0.0] - 2025-10-11

**Project Renamed**: Formerly known as sk-n2k-emitter, now released as signalk-nmea2000-emitter-cannon v1.0.0

**About This Release**:
This is a mature Signal K NMEA 2000 plugin with 92% Garmin PGN coverage, built on the foundation of the original [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000) project by Scott Bender and the Signal K community. This enhanced version represents a complete modernization with TypeScript conversion, expanded PGN support, and production-ready reliability.

---

**Complete TypeScript Conversion**:

- **47 JavaScript modules** fully converted to TypeScript with strict type safety
- **Zero `any` types** - Complete type safety throughout entire codebase
- **56 unique PGNs** verified with mathematical precision (100% coverage maintained)
- **Modern ESM modules** - Pure ES module system with proper imports/exports
- **Advanced type definitions** - Comprehensive Signal K and NMEA 2000 type system

**Garmin PGN Specification Alignment (92% Coverage)**:

- **Navigation and Positioning** (15+ PGNs): GPS, GNSS, AIS, waypoints, routes, cross-track error
  - PGN 129026 (COG and SOG), 129029 (GNSS Position), 129285 (Route/Waypoint Info)
  - PGN 129301 (Time to/from Mark), 129302 (Bearing/Distance Between Marks)
  - PGN 129539 (GNSS DOPs), 129540 (GNSS Satellites in View), 130074 (Route WP List)
  - PGN 130577 (Direction Data), AIS Class A/B/SAR/AtoN (129038-129041, 129798, 129802)
- **Engine and Propulsion** (8+ PGNs): Parameters, transmission, static data, small craft status
  - PGN 127245 (Rudder), 127488 (Engine Rapid Update), 127489 (Engine Dynamic)
  - PGN 127493 (Transmission Parameters), 127498 (Engine Static), 130576 (Small Craft Status)
- **Environmental** (10+ PGNs): Wind variants, temperature, pressure, humidity, sea conditions
  - PGN 130306/130310/130313/130314 (Wind variants), 130310 (Sea/Air Temperature)
  - PGN 130311 (Atmospheric Pressure), 130313/130314 (Humidity), 128267 (Depth)
- **Safety and Communications** (12+ PGNs): Alerts, notifications, DSC calls, radio
  - PGN 126983/126985 (Alerts), 129799 (Radio Frequency), 129808 (DSC Calls)
  - PGN 126464 (PGN List), 126996 (Product Information)
- **Battery and Power** (4+ PGNs): Battery status, solar chargers, DC detailed status
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

**Performance and Dependencies**:

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

**Testing and Validation**:

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
