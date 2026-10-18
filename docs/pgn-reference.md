# PGN Reference

The plugin has 88 configurable data conversions covering 63 data PGNs, plus an
89th module that broadcasts PGN 126464. Its transmit list advertises only PGNs
owned by this plugin. Standard fields, ranges, and enum values are validated
against the bundled Canboat definitions.
Display support remains model-specific and should be checked against the
receiving device's PGN list. The [vendor receive lists](#vendor-receive-lists)
section summarizes what Garmin, Raymarine, B&G, and Furuno publish, and each
conversion's editor in the configuration panel shows the same summary as one
badge per vendor.

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

`GNSS_DOPS` emits HDOP and derives VDOP when both Signal K HDOP and PDOP are
valid. PDOP alone has no direct PGN 129539 field and does not produce an empty
frame. `GNSS_SATELLITES` subscribes to the composite satellites-in-view list;
the scalar satellite count cannot replay previously cached satellite details.

`DIRECTION_DATA` accepts bus-origin COG only from PGN 129026 and bus-origin
heading only from PGN 127250. Received PGN 130577 and unknown source PGNs remain
blocked, which permits native instruments without feeding the aggregate output
back into itself. Its four live inputs expire after ten seconds.

Route broadcasts and Route and WP Service PGNs such as 129285, 130067, and
130074 require a complete, versioned route transaction or a directed complex
request exchange. The removed implementations could not provide that lifecycle
or register the service through the current plugin API, so the plugin does not
advertise unreliable route transfer. PGN 129284 continues to carry active
next-waypoint navigation data.

`VESSEL_SPEED_COMPONENTS` maps the canonical longitudinal and transverse
water-referenced paths in SI meters per second. The newest Garmin chartplotter
lists, the Raymarine Axiom, B&G Zeus3S and Vulcan, and Furuno TZtouch lists
receive PGN 130578; older Garmin models, the Raymarine i70s, and the Furuno
FI-70 do not.

`DISTANCE_LOG` emits the total and trip values from `navigation.log` and
`navigation.trip.log`. Some instruments reset a trip log by sending a directed
PGN 126208 command for field 4 of PGN 128275. Signal K's NMEA 2000 stack receives
the Group Function message but returns `PGN Not Supported`; it does not expose
that command to this plugin. Reset the trip path at its upstream source instead.

## AIS

| PGN | Description | Module |
| -------- | ------------- | -------- |
| 129038 | Class A Position Report | `ais.ts` |
| 129039 | Class B Position Report | `ais.ts`, `aisExtended.ts` |
| 129040 | Class B Extended Position Report | `aisExtended.ts` |
| 129041 | AtoN (Aids to Navigation) | `ais.ts` |
| 129793 | UTC and Date Report (base stations) | `ais.ts` |
| 129794 | Static and Voyage Data | `ais.ts` |
| 129798 | SAR Aircraft Position | `aisExtended.ts` |
| 129802 | Safety Related Broadcast (regulated transmission, see note below) | `aisExtended.ts` |
| 129809 | Class B Static Data, Part A | `ais.ts` |
| 129810 | Class B Static Data, Part B | `ais.ts` |

The remote-target relay in `ais.ts` recognizes canonical `updates[].$source`,
structured source data, and the server sources tree. It removes only NMEA
2000-origin updates, preventing received AIS targets from being echoed while
retaining safe plugin updates carried in the same delta. AIS base stations
leave as PGN 129793 whichever way Signal K files them: the NMEA 2000 decoder
puts them under `shore.basestations`, while the NMEA 0183 parser puts message 4
under `atons` with `sensors.ais.class` set to `BASE`. Before this, a base
station from an NMEA 0183 AIS receiver reached the bus as an aid to navigation.
The station's own UTC time and date go out as not available, because Signal K
keeps only its position and the reception time is this server's clock. The B&G
Zeus3S and Vulcan, the Raymarine Axiom, and the Furuno TZtouch displays list
PGN 129793; Garmin's lists do not. The own-vessel
conversions in `aisExtended.ts` use the normal per-path source filters available
in the configuration panel.

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
| 127496 | Vessel Trip Parameters (fuel remaining, time to empty, distance to empty) | `vesselTrip.ts` |
| 127497 | Engine Trip Parameters (fuel used, fuel rate average/economy/instantaneous) | `engineTrip.ts` |
| 127498 | Engine Configuration (per-engine static identity: rated RPM, VIN, software version) | `engineStatic.ts` |
| 130576 | Small Craft Status | `smallCraftStatus.ts` |

