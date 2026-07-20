# PGN Reference

The plugin has 79 configurable data conversions covering 59 data PGNs, plus an
80th module that broadcasts PGN 126464. Five stack-owned bus-layer PGNs are
also advertised in the 126464 transmit list. Standard fields, ranges, and enum
values are validated against the bundled Canboat definitions.
Display support remains model-specific and should be checked against the
receiving device's PGN list.

Immediately before emission, `withCanonicalPgnPriority()` applies the priority
declared by the Canboat 7.1.0 database. PGNs for which Canboat does not declare
a priority keep the value supplied by their conversion. PGN 65288 is
variant-specific: this plugin emits the SeaTalk Alarm variant at priority 7.
This centralized boundary prevents individual conversion defaults from
silently drifting away from the current PGN definitions.

## Navigation and Positioning

| PGN | Description | Module |
| -------- | ------------- | -------- |
| 127245 | Rudder Position | `rudder.ts` |
| 127250 | Vessel Heading / True Heading | `heading.ts`, `trueheading.ts` |
| 127251 | Rate of Turn | `rateOfTurn.ts` |
| 127252 | Heave | `heave.ts` |
| 127257 | Attitude (pitch, roll, yaw) | `attitude.ts` |
| 127258 | Magnetic Variance | `magneticVariance.ts` |
| 128000 | Leeway | `leeway.ts` |
| 128259 | Speed Through Water | `speed.ts` |
| 128267 | Water Depth | `depth.ts` |
| 128275 | Distance Log (total and trip) | `distanceLog.ts` |
| 129025 | Position (lat/lon) | `gps.ts` |
| 129026 | COG and SOG Rapid Update | `cogSOG.ts` |
| 129029 | GNSS Position Data | `gps.ts` |
| 129283 | Cross Track Error | `navigationData.ts` |
| 129284 | Navigation Data (waypoint) | `navigationData.ts` |
| 129291 | Set and Drift | `setdrift.ts` |
| 129301 | Time to/from Mark | `timeToMark.ts` |
| 129302 | Bearing and Distance Between Marks | `bearingDistanceBetweenMarks.ts` |
| 129539 | GNSS DOPs | `gnssData.ts` |
| 129540 | GNSS Satellites in View | `gnssData.ts` |
| 130577 | Direction Data | `directionData.ts` |
| 130578 | Vessel Speed Components | `vesselSpeedComponents.ts` |

Route broadcasts and Route and WP Service PGNs such as 129285, 130067, and
130074 require a complete, versioned route transaction or a directed complex
request exchange. The removed implementations could not provide that lifecycle
or register the service through the current plugin API, so the plugin does not
advertise unreliable route transfer. PGN 129284 continues to carry active
next-waypoint navigation data.

`VESSEL_SPEED_COMPONENTS` maps the canonical longitudinal and transverse
water-referenced paths in SI meters per second. Current Garmin ECHOMAP UHD2
documentation lists PGN 130578 as received, but support remains model- and
firmware-specific.

`DISTANCE_LOG` emits the total and trip values from `navigation.log` and
`navigation.trip.log`. Some instruments reset a trip log by sending a directed
PGN 126208 command for field 4 of PGN 128275. Signal K does not expose that
inbound group-function exchange to this plugin, so reset the trip path at its
upstream source instead.

## AIS

| PGN | Description | Module |
| -------- | ------------- | -------- |
| 129038 | Class A Position Report | `ais.ts` |
| 129039 | Class B Position Report | `ais.ts`, `aisExtended.ts` |
| 129040 | Class B Extended Position Report | `aisExtended.ts` |
| 129041 | AtoN (Aids to Navigation) | `ais.ts` |
| 129794 | Static and Voyage Data | `ais.ts` |
| 129798 | SAR Aircraft Position | `aisExtended.ts` |
| 129802 | Safety Related Broadcast (regulated transmission, see note below) | `aisExtended.ts` |
| 129809 | Class B Static Data, Part A | `ais.ts` |
| 129810 | Class B Static Data, Part B | `ais.ts` |

The remote-target relay in `ais.ts` drops any delta whose
`updates[].source.type` is `NMEA2000`, preventing received AIS targets from
being echoed onto the same bus. The own-vessel conversions in `aisExtended.ts`
use the normal per-path source filters available in the configuration panel.

