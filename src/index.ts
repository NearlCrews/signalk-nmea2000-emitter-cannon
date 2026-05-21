import pkg from "../package.json" with { type: "json" };
import { Advisor } from "./advisor/advisor.js";
import { BudgetTracker } from "./advisor/budget.js";
import { buildLiveInventory } from "./advisor/inventory.js";
import {
	enrichRationales,
	fetchOpenRouterModels,
	OpenRouterClient,
} from "./advisor/openrouter.js";
import { fetchHistoricPaths, QuestDBClient } from "./advisor/questdb.js";
import { AdvisorScheduler } from "./advisor/schedule.js";
import { createApiRouter } from "./api/router.js";
import { migrateLegacyConfig } from "./config/migrate.js";
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
	//
	// readPluginOptions returns the full options envelope
	// (`{ enabled, configuration, enableLogging, enableDebug }`); the plugin
	// config lives under `.configuration`. readConfig runs that through
	// migrateLegacyConfig, which flattens the envelope. A historical save bug
	// could nest the envelope several layers deep; a single `.configuration`
	// unwrap would then leave the advisor with a config whose `conversions`
	// key is still buried, which the recommender mistakes for an empty config
	// and rebuilds from scratch, stranding every factory-module conversion
	// (BATTERY, NOTIFICATIONS, ENGINE_*, TANKS, SOLAR). savePluginOptions
	// re-wraps the bare config as `.configuration`, so writeConfig passes the
	// flattened object straight through.

	// Counts OpenRouter calls per UTC day across reviews for this plugin run.
	// The per-day cap is read from config at call time, so enrichReasons
	// enforces the configured maxCallsPerDay against this count.
	const advisorBudget = new BudgetTracker();
	const openRouterClient = (o: {
		apiKey: string;
		model: string;
	}): OpenRouterClient =>
		new OpenRouterClient({
			apiKey: o.apiKey,
			model: o.model || "anthropic/claude-haiku-4.5",
			baseUrl: "https://openrouter.ai/api/v1",
		});

	const readConfig = () => {
		const envelope = app.readPluginOptions() as { configuration?: unknown };
		return migrateLegacyConfig(envelope.configuration ?? {});
	};

	const advisor = new Advisor({
		buildInventory: () => buildLiveInventory(app),
		getMetadata: () =>
			pluginManager ? pluginManager.getConversionMetadata() : [],
		readConfig,
		writeConfig: (config) => {
			app.savePluginOptions(config, (err) => {
				if (err) {
					app.error(`advisor config save failed: ${errMessage(err)}`);
					return;
				}
				// savePluginOptions only writes the file; the running
				// PluginManager still holds the previous config. Restart it so
				// an advisor change takes effect immediately rather than on the
				// next manual restart.
				startPlugin(config);
			});
		},
		// A fresh QuestDBClient per call is fine: a review is user-triggered
		// or on a multi-day timer, never a hot path, and the client is
		// stateless.
		fetchHistoric: (url, lookbackDays) =>
			fetchHistoricPaths(new QuestDBClient({ url }), lookbackDays),
		probeQuestDB: (url) => new QuestDBClient({ url }).probe(),
		enrichReasons: async (openRouter, recs) => {
			const cap = readConfig().advisor?.openRouter?.maxCallsPerDay ?? 0;
			if (advisorBudget.callsToday() >= cap) {
				return {
					reasons: new Map(),
					note: "OpenRouter daily call budget reached; using built-in explanations.",
				};
			}
			// Record the call only after enrichRationales resolves: a thrown
			// OpenRouter failure must not consume the day's budget, otherwise an
			// outage silently disables enrichment for the rest of the day.
			const reasons = await enrichRationales(
				openRouterClient(openRouter),
				recs,
			);
			advisorBudget.recordCall();
			return { reasons };
		},
		testKeyFn: async (openRouter) => {
			await openRouterClient(openRouter).complete({
				system: "ping",
				user: "ping",
			});
			return true;
		},
		listModelsFn: () => fetchOpenRouterModels("https://openrouter.ai/api/v1"),
	});

	// Drives the optional periodic review. Reconfigured on every startPlugin
	// from the advisor.schedule config, cleared on stopPlugin.
	const advisorScheduler = new AdvisorScheduler(() => advisor.runReview());

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
			const schedule = (
				options as {
					advisor?: {
						schedule?: { periodic?: unknown; intervalDays?: unknown };
					};
				}
			).advisor?.schedule;
			advisorScheduler.configure(
				schedule?.periodic === true,
				typeof schedule?.intervalDays === "number" ? schedule.intervalDays : 7,
			);
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
		advisorScheduler.stop();
		if (pluginManager) {
			pluginManager.stop();
			pluginManager = null;
		}
	}

	return plugin;
}