PGN 127493 represents `discreteStatus1` as a Canboat bit lookup. With no active
transmission faults, the conversion supplies an empty flag array. The current
canboatjs decoder returns that empty byte as numeric zero, which is equivalent
on the wire.

`VESSEL_TRIP` is an opt-in aggregate. Configure every fuel tank that contributes
to vessel range and every engine that consumes from those tanks. Remaining fuel
uses each tank's canonical `currentVolume`, with `currentLevel * capacity` as a
fallback, and converts Signal K cubic meters to NMEA 2000 liters. Time to empty
divides aggregate remaining volume by aggregate positive `fuel.rate`; distance
to empty multiplies that duration by `navigation.speedOverGround`. A missing
tank suppresses the frame because a partial total understates remaining fuel. A
missing engine rate suppresses time and distance because partial consumption
overstates range. Zero consumption emits remaining fuel without a range.

PGN 127496's `tripRunTime` field remains unavailable because neither Canboat nor
Signal K defines a safe mapping from a navigation trip reset to propulsion
runtime. The conversion recomputes once per second from freshness-checked tank,
fuel-rate, and speed values instead of replaying a cached estimate. Static tank
capacity remains available while dynamic values age out.

Tank status, engine fuel rate, and GNSS speed may legitimately originate on the
NMEA 2000 bus. They are safe inputs because PGN 127496 does not decode back to
those Signal K paths, so the conversion permits them without weakening the echo
guard for conversions that could feed themselves.

Treat every output as advisory. The calculation does not subtract unusable
reserve, include non-propulsion consumers such as generators or heaters, model
cross-feed or unequal tank depletion, or account for weather and tide. Raymarine
Fuel Manager must also be configured, and its displays require fuel data from
either PGN 127489 (Fuel Flow Rate) or PGN 127497 (Fuel Used), plus PGN 129026
with GNSS for Distance to Empty. Configure and enable `ENGINE_PARAMETERS` or
`ENGINE_TRIP`, plus `COG_SOG`, when this plugin must provide those messages.

Only Raymarine lists PGN 127496 as received (the Axiom and the i70s). The
current Garmin, B&G, Furuno, and Maretron lists omit it. Confirm support and
prerequisites for the receiver model and firmware in use.

## Environmental

| PGN | Description | Module | Status |
| -------- | ------------- | -------- | -------- |
| 130306 | Wind Data (apparent, true ground, true water, weather-forecast apparent, and model-specific Garmin forecast compatibility) | `wind.ts`, `windTrueGround.ts`, `windTrueWater.ts`, `windWeatherApparent.ts`, `windWeatherTrue.ts`, `windData.ts` | Current |
| 130310 | Environmental Parameters (obsolete) | `seaTemp.ts` | Obsolete, retained for compatible legacy instruments |
| 130311 | Environmental Parameters (temperature, humidity, and pressure) | `environmentParameters.ts` | Deprecated, retained for Raymarine i70 and i70s compatibility |
| 130312 | Temperature (exhaust and general-purpose sources) | `engineParameters.ts`, `temperature.ts` | Deprecated, replaced by 130316 |
| 130313 | Humidity (inside/outside) | `humidity.ts` | Current |
| 130314 | Actual Pressure (atmospheric) | `pressure.ts` | Current |
| 130316 | Temperature, Extended Range | `temperature.ts` | Current (preferred by modern Garmin) |

