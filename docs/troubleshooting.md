# Troubleshooting

## PGN not appearing on the NMEA 2000 bus

- Check the Signal K server log for plugin errors.
- Confirm the relevant conversion is enabled in the admin UI.
- Confirm Signal K is publishing the source path you expect (verify with the
  Signal K data browser).
- **Check that any source filter you've set still matches a live `$source`.** A
  source filter that points at a decommissioned plugin or a device that no
  longer publishes the path silently rejects every delta and the conversion
  appears to be enabled but emits nothing. Audit with:

  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" \
    "http://localhost:3000/signalk/v1/api/vessels/self/<path>" \
    | jq -r '."$source"'
  ```

  Compare the result to the filter value saved in the admin UI for that
  conversion.

The conversion row and Status view narrow this down further:

- **Waiting for Signal K input** means none of the required paths has delivered
  a value since the plugin started.
- **Publisher filter does not match** means values reached the path, but the
  configured `$source` rejected them. Select the correct publisher id or use
  **All publishers**.
- **Publisher lookup unavailable** means the panel could not verify the saved
  filter against the server model. It does not mean the publisher is wrong.
  Use Retry after checking the server connection.
- **NMEA 2000 echo blocked** means the input was authoritatively identified as
  received NMEA 2000 traffic. Use an off-bus Signal K producer if the value must
  be sent to the bus.
- **Input received; no encodable output** means values arrived, but the current
  combination was incomplete, stale, out of range, or did not map to a valid
  PGN payload.
- **Previously active input is stale** names a path that delivered values during
  this plugin run but exceeded the conversion's freshness timeout. Cached resend
  output does not hide this warning.
- **Expected activity overdue** means a configured timer, refresh, or resend
  schedule has missed three expected intervals.
- **Emitting** means output activity is current. Factory conversions also show
  each mapping row and each path's last-seen age. The NMEA 2000 readiness
  indicator must be ready for output to reach the bus.

## A Signal K path was entered as the publisher, and the conversion is silent

The input path and publisher are different Signal K concepts. The conversion's
input path is fixed by the Signal K data model. The optional publisher field
filters the update's `$source` value and does not replace or redirect the path.
Its default, **All publishers**, is correct unless two producers publish the
same path and one must be selected.

The panel blocks Save when a publisher filter repeats its own Signal K input
path. A different path in the publisher field is also incorrect, but cannot be
identified statically because publisher ids are operator- and provider-defined.
The live mismatch warning identifies that case once the server publisher list
loads.

Publisher filters also apply to wildcard notification subscriptions and other
whole-delta conversions. Older configurations may contain a dotless form of a
path from the legacy settings UI. Selecting a new publisher or **All
publishers** removes that legacy key as well as the current canonical key.

For example, the Outside Temperature conversion subscribes to
`environment.outside.temperature`. Entering `environment.water.temperature` in
its publisher field rejects the actual publisher because that string is a path,
not a `$source` id. Clear the filter, then enable the conversion whose fixed
input path matches the data you intend to send.

## Water temperature is visible in Signal K but does not emit

The [Signal K environment schema](https://github.com/SignalK/specification/blob/master/schemas/groups/environment.json)
defines water temperature and outside air temperature as different paths. Use
`environment.water.temperature` for water and
`environment.outside.temperature` for outside air. A publisher filter cannot
remap between them.

For a modern receiver, enable **Sea Temperature (PGN 130316)**
(`TEMPERATURE2_SEA`). The Environmental preset enables this conversion. If an
older instrument does not receive PGN 130316, manually enable **Sea Temperature
(PGN 130312)** (`TEMPERATURE_SEA`). Enable obsolete PGN 130310 (`SEA_TEMP`) only
for a receiver that specifically requires that combined legacy frame.

## A Venus secondary battery voltage shows no recent output

The Venus plugin publishes a shunt's secondary and third DC channels with
instance ids such as `258-second` and `258-third`. Although the
[Signal K electrical schema](https://github.com/SignalK/specification/blob/master/schemas/groups/electrical.json)
documents alphanumeric instance ids, these hyphenated paths are established
Venus output and are accepted for compatibility. The upstream naming problem
is tracked in
[signalk-venus-plugin issue 26](https://github.com/sbender9/signalk-venus-plugin/issues/26).

In the Battery mapping, enter only the instance id between
`electrical.batteries` and the measurement name. For example, map
`electrical.batteries.258-second.voltage` as `258-second`. Do not enter
`258-second.voltage` or the full path because Emitter Cannon appends
`.voltage`, `.current`, and the other battery measurement names itself.

## A mapped asset is found, but the conversion is still silent

**Asset found** means the Signal K server path inventory contains at least one
path below the configured asset id. It does not by itself prove that the exact
measurement needed by the conversion is present. The next line in the mapping
row reports whether a required input, such as battery voltage, inverter mode,
or engine fuel rate, was found.

Use **Refresh path inventory** after starting or reconfiguring a sensor. The inventory
also refreshes automatically. If discovery fails, the existing suggestions are
retained and **Retry path inventory** appears with the error. Publisher filters for
mapped paths are under **Advanced publisher filters** and should normally stay
on **All publishers**.

## Multiple inside temperatures do not show on a Raymarine Axiom or i70

Field-tested Axiom and i70 installations render the `Inside Temperature` source
and the `Inside` humidity source, and separate multiple sensors by NMEA 2000
instance rather than by source type. Firmware and model behavior can vary. A
`Refrigeration Temperature`,
`Freezer Temperature`, `Main Cabin Temperature`, or `Engine Room Temperature`
frame is on the bus but the display drops it, so only one inside temperature
ever appears.

Apply the **Raymarine** preset chip. It enables the inside-family temperatures
and inside humidity and remaps them onto the `Inside` source at distinct
instances 0 to 4 (humidity at 0), which is what these displays need to list them
separately. Save after applying. To do it by hand instead, open each
temperature's editor, set its Source Type to `Inside Temperature`, and give each
one a different instance in the 0 to 9 range; pair the inside humidity instance
to the matching temperature. Note that the per-conversion instance is emitted on
PGN 130316 (the `TEMPERATURE2_*` conversions), which is the frame Axiom reads for
inside temperatures.

## The Environmental preset enables temperature, pressure, and humidity but not wind

The **Environmental** preset chip enables the modern PGN 130316 temperature
conversions, including sea temperature, plus current pressure and humidity. It
does not enable superseded PGN 130312, obsolete PGN 130310, or
`WIND_TRUE_GROUND` (PGN 130306). A
weather source such as `signalk-virtual-weather-sensors` publishes its wind on
`environment.wind.speedOverGround` and `environment.wind.directionTrue`, which
only `WIND_TRUE_GROUND` converts. After applying the Environmental preset,
enable `WIND_TRUE_GROUND` by hand if you want forecast wind on the bus.

## Forecast wind shows as Ground Wind, but True Wind Speed stays blank on a Garmin

`WIND_TRUE_GROUND` emits PGN 130306 with reference `True (ground referenced to
North)`. On the tested ECHOMAP UHD2 setup, that reference appeared in the Ground
Wind fields rather than the True Wind fields. Garmin normally computes True Wind
from apparent wind plus boat speed. With no masthead anemometer or water-speed
sensor, the True Wind fields can stay blank even though forecast wind is on the
bus.

Enable `WIND_WEATHER_TRUE`. It computes the relative true wind angle
(`environment.wind.directionTrue` minus `navigation.headingTrue`) and emits PGN
130306 with reference `True (water referenced)`. That reference populated True
Wind Speed, True Wind Direction, and Wind VMG on the tested ECHOMAP UHD2 setup,
but Garmin does not document enum-specific behavior, and results depend on the
chartplotter model and firmware. The conversion is a display compatibility
approximation because its forecast input remains ground referenced; do not
enable it alongside real wind or water-speed sensors. It needs a true heading
on the bus to produce an angle. If only magnetic heading is available, make
sure the server derives
`navigation.headingTrue` (heading plus magnetic variation) first. A true heading
from an NMEA 2000 sensor such as a Garmin GPS24xd is a safe supporting input.
Emitter Cannon consumes its PGN 127250 heading to derive the relative wind angle
but emits PGN 130306, so the path-aware echo guard permits the heading without
allowing received wind data to loop back onto the bus.

Do not mix the real-wind conversions (`WIND` or `WIND_TRUE`) with the forecast
compatibility conversions (`WIND_WEATHER_APPARENT` or `WIND_WEATHER_TRUE`).
They would present inconsistent real and forecast wind data on PGN 130306. The
two real conversions may run together, as may the two forecast conversions.
The panel blocks Save, and runtime startup rejects conflicting forecast members
if the configuration was edited outside the panel. Live wind inputs expire
after ten seconds. Forecast wind angle, direction, and speed inputs use a
125-second window for a 60-second weather rebroadcast cadence, while the live
heading required by `WIND_WEATHER_TRUE` still expires after ten seconds. A
resend cannot keep an expired input alive.

## Configuration changes don't take effect

Signal K reloads plugin configuration when you save it, but some changes (for
example, schema additions or new conversion modules) require a full Signal K
server restart before they appear.

## Plugin won't start

- Check the Signal K log for `NMEA 2000 Emitter Cannon` errors.
- A common cause is the NMEA 2000 output channel not being initialized: the
  plugin waits for the `nmea2000OutAvailable` event before emitting messages,
  so confirm your NMEA 2000 gateway is connected and Signal K has registered an
  output provider.

## AIS appears to not filter own vessel

The plugin uses `app.selfId` (the Signal K server's self identifier) to filter
own-vessel AIS deltas. If `selfId` isn't set on your Signal K server, AIS
conversions are skipped entirely. Verify the server has a self identifier
configured (usually the vessel's MMSI in urn form).

## No yellow delta-rate bar next to this plugin in the Signal K dashboard

Expected. The yellow bar in the Signal K admin dashboard's **Plugins activity**
section visualizes a plugin's `deltaRate`: the rate of Signal K deltas it
*produces* into the server via `app.handleMessage(pluginId, delta)`. This
plugin is an outbound emitter: it *consumes* Signal K data and writes NMEA 2000
messages out to the bus. Its activity is correctly reported through a different
API (`app.reportOutputMessages`) and appears as the plain **"X msg/s"** number
to the right of the plugin name. That's the right metric for a plugin of this
type; the bar will always be absent unless the NOTIFICATIONS conversion is
enabled and actively injecting alerts back into Signal K.

## Configuration hygiene

Source filters use an exact or dot-prefix match. A filter of `gps1` accepts both
`gps1` and child publishers such as `gps1.0`, but does not accept `gps10`. If you
decommission or rename a Signal K plugin, filters pointing at it become silent
gates: the conversion looks enabled but drops every delta. Audit periodically
by comparing the saved filter value to what's currently on the bus:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/signalk/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}' | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/signalk/v1/api/vessels/self/<path>" \
  | jq -r '."$source"'
```

If the live `$source` differs from your saved filter, the conversion is being
silently gated. Update the filter or clear it (blank = accept any). Conversions
with no published source for their path remain inert and cost nothing beyond
startup work; disable them if you know they won't see data on your boat.