> **Note on PGN 129802 (AIS Safety Related Broadcast).** ITU-R M.1371 limits AIS
> safety broadcasts to vessels with a licensed AIS transceiver whose MMSI
> matches the one published on the bus. Some jurisdictions also require a ship
> station license (e.g. FCC in the US). The `AIS_SAFETY_MESSAGE` conversion is
> disabled by default; confirm local rules permit transmit on AIS frequencies
> before enabling. The plugin also requires an upstream Signal K provider
> publishing `communication.ais.safetyMessage` and a self MMSI on the vessel
> before any PGN 129802 frame is emitted.

## Engine and Propulsion

| PGN | Description | Module |
| -------- | ------------- | -------- |
| 127488 | Engine Parameters Rapid Update | `engineParameters.ts` |
| 127489 | Engine Parameters Dynamic | `engineParameters.ts` |
| 127493 | Transmission Parameters | `transmissionParameters.ts` |
| 127497 | Engine Trip Parameters (fuel used, fuel rate average/economy/instantaneous) | `engineTrip.ts` |
| 127498 | Engine Configuration (per-engine static identity: rated RPM, VIN, software version) | `engineStatic.ts` |
| 130576 | Small Craft Status | `smallCraftStatus.ts` |

PGN 127493 represents `discreteStatus1` as a Canboat bit lookup. With no active
transmission faults, the conversion supplies an empty flag array. The current
canboatjs decoder returns that empty byte as numeric zero, which is equivalent
on the wire.

## Environmental

| PGN | Description | Module | Status |
| -------- | ------------- | -------- | -------- |
| 130306 | Wind Data (apparent, true ground, true water, weather-forecast apparent and boat-referenced true) | `wind.ts`, `windTrueGround.ts`, `windTrueWater.ts`, `windWeatherApparent.ts`, `windWeatherTrue.ts` | Current |
| 130310 | Environmental Parameters (sea temp legacy) | `seaTemp.ts` | Legacy (still widely supported) |
| 130311 | Environmental Parameters (atmospheric pressure) | `environmentParameters.ts` | Deprecated, replaced by 130313/130314/130316 |
| 130312 | Temperature (exhaust + general-purpose sources) | `engineParameters.ts`, `temperature.ts` | Deprecated, replaced by 130316 |
| 130313 | Humidity (inside/outside) | `humidity.ts` | Current |
| 130314 | Actual Pressure (atmospheric) | `pressure.ts` | Current |
| 130316 | Temperature, Extended Range | `temperature.ts` | Current (preferred by modern Garmin) |

**Recommended for new installs**: enable the `TEMPERATURE2_*` (PGN
130316), `HUMIDITY_OUTSIDE` (PGN 130313), `PRESSURE` (PGN 130314), `WIND` /
`WIND_TRUE_GROUND` / `WIND_TRUE` (PGN 130306) conversions and leave the
deprecated `TEMPERATURE_*` (130312) and `ENVIRONMENT_PARAMETERS` (130311)
disabled. Confirm the exact received-PGN list for the chartplotter model and
firmware in use. The legacy and deprecated variants remain available for older
displays that do not read the newer PGNs.

**Source type and instance**: each temperature and humidity conversion has a
source-type dropdown and an instance field in its editor. The source type sets
the emitted NMEA 2000 source enum (for example `Inside Temperature` or
`Refrigeration Temperature`); leaving it on "Default" keeps the per-path source
the conversion ships with. The instance (an 8-bit value, clamped to 0 to 252)
distinguishes multiple sensors that share a source type.

**Raymarine Axiom and i70 field-tested setup**: tested installations rendered
the `Inside Temperature` temperature source and the `Inside` humidity source,
and separated multiple sensors by instance (0 to 9). Model and firmware
behavior can vary. The one-click
**Raymarine** preset handles this: it enables the inside-family temperatures
(`TEMPERATURE2_INSIDE`, `TEMPERATURE2_MAINCABIN`, `TEMPERATURE2_REFRIGERATOR`,
`TEMPERATURE2_FREEZER`, `TEMPERATURE2_ENGINEROOM`) and `HUMIDITY_INSIDE`, and
remaps them onto the `Inside` source at distinct instances 0 to 4 (humidity at
0), all on PGN 130316 / 130313. Displays that read the dedicated source labels
are unaffected.