**Recommended for new installs**: enable the `TEMPERATURE2_*` (PGN
130316), `HUMIDITY_OUTSIDE` (PGN 130313), `PRESSURE` (PGN 130314), `WIND` /
`WIND_TRUE_GROUND` / `WIND_TRUE` (PGN 130306) conversions, plus
`TEMPERATURE_SEA` (PGN 130312) for a Garmin chartplotter, and leave the other
deprecated `TEMPERATURE_*` (130312) conversions and `ENVIRONMENT_PARAMETERS`
(130311) disabled. Confirm the exact received-PGN list for the chartplotter model and
firmware in use. The legacy and deprecated variants remain available for older
displays that do not read the newer PGNs.

Water temperature uses the canonical Signal K path
`environment.water.temperature`. Select `TEMPERATURE2_SEA` for PGN 130316 on a
modern receiver. `TEMPERATURE_SEA` emits the same path on the superseded PGN
130312 for a receiver that still requires it, and obsolete `SEA_TEMP` emits PGN
130310 only when enabled manually. The Environmental preset selects both
`TEMPERATURE2_SEA` and `TEMPERATURE_SEA`, for the Garmin reason below, and
leaves PGN 130310 off.

Live well and bait well temperatures read `tanks.liveWell.0.temperature` and
`tanks.baitWell.0.temperature`, the tank paths Signal K defines for them, and
leave with the `Live Well Temperature` and `Bait Well Temperature` source
types.

**Garmin water temperature**: Garmin's Technical Reference for NMEA 2000
Products (September 2021) reads water temperature from PGN 130310, 130311, or
130312, and lists PGN 130316 for air temperature only. If a Garmin display
would otherwise show no water temperature from `TEMPERATURE2_SEA`, so the
Environmental preset also enables `TEMPERATURE_SEA`, the one PGN 130312
conversion it turns on. Current Garmin receive lists include PGN 130316 without
saying which temperature sources each model renders, so confirm the behavior
on the model and firmware in use. Configuring conversions one at a time,
enable `TEMPERATURE_SEA` by hand for a Garmin display.

