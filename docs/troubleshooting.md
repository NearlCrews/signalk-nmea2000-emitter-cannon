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

## The Environmental preset enables temperature, pressure, and humidity but not wind

The **Environmental** preset chip enables the temperature, pressure, humidity,
and sea-temperature conversions, but not `WIND_TRUE_GROUND` (PGN 130306). A
weather source such as `signalk-virtual-weather-sensors` publishes its wind on
`environment.wind.speedOverGround` and `environment.wind.directionTrue`, which
only `WIND_TRUE_GROUND` converts. After applying the Environmental preset,
enable `WIND_TRUE_GROUND` by hand if you want forecast wind on the bus.

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
