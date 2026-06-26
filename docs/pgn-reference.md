# PGN Reference

53 data PGNs across 46 conversion modules, plus 5 bus-layer PGNs advertised in
the 126464 transmit list. All PGNs are aligned with Garmin specifications
(corrected priorities, SID fields, field names, reference enums).

## Navigation and Positioning

| PGN | Description | Module |
|--------|-------------|--------|
| 127245 | Rudder Position | `rudder.ts` |
| 127250 | Vessel Heading / True Heading | `heading.ts`, `trueheading.ts` |
| 127251 | Rate of Turn | `rateOfTurn.ts` |
| 127252 | Heave | `heave.ts` |
| 127257 | Attitude (pitch, roll, yaw) | `attitude.ts` |
| 127258 | Magnetic Variance | `magneticVariance.ts` |
| 128000 | Leeway | `leeway.ts` |
| 128259 | Speed Through Water | `speed.ts` |
| 128267 | Water Depth | `depth.ts` |
| 129025 | Position (lat/lon) | `gps.ts` |
| 129026 | COG and SOG Rapid Update | `cogSOG.ts` |
| 129029 | GNSS Position Data | `gps.ts` |
| 129283 | Cross Track Error | `navigationData.ts` |
| 129284 | Navigation Data (waypoint) | `navigationData.ts` |
| 129285 | Route/Waypoint Information | `routeWaypoint.ts` |
| 129291 | Set and Drift | `setdrift.ts` |
| 129301 | Time to/from Mark | `timeToMark.ts` |
| 129302 | Bearing and Distance Between Marks | `bearingDistanceBetweenMarks.ts` |
| 129539 | GNSS DOPs | `gnssData.ts` |
| 129540 | GNSS Satellites in View | `gnssData.ts` |
| 130074 | Route WP List | `routeWpList.ts` |
| 130577 | Direction Data | `directionData.ts` |

## AIS

| PGN | Description | Module |
|--------|-------------|--------|
| 129038 | Class A Position Report | `ais.ts` |
| 129039 | Class B Position Report | `aisExtended.ts` |
| 129040 | Class B Extended Position Report | `aisExtended.ts` |
| 129041 | AtoN (Aids to Navigation) | `ais.ts` |
| 129794 | Static and Voyage Data | `ais.ts` |
| 129798 | SAR Aircraft Position | `aisExtended.ts` |
| 129802 | Safety Related Broadcast (regulated transmission, see note below) | `aisExtended.ts` |

> **Note on PGN 129802 (AIS Safety Related Broadcast).** ITU-R M.1371 limits AIS
> safety broadcasts to vessels with a licensed AIS transceiver whose MMSI
> matches the one published on the bus. Some jurisdictions also require a ship
> station licence (e.g. FCC in the US). The `AIS_SAFETY_MESSAGE` conversion is
> disabled by default; confirm local rules permit transmit on AIS frequencies
> before enabling. The plugin also requires an upstream Signal K provider
> publishing `communication.ais.safetyMessage` and a self MMSI on the vessel
> before any PGN 129802 frame is emitted.

## Engine and Propulsion

| PGN | Description | Module |
|--------|-------------|--------|
| 127488 | Engine Parameters Rapid Update | `engineParameters.ts` |
| 127489 | Engine Parameters Dynamic | `engineParameters.ts` |
| 127493 | Transmission Parameters | `transmissionParameters.ts` |
| 127497 | Engine Trip Parameters (fuel used, fuel rate average/economy/instantaneous) | `engineTrip.ts` |
| 127498 | Engine Configuration (per-engine static identity: rated RPM, VIN, software version) | `engineStatic.ts` |
| 130576 | Small Craft Status | `smallCraftStatus.ts` |

## Environmental