**Raymarine i70 and i70s environmental data**: Raymarine's
[supported-PGN list](https://docs.raymarine.com/87425/en-US/latest/SupportedNMEA2000PGNlist-AA8295AC.html)
includes PGNs 130310, 130311, 130312, and 130316 as received messages, and
lists neither PGN 130313 nor PGN 130314. PGN 130311 is therefore the i70s
path for outside humidity and atmospheric pressure, which matches field
testing that found it the reliable combined path for outside temperature,
outside humidity, and atmospheric pressure. Enable
`ENVIRONMENT_PARAMETERS`, map the desired Signal K sources, and select the
temperature and humidity source types in its editor. The conversion prefers
`environment.outside.relativeHumidity` over the legacy
`environment.outside.humidity` path when both publish. Keep the dedicated modern
conversions enabled for other receivers, and verify behavior against the exact
instrument firmware in use.

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
are unaffected. The Raymarine Element list includes none of PGNs 130313,
130314, and 130316, so the preset is unverified on Element displays.

**Forecast wind on a vessel with no anemometer**: the weather plugin's wind is a
ground-true wind (speed over ground plus a compass direction). `WIND_TRUE_GROUND`
emits it on PGN 130306 with reference `True (ground referenced to North)`. On the
tested ECHOMAP UHD2 model and firmware, that reference appeared as Ground Wind,
while `True (water referenced)` populated True Wind Speed, True Wind Direction,
and Wind VMG. Garmin's published PGN list does not document behavior for each
wind-reference enum, so verify this compatibility mode against the receiving
model and firmware. Garmin's technical reference also describes its
chartplotters deriving true wind speed, true wind angle, and wind VMG from PGN
130306 apparent wind plus PGN 128259 water speed, or plus PGN 129026 and PGN
129029 when no water speed sensor is present. `WIND_WEATHER_TRUE` computes the relative angle (TWA =
`environment.wind.directionTrue` minus `navigation.headingTrue`) and emits the
forecast using that water-reference value. This is a display approximation
because the forecast remains ground referenced; do not enable it alongside real
wind or water-speed sensors. It needs a true heading and, like
`WIND_WEATHER_APPARENT`, is opt-in and disabled by default. The heading may come
from an NMEA 2000 sensor such as a Garmin GPS24xd. Emitter Cannon treats that PGN
127250 heading as a supporting input for this conversion only; it still blocks
NMEA 2000 wind inputs that could be echoed back as PGN 130306.

The normal `WIND_TRUE` conversion retains Signal K's established NMEA decoder
mapping: canonical `environment.wind.angleTrueWater` and
`environment.wind.speedTrue` use the Canboat label `True (boat referenced)`.
The forecast compatibility conversion intentionally uses the distinct
`True (water referenced)` enum value used by the tested Garmin setup. The two
remain mutually exclusive because they would supply different producers to the
same true-wind display fields.

Live PGN 130306 angle and speed inputs expire after ten seconds. Forecast angle,
direction, and speed inputs expire after 125 seconds to accommodate a 60-second
weather rebroadcast cadence plus scheduler jitter. The live true heading used
by `WIND_WEATHER_TRUE` still expires after ten seconds. Resend ticks reapply each
input's freshness window. The configuration panel blocks `WIND` together with
either forecast compatibility producer, and it does the same for `WIND_TRUE`.
The two real-wind producers may run together, as may the two forecast
compatibility producers. Runtime startup keeps real-data producers and rejects
conflicting forecast producers if a manually edited configuration mixes them.

## Electrical Systems

| PGN | Description | Module | Status |
| -------- | ------------- | -------- | -------- |
| 127503 | AC Input Status | `acStatus.ts` | Deprecated, retained for compatible receivers |
| 127504 | AC Output Status | `acStatus.ts` | Deprecated, retained for compatible receivers |
| 127501 | Binary Switch Bank Status | `switchBank.ts` | Current |
| 127505 | Fluid/Tank Level | `tanks.ts` | Current |
| 127506 | DC Detailed Status (state of charge) | `battery.ts` | Current |
| 127507 | Charger Status | `chargerStatus.ts` | Deprecated, retained for compatible receivers |
| 127508 | Battery Status (voltage/current) | `battery.ts`, `solar.ts` | Current |
| 127509 | Inverter Status | `inverterStatus.ts` | Deprecated, retained for compatible receivers |
| 127751 | DC Voltage/Current | `dcVoltageCurrent.ts` | Current |

The NMEA 3.002 Network Message Database marks PGNs 127503, 127504, 127507, and
127509 deprecated. They remain available because the current Garmin
chartplotter, Raymarine Axiom, and B&G Zeus3S and Vulcan receive lists still
include them, while the newer electrical PGN families are not yet complete in
the bundled Canboat database. Enable them only
when the receiving equipment requires them.

The `BATTERY` module emits both PGN 127506 and PGN 127508 by design. The
current Garmin, Raymarine, and B&G lists include both PGNs, as does the Furuno
TZT X series; the Furuno TZtouch3 F series and the FI-70 list neither. PGN 127508 carries voltage, current, and
temperature. PGN 127506 carries state-of-charge, state-of-health, and
time-remaining. Leave both `BATTERY` PGNs enabled unless the exact receiving
device documentation says otherwise. `SOLAR` emits PGN 127508 only, one frame
for the charger instance and one for the panel instance; it has no
state-of-charge frame. Give every PGN 127508 instance a value no other device
on the bus sends: Victron documents that two sources sharing a battery instance
make a display alternate between their readings, and the plugin's own
configuration check only covers the instances it emits.

`AC_STATUS` maps `electrical.ac.<id>.phase.<single|A|B|C>` to input or output
status. Input rows require an explicit acceptability setting because PGN
127503 has no unknown value for that field. `CHARGER_STATUS` maps unambiguous
Signal K `chargingMode` and `chargerRole` values and links each charger to its
configured battery instance. `INVERTER_STATUS` maps the unambiguous
`inverting`, `disabled`, and `faulted` Signal K modes and leaves other modes
unavailable instead of guessing at an NMEA 2000 state.

`SWITCH_BANK` reports switch states on PGN 127501. Each mapping row names a
switch under `electrical.switches.<id>`, the path Signal K's NMEA 2000 decoder
writes for a received bank and the one switch provider plugins publish to, plus
a bank instance and a channel from 1 to 28. Rows that share a bank instance
leave as one frame. A state of `1` or `true` is On and `0` or `false` is Off;
anything else, including a state older than a minute, goes out as not
available. The conversion only reports: it sends no PGN 127502 switch command.
Every current Garmin chartplotter list and the B&G Zeus3S and Vulcan list PGN
127501, as part of their own digital switching. No vendor documents whether a
display shows a bank from another sender, so confirm on the display, and give
each bank an instance no switching device on the bus already uses.

`DC_VOLTAGE_CURRENT` reports a DC source that is not a battery, such as an
alternator, a DC-DC converter, or a DC bus, on PGN 127751. Each row names
`electrical.<group>.<id>` and a connection number, and the conversion reads
its `voltage` and `current`. The Raymarine Axiom and the Maretron DSM410 list
PGN 127751. Signal K's own decoder keys a received PGN 127751 by the sender's
bus address rather than by connection number, so another Signal K server
reading these frames files them under `electrical.dc.<address>.<connection>`.

## Safety and Communications

| PGN | Description | Module |
| -------- | ------------- | -------- |
| 126464 | Transmit PGN List | `pgnList.ts` |
| 126983 | Alert | `notifications.ts` |
| 126985 | Alert Text | `notifications.ts` |
| 126992 | System Time | `systemTime.ts` |
| 129033 | Time and Date from GNSS data, local offset unavailable | `timeDate.ts` |
| 129799 | Radio Frequency/Mode/Power | `radioFrequency.ts` |
| 129808 | DSC Distress Call Information (re-emits decoded inbound distress traffic) | `dscCalls.ts` |

The standard alert and Raymarine alarm conversions process every value in a
batched Signal K delta. A `value: null` removal clears the cached alarm by path,
and publisher pins plus the NMEA 2000 echo guard are applied before the batch
reaches either conversion.

`TIME_DATE` reads the canonical UTC `navigation.datetime` path and leaves the
PGN 129033 local-offset field unavailable because Signal K does not publish
that offset. Raymarine, B&G, and Furuno lists include PGN 129033. Current Garmin
lists omit it, and Garmin's technical reference takes the chartplotter's time
and date from PGN 129029, which `GPS` emits.

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

The runtime uses canonical `$source` values, optional structured source
metadata, and the server sources tree to identify known NMEA 2000-origin DSC
values before they reach the mapper. This prevents a recognized PGN 129808
input from being emitted back onto the same bus. An optional publisher pin can
further restrict the input to an off-bus VHF integration. Leave `DSC_CALLS`
disabled when no DSC-aware non-NMEA 2000 provider publishes the three required
paths.

## Vendor-Specific

| PGN | Description | Module |
| -------- | ------------- | -------- |
| 65288 | Raymarine SeaTalk Alarms | `raymarineAlarms.ts` |
| 126720 | Raymarine Display Brightness | `raymarineBrightness.ts` |

Raymarine's published PGN lists omit proprietary messages, so support for both
rests on field reports. The LightHouse 4 Axiom documentation names PGNs 126983
and 126985 (from LightHouse 4.8.164) and PGN 127489 as its alert sources, so
prefer the `NOTIFICATIONS` conversion on Axiom displays and keep
`RAYMARINE_ALARMS` for older SeaTalk equipment that needs it.

## Provider capability boundary

The PGN 126464 broadcast does not advertise transport-layer PGNs such as ISO
Acknowledgement, ISO Request, Address Claim, Group Function, Heartbeat, Product
Information, or Configuration Information. A Signal K provider may emit some
of those PGNs independently, but the server's output-ready event does not
identify the provider or expose its capabilities. Advertising them here would
therefore make an unverified device capability claim.

When PGN_LIST is enabled, the plugin broadcasts its complete PGN 126464 list at
startup and every five minutes afterward. If the selected Signal K output uses
Canboat's N2kDevice, that provider may answer a directed ISO Request for 126464
from its own static transmit list. The plugin API cannot extend that provider
list, so a directed response may omit plugin-owned PGNs even though the periodic
broadcast includes them. Other output providers may not answer the request.

## Vendor receive lists

These are the official receive lists read on 2026-10-17. A PGN missing from a
list does not prove a display ignores it, and a listed PGN does not prove every
field renders. In the configuration panel, a vendor badge reads listed when
every documented model below receives the conversion's PGNs, limited when only
some models do or the vendor reads only part of the data, and not listed when
none do. `src/api/vendorSupport.ts` holds the table, and a test fails when a
conversion emits a PGN that was not checked against it.

| Vendor | Models | Document | Revision |
| -------- | ------------- | -------- | -------- |
| Garmin | GPSMAP 8400/8600/8700, 16x3 to 7x3, 9000 and 9500, 8x10 to 8x16, 10x2 and 12x2, and ECHOMAP Ultra 2 | "NMEA 2000 PGN Information" in each owner's manual or installation instructions on manuals.garmin.com | August 2024 to September 2026 |
| Garmin | All chartplotters | [Technical Reference for Garmin NMEA 2000 Products](https://www8.garmin.com/manuals/webhelp/GUID-1415AAD0-FE63-42A6-8F8D-DB713D616122/EN-US/Technical_Reference_for_Garmin_NMEA_2000_Products_EN-US.pdf) | v1, September 2021 |
| Raymarine | Axiom family on LightHouse 4 | [NMEA 2000 PGN support](https://docs.raymarine.com/81406/en-US/latest/NMEA2000PGNSupport-946047B8.html) | Document 81406, revision 30 |
| Raymarine | i70s | [Supported NMEA 2000 PGN list](https://docs.raymarine.com/87425/en-US/latest/SupportedNMEA2000PGNlist-AA8295AC.html) | Document 87425, revision 2 |
| Raymarine | Element (context only) | [NMEA 2000 PGNs](https://docs.raymarine.com/81388/en-US/latest/NMEA2000PGNs-09B8DE01.html) | Document 81388, revision 18 |
| B&G | Zeus3S and Vulcan | Zeus3S Installation Manual 988-12599-002 and the Vulcan Series Installation Manual, PGN appendix | 2020 and 2021 |
| Furuno | TZtouch3 TZT12F, TZT16F, and TZT19F | Installation Manuals IME-45100, IME-45110, and IME-45120 | Revisions C and D1 |
| Furuno | TZT10X, TZT13X, TZT16X, TZT22X, and TZT24X | Installation Manuals IME-45260 and IME-45240 | November 2024 |
| Furuno | FI-70 | Product specification sheet | Undated |
| Maretron | DSM410 (context only) | User's Manual | Revision 1.7.2, 2017 |

What the lists show:

- Every vendor lists the core navigation, engine, tank, AIS position, wind,
  and temperature PGNs.
- Garmin lists none of PGNs 127496, 127497 (its chartplotters transmit it),
  127751, 129033, 129291, 129301, 129302, and 129793. The newest three Garmin lists move PGN
  127258 to the transmit table, drop PGN 130577, and add PGN 130578.
- Raymarine lists none of PGNs 127252, 127501, 128000, 129302, and 129799.
  The Axiom lists PGN 127258 as transmit only and is the only Raymarine list
  with PGNs 127751 and 129793, and the i70s lacks PGNs 126983, 126985, 126992,
  130313, and 130314.
- B&G lists none of PGNs 126983, 126985, 127496, 127497, 127498, 127751,
  128000, 129291, 129301, 129302, and 129799. The Simrad and Lowrance lists for the
  same platform could not be read and are not verified.
- Furuno lists none of PGNs 126983, 126985, 127496, 127501, 127504, 127507,
  127509, 127751, 128000, 128275, 129301, 129302, 129539, and 129799. The FI-70
  lacks PGNs 129793 and 130314.
- The Maretron DSM410 list includes no AIS PGNs and no standard alerts; its
  alerts are proprietary.
- No receive list was found for Garmin GNX instruments, GHC autopilots, or the
  Reactor CCU; B&G Triton2 or H5000; Simrad NSX or NSS; Lowrance HDS or Elite;
  Raymarine Alpha, EV-1, or p70s; Furuno NavPilot; Humminbird; Mercury
  VesselView; or Yamaha Helm Master. Only bus captures can settle what those
  devices read.

## Evaluated but Deferred

- **PGN 130060, Label** could name the `SWITCH_BANK` channels, but Canboat
  lacks its fields, field lengths, and resolution, so there is no wire layout to
  encode.
- **PGN 127233, Man Overboard Notification** is deliberately deferred. It is
  safety-critical and needs emitter identity, position-source provenance,
  lifecycle handling, and directed request behavior that the current plugin
  does not expose reliably.
- **PGNs 127510, 127511, and 127513**, the charger, inverter, and battery
  configuration frames, are complete in Canboat but omitted from the Garmin,
  B&G, and Furuno receive lists; only the Raymarine Axiom lists them. Signal K also lacks enough canonical control,
  chemistry, equalization, load-sense, and efficiency fields to populate them
  without guessing.
- **PGNs 127490, 127491, 127494, 127495, 128002, 128003, and 128780**, covering
  electric-drive, energy-storage, and linear-actuator data, appear in eight of
  the nine current Garmin chartplotter lists and, except PGN 127495, in the
  Raymarine Axiom list. Canboat still marks their fields, field lengths,
  resolution, and intervals incomplete, so emitting them would depend on
  unstable wire definitions.
- **PGN 128777, Windlass Operating Status**, has a complete Canboat field layout
  and the Raymarine Axiom receives it for its chain counter, but its priority
  and interval remain unspecified. Signal K also lacks a
  canonical windlass schema, so emitting it would require a bespoke data model
  and uncertain transport behavior.
- **PGNs 126987 and 126988**, Alert Threshold and Alert Value, remain incomplete
  in Canboat and lack canonical Signal K inputs for their alert-limit fields.
- **PGN 129801, AIS Addressed Safety Related Message**, needs a destination,
  sequence lifecycle, source provenance, and licensed-transmitter controls that
  this plugin does not provide.
- **PGNs 127744 to 127750**, the per-phase AC and converter status frames,
  are received by the Raymarine Axiom, and Victron has moved its own output
  from PGNs 127503 and 127507 to PGNs 127744 and 127750. Canboat lacks only
  their transmit intervals, but the Axiom also receives PGNs 127503, 127504,
  127507, and 127509, which the plugin already sends with the same data, and no
  other vendor list includes the newer frames. They would add a second copy of
  each reading for one receiver.
- **PGN 129044, Datum**, is complete in Canboat and listed by the older Garmin
  chartplotters and Raymarine. Every position this plugin emits is WGS 84,
  which receivers assume without the frame, so it adds little.
- **PGNs 129538, 129542, 129545, 129547, 129550, and 129551**, the GNSS control,
  integrity, and differential correction frames, are received by several
  displays, but Signal K has no source for their fields.
- **PGN 127237, Heading/Track Control**, is received by every vendor. It carries
  autopilot commands and status, and a non-autopilot source emitting it could
  confuse or steer an autopilot, so the plugin deliberately does not emit it.

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
