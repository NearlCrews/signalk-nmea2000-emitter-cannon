// Single source of truth for the panel's API base path. Used by
// useStatus(), useSources(), and PluginConfigurationPanel's metadata fetch.
// Keep in lockstep with API_PREFIX in src/api/router.ts: a divergence
// would 404 the panel's fetches against the live router.
export const PLUGIN_API_BASE = "/plugins/signalk-nmea2000-emitter-cannon/api";
