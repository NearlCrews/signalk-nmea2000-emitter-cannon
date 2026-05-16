import pkg from "../package.json" with { type: "json" };
import { Advisor } from "./advisor/advisor.js";
import { buildLiveInventory } from "./advisor/inventory.js";
import { createApiRouter } from "./api/router.js";
import { RootConfig } from "./config/schema.js";
import { PluginManager } from "./plugin-manager.js";
import type { SignalKApp, SignalKPlugin } from "./types/index.js";
import { errMessage } from "./utils/errorUtils.js";

// Read the runtime version from package.json so it stays in lockstep with
// the published version automatically. esbuild inlines the JSON into the
// bundle at build time, so there is no runtime FS read.
const PLUGIN_VERSION = pkg.version;

/**
 * Signal K to NMEA 2000 conversion plugin factory
 *
 * @param app - Signal K application instance
 * @returns Plugin instance
 */
export default function createPlugin(app: SignalKApp): SignalKPlugin {
	let pluginManager: PluginManager | null = null;

	// Persistent readiness state across PluginManager restarts.
	//
	// signalk-server passes plugins a SHALLOW COPY of `app` (via
	// `_.assign({}, app, ...)` in interfaces/plugins.js), so the
	// `appCopy.isNmea2000OutAvailable` we see is frozen at plugin-registration
	// time. canboat flips the live `app.isNmea2000OutAvailable` to true when
	// it claims an address, but our snapshot stays false forever. The
	// `nmea2000OutAvailable` event still reaches us because event-listener
	// registration goes through prototype methods that reach the live app, but
	// the event is one-shot: subsequent PluginManager restarts (e.g. on Save
	// from the panel) miss it and stay stuck on "Waiting for NMEA 2000 output".
	//
	// The factory closure outlives PluginManager instances, so we latch the
	// flag here on the FIRST emit and reuse it for every subsequent restart.
	let nmea2000Ready = false;
	const factoryListener = (): void => {
		nmea2000Ready = true;
	};
	app.on("nmea2000OutAvailable", factoryListener);

	const plugin: SignalKPlugin = {
		id: "signalk-nmea2000-emitter-cannon",
		name: "NMEA 2000 Emitter Cannon",
		description:
			"Plugin to convert Signal K to NMEA 2000 with enhanced Garmin compatibility",
		schema: () => RootConfig,
		start: startPlugin,
		stop: stopPlugin,
		// signalk-server reads this for the version line in the Server Plugins
		// list. Without it the admin UI shows "Unknown" next to the plugin
		// name even though package.json carries the real version.
		getModuleVersion: () => PLUGIN_VERSION,
	};

	// The Config Advisor reviews live Signal K paths and recommends which
	// conversions to enable. It outlives PluginManager restarts: getMetadata
	// reads through the `pluginManager` closure so it always sees the current
	// instance (or an empty catalog before the first start).
	const advisor = new Advisor({
		buildInventory: () => buildLiveInventory(app),
		getMetadata: () =>
			pluginManager ? pluginManager.getConversionMetadata() : [],
		readConfig: () => app.readPluginOptions() as Record<string, unknown>,
		writeConfig: (config) => {
			app.savePluginOptions(config, (err) => {
				if (err) app.error(`advisor config save failed: ${errMessage(err)}`);
			});
		},
	});

	// Closure form: the router always sees the current PluginManager instance.
	// PluginManager is recreated on every start/stop cycle, so a direct
	// reference would go stale after the first restart.
	plugin.registerWithRouter = createApiRouter(
		app,
		() => pluginManager,
		() => advisor,
	);

	function startPlugin(
		options: unknown,
		_restartPlugin?: (cfg: object) => void,
	): void {
		if (pluginManager) {
			try {
				pluginManager.stop();
			} catch (e) {
				app.error(errMessage(e));
			}
			pluginManager = null;
		}
		try {
			pluginManager = new PluginManager(app, plugin, () => nmea2000Ready);
			pluginManager.start(options);
		} catch (error) {
			const msg = errMessage(error);
			app.error(`Failed to start plugin: ${msg}`);
			app.debug(`Full startup error: ${msg}`);
			// Null out so the next start() does not see a half-initialised
			// instance: stopPlugin() in that path would call stop() on a
			// PluginManager that may have partially-wired listeners.
			pluginManager = null;
		}
	}

	function stopPlugin(): void {
		if (pluginManager) {
			pluginManager.stop();
			pluginManager = null;
		}
	}

	return plugin;
}