| PGN | Description | Module | Status |
|--------|-------------|--------|--------|
| 130306 | Wind Data (apparent, true ground, true water, weather-forecast apparent and boat-referenced true) | `wind.ts`, `windTrueGround.ts`, `windTrueWater.ts`, `windWeatherApparent.ts`, `windWeatherTrue.ts` | Current |
| 130310 | Environmental Parameters (sea temp legacy) | `seaTemp.ts` | Legacy (still widely supported) |
| 130311 | Environmental Parameters (atmospheric pressure) | `environmentParameters.ts` | Deprecated, replaced by 130313/130314/130316 |
| 130312 | Temperature (exhaust + general-purpose sources) | `engineParameters.ts`, `temperature.ts` | Deprecated, replaced by 130316 |
| 130313 | Humidity (inside/outside) | `humidity.ts` | Current |
| 130314 | Actual Pressure (atmospheric) | `pressure.ts` | Current |
| 130316 | Temperature, Extended Range | `temperature.ts` | Current (preferred by modern Garmin) |

**Recommended for new Garmin installs**: enable the `TEMPERATURE2_*` (PGN
130316), `HUMIDITY_OUTSIDE` (PGN 130313), `PRESSURE` (PGN 130314), `WIND` /
`WIND_TRUE_GROUND` / `WIND_TRUE` (PGN 130306) conversions and leave the
deprecated `TEMPERATURE_*` (130312) and `ENVIRONMENT_PARAMETERS` (130311)
disabled. Modern Garmin ECHOMAP / GPSMAP chartplotters receive all the current
PGNs natively. The legacy / deprecated variants remain available for older
displays that don't speak the newer PGNs.

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

| PGN | Description | Module |
|--------|-------------|--------|
| 127505 | Fluid/Tank Level | `tanks.ts` |
| 127506 | DC Detailed Status (state of charge) | `battery.ts`, `solar.ts` |
| 127508 | Battery Status (voltage/current) | `battery.ts`, `solar.ts` |

The `BATTERY` and `SOLAR` modules emit both PGN 127506 and PGN 127508 by
design. Different consumers read different PGNs: Garmin chartplotters consume
PGN 127508 (voltage / current / temperature) and ignore PGN 127506, while
Victron Cerbo GX, Maretron N2K-View, Yacht Devices YDBM-01, and the Signal K
data browser read PGN 127506 for state-of-charge, state-of-health, and
time-remaining. Leave both enabled unless a downstream display reacts badly to
one of them.

## Safety and Communications

| PGN | Description | Module |
|--------|-------------|--------|
| 126464 | PGN List (transmit/receive) | `pgnList.ts` |
| 126983 | Alert | `notifications.ts` |
| 126985 | Alert Text | `notifications.ts` |
| 126992 | System Time | `systemTime.ts` |
| 129799 | Radio Frequency/Mode/Power | `radioFrequency.ts` |
| 129808 | DSC Call Information (re-emits decoded inbound DSC traffic to the bus) | `dscCalls.ts` |

`dscCalls.ts` re-emits decoded inbound DSC traffic onto the NMEA 2000 bus; it
does not synthesize distress calls. The conversion reads
`communication.dsc.callType`, `communication.dsc.mmsi`, and
`communication.dsc.nature` (published by DSC-aware upstream Signal K providers
when a VHF radio reports an incoming DSC message) and forwards them as PGN
129808 so non-DSC-aware MFDs on the bus can display the alert.

## Vendor-Specific

| PGN | Description | Module |
|--------|-------------|--------|
| 65288 | Raymarine (Seatalk) Alarms | `raymarineAlarms.ts` |
| 126720 | Raymarine Display Brightness | `raymarineBrightness.ts` |

## Bus-layer (announced in the transmit PGN list, not emitted by this plugin)

These appear in PGN 126464's transmit list, but the plugin itself does not
generate them. The ISO entries are handled by Signal K's NMEA 2000 stack at the
bus layer. PGN 126993 (Heartbeat, ~60 s nominal) and PGN 126996 (Product
Information, on address claim and on every ISO request for product info) are
auto-emitted by canboatjs's `N2kDevice`. Advertising 126993 is what keeps
Garmin chartplotters from ageing the device out of their Network panel after
about 30 s.

| PGN | Description |
|--------|-------------|
| 59392 | ISO Acknowledgement |
| 59904 | ISO Request |
| 60928 | ISO Address Claim |
| 126993 | Heartbeat (canboatjs auto-emit) |
| 126996 | Product Information (canboatjs auto-emit) |

## Data Flow

```
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