**Forecast wind on a vessel with no anemometer**: the weather plugin's wind is a
ground-true wind (speed over ground plus a compass direction). `WIND_TRUE_GROUND`
emits it on PGN 130306 with reference `True (ground referenced to North)`, which a
Garmin shows as Ground Wind, not True Wind. To populate the True Wind Speed/Angle
fields, also enable `WIND_WEATHER_TRUE`: it computes the boat-referenced true wind
angle (TWA = `environment.wind.directionTrue` minus `navigation.headingTrue`) and
emits PGN 130306 with reference `True (boat referenced)`. It needs a true heading
to produce an angle, and like `WIND_WEATHER_APPARENT` it is opt-in (disabled by
default) and meant only for a boat without a real masthead anemometer.

## Electrical Systems

| PGN | Description | Module | Status |
| -------- | ------------- | -------- | -------- |
| 127503 | AC Input Status | `acStatus.ts` | Deprecated, retained for compatible receivers |
| 127504 | AC Output Status | `acStatus.ts` | Deprecated, retained for compatible receivers |
| 127505 | Fluid/Tank Level | `tanks.ts` | Current |
| 127506 | DC Detailed Status (state of charge) | `battery.ts`, `solar.ts` | Current |
| 127507 | Charger Status | `chargerStatus.ts` | Deprecated, retained for compatible receivers |
| 127508 | Battery Status (voltage/current) | `battery.ts`, `solar.ts` | Current |
| 127509 | Inverter Status | `inverterStatus.ts` | Deprecated, retained for compatible receivers |

The NMEA 3.002 Network Message Database marks PGNs 127503, 127504, 127507, and
127509 deprecated. They
remain available because current Garmin ECHOMAP UHD2 and B&G Zeus S receive
lists still include them, while the newer electrical PGN families are not yet
complete in the bundled Canboat database. Enable them only when the receiving
equipment requires them.

The `BATTERY` and `SOLAR` modules emit both PGN 127506 and PGN 127508 by
design. Current ECHOMAP UHD2 documentation lists both PGNs as received, while
older Garmin models and other vendors vary. PGN 127508 carries voltage,
current, and temperature. PGN 127506 carries state-of-charge,
state-of-health, and time-remaining. Leave both enabled unless the exact
receiving device documentation says otherwise.

`AC_STATUS` maps `electrical.ac.<id>.phase.<single|A|B|C>` to input or output
status. Input rows require an explicit acceptability setting because PGN
127503 has no unknown value for that field. `CHARGER_STATUS` maps unambiguous
Signal K `chargingMode` and `chargerRole` values and links each charger to its
configured battery instance. `INVERTER_STATUS` maps the unambiguous
`inverting`, `disabled`, and `faulted` Signal K modes and leaves other modes
unavailable instead of guessing at an NMEA 2000 state.

## Safety and Communications

| PGN | Description | Module |
| -------- | ------------- | -------- |
| 126464 | PGN List (transmit/receive) | `pgnList.ts` |
| 126983 | Alert | `notifications.ts` |
| 126985 | Alert Text | `notifications.ts` |
| 126992 | System Time | `systemTime.ts` |
| 129033 | Time and Date from GNSS data, local offset unavailable | `timeDate.ts` |
| 129799 | Radio Frequency/Mode/Power | `radioFrequency.ts` |
| 129808 | DSC Distress Call Information (re-emits decoded inbound distress traffic) | `dscCalls.ts` |

`TIME_DATE` reads the canonical UTC `navigation.datetime` path and leaves the
PGN 129033 local-offset field unavailable because Signal K does not publish
that offset. Current Garmin ECHOMAP UHD2 documentation omits PGN 129033 while
listing PGN 126992, so receiver support is model- and firmware-specific.

`dscCalls.ts` re-emits decoded inbound DSC distress traffic onto the NMEA 2000
bus; it does not synthesize distress calls. The conversion reads
`communication.dsc.callType`, `communication.dsc.mmsi`, and
`communication.dsc.nature` (published by DSC-aware upstream Signal K providers
when a VHF radio reports an incoming DSC message) and forwards them as PGN
129808 so non-DSC-aware MFDs on the bus can display the alert. Other DSC call
categories are suppressed because canboatjs 3.20 does not preserve their
category through its PGN 129808 variant selection. For a direct distress alert,
the conversion writes the nine-digit MMSI plus its required trailing zero into
the `MMSI of Ship in Distress` field and leaves the addressed-call field
unavailable. Canboatjs 3.20 cannot write that 40-bit decimal field correctly
from a JavaScript number, so the conversion supplies the five decimal-pair
bytes directly and a raw-wire regression test verifies their positions.

