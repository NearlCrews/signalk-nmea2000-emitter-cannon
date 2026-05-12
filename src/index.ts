import { createApiRouter } from "./api/router.js";
import { RootConfig } from "./config/schema.js";
import { PluginManager } from "./plugin-manager.js";
import type { SignalKApp, SignalKPlugin } from "./types/index.js";
import { errMessage } from "./utils/errorUtils.js";

// Single source of truth for the runtime version string surfaced to the
// admin UI. Keep this in lockstep with package.json on every release.
const PLUGIN_VERSION = "1.5.0";

/**
 * Signal K to NMEA 2000 conversion plugin factory
 *
 * @param app - Signal K application instance
 * @returns Plugin instance
 */
export default function createPlugin(app: SignalKApp): SignalKPlugin {
	let pluginManager: PluginManager | null = null;

	const plugin: SignalKPlugin = {
		id: "signalk-nmea2000-emitter-cannon",
		name: "Signal K NMEA2000 Emitter Cannon",
		description:
			"Plugin to convert Signal K to NMEA2000 with enhanced Garmin compatibility",
		schema: () => RootConfig,
		start: startPlugin,
		stop: stopPlugin,
		// signalk-server reads this for the version line in the Server Plugins
		// list. Without it the admin UI shows "Unknown" next to the plugin
		// name even though package.json carries the real version.
		getModuleVersion: () => PLUGIN_VERSION,
	};

	// Closure form: the router always sees the current PluginManager instance.
	// PluginManager is recreated on every start/stop cycle, so a direct
	// reference would go stale after the first restart.
	plugin.registerWithRouter = createApiRouter(app, () => pluginManager);

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
			pluginManager = new PluginManager(app, plugin);
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
