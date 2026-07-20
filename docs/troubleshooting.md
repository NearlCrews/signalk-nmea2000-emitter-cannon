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

The **Environmental** preset chip enables the temperature, pressure, humidity,
and sea-temperature conversions, but not `WIND_TRUE_GROUND` (PGN 130306). A
weather source such as `signalk-virtual-weather-sensors` publishes its wind on
`environment.wind.speedOverGround` and `environment.wind.directionTrue`, which
only `WIND_TRUE_GROUND` converts. After applying the Environmental preset,
enable `WIND_TRUE_GROUND` by hand if you want forecast wind on the bus.

## Forecast wind shows as Ground Wind, but True Wind Speed stays blank on a Garmin

`WIND_TRUE_GROUND` emits PGN 130306 with reference `True (ground referenced to
North)`. A Garmin maps that reference to its Ground Wind fields, not True Wind,
and fills True Wind Speed/Angle either from a `True (boat referenced)` source or
by computing it from apparent wind plus boat speed (speed through water). With no
masthead anemometer and no speed sensor, the True Wind fields have nothing to draw
from, so they stay blank even though the wind is on the bus.

Enable `WIND_WEATHER_TRUE`. It computes the boat-referenced true wind angle
(`environment.wind.directionTrue` minus `navigation.headingTrue`) and emits PGN
130306 with reference `True (boat referenced)`, which populates the Garmin's True
Wind Speed/Angle directly. It needs a true heading on the bus to produce an angle;
if only magnetic heading is available, make sure the server derives
`navigation.headingTrue` (heading plus magnetic variation) first.

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

Source filters bind to a literal `$source` value. If you decommission or rename
a Signal K plugin, filters pointing at it become silent gates: the conversion
looks enabled but drops every delta. Audit periodically by comparing the saved
filter value to what's currently on the bus:

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