The DSC mapper receives subscribed path values, not the original delta's
`source.type`, so it cannot automatically reject an echo from the NMEA 2000
provider. Before enabling `DSC_CALLS`, source-lock all three DSC paths to a
DSC-aware provider that is not reading the same NMEA 2000 bus, such as an
off-bus VHF integration. Leave the conversion disabled if the only source is
the same NMEA 2000 provider, or it can duplicate the distress frame.

## Vendor-Specific

| PGN | Description | Module |
| -------- | ------------- | -------- |
| 65288 | Raymarine (Seatalk) Alarms | `raymarineAlarms.ts` |
| 126720 | Raymarine Display Brightness | `raymarineBrightness.ts` |

## Bus-layer (announced in the transmit PGN list, not emitted by this plugin)

These appear in PGN 126464's transmit list, but the plugin itself does not
generate them. The ISO entries are handled by Signal K's NMEA 2000 stack at the
bus layer. PGN 126993 (Heartbeat, ~60 s nominal) and PGN 126996 (Product
Information, on address claim and on ISO requests for PGN 126996) are
auto-emitted by canboatjs's `N2kDevice`. Advertising PGN 126993 keeps the
transmit list consistent with the heartbeat traffic consumers observe.

When PGN_LIST is enabled, the plugin broadcasts its complete PGN 126464 list
every five minutes. A
directed ISO Request for 126464 is answered by the Signal K provider's internal
Canboat device, whose static transmit list cannot currently be extended through
the plugin API. Until Signal K exposes PGN registration, that directed response
may omit plugin-owned PGNs even though the periodic broadcast includes them.

## Evaluated but Deferred

- **PGN 127501, Binary Switch Bank Status** is received by current Garmin
  ECHOMAP UHD2 and B&G Zeus S models, but Canboat still marks its interval
  incomplete and Signal K has no canonical electrical switch-bank schema.
  Implementing it now would require a bespoke path convention without labels.
- **PGN 130060, Label** could name switch-bank channels, but its Canboat
  definition is also incomplete. It should be implemented together with a
  future configurable switch-bank mapper, not emitted as an isolated frame.
- **PGN 127233, Man Overboard Notification** is deliberately deferred. It is
  safety-critical and needs emitter identity, position-source provenance,
  lifecycle handling, and directed request behavior that the current plugin
  does not expose reliably.
- **PGNs 127510, 127511, and 127513**, the charger, inverter, and battery
  configuration frames, are complete in Canboat but omitted from the current
  ECHOMAP UHD2 receive list. Signal K also lacks enough canonical control,
  chemistry, equalization, load-sense, and efficiency fields to populate them
  without guessing.
- **PGNs 127490, 127491, 127494, 127495, 128002, 128003, and 128780**, covering
  electric-drive, energy-storage, and linear-actuator data, appear in the current
  ECHOMAP UHD2 receive list. Canboat still marks their fields, field lengths,
  resolution, and intervals incomplete, so emitting them would depend on
  unstable wire definitions.
- **PGNs 127496, 128777, 126987, 126988, and 129801**, covering vessel-trip,
  windlass, alert-threshold, alert-value, and addressed AIS safety data, are
  plausible on current Raymarine displays. Signal K lacks the canonical trip,
  windlass, and addressed-message fields needed to populate them. Canboat also
  marks the windlass and alert definitions incomplete, while addressed AIS
  safety transmission needs destination, sequence, and licensed-transmitter
  controls that this plugin does not provide.

| PGN | Description |
| -------- | ------------- |
| 59392 | ISO Acknowledgement |
| 59904 | ISO Request |
| 60928 | ISO Address Claim |
| 126993 | Heartbeat (canboatjs auto-emit) |
| 126996 | Product Information (canboatjs auto-emit) |

## Data Flow

```text
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
                                          Signal K NMEA 2000 provider (e.g. canbus-canboatjs)
                                                |
                                          NMEA 2000 bus --> Garmin / Raymarine / B&G displays
```
