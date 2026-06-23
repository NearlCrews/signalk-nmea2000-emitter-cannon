import { Advisor } from "./advisor/advisor.js";
import { buildLiveInventory } from "./advisor/inventory.js";
import { fetchHistoricPaths, QuestDBClient } from "./advisor/questdb.js";
import { AdvisorScheduler } from "./advisor/schedule.js";
import { buildConversionMetadata } from "./api/conversion-metadata.js";
import { createApiRouter } from "./api/router.js";
import type { ConversionMetadata } from "./api/types.js";
import { migrateLegacyConfig } from "./config/migrate.js";
import { RootConfig } from "./config/schema.js";
import { createConversionModules } from "./conversions/index.js";
import { PluginManager } from "./plugin-manager.js";
import type { SignalKApp, SignalKPlugin } from "./types/index.js";
import { errMessage } from "./utils/errorUtils.js";
import { isValidNumber } from "./utils/validation.js";

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
	// `_.assign({}, app, ...)` in interfaces/plugins.js), so
	// `app.isNmea2000OutAvailable` is a SNAPSHOT taken at plugin-registration
	// time, not a live view. Two readiness scenarios follow, and covering both
	// needs both signals:
	//
	//   1. Loaded at boot, before NMEA 2000 output is ready. The snapshot is
	//      false, but our listener (registered through prototype methods that
	//      reach the live app) catches the one-shot `nmea2000OutAvailable` when
	//      canboat claims an address. We latch it so later PluginManager
	//      restarts (e.g. Save from the panel) stay ready even though the
	//      one-shot event will not fire again.
	//   2. Enabled or installed at runtime, AFTER output is already available.
	//      The one-shot event already fired so the listener never sees it, but
	//      the registration-time snapshot is already true. Seeding from it is
	//      the only readiness signal for this case.
	//
	// Seed from the snapshot, then latch the event: the OR of the two covers
	// both. Honouring only the event (the prior behaviour) silently dropped
	// every PGN for a plugin enabled after output came up.
	let nmea2000Ready = app.isNmea2000OutAvailable === true;
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
	};

	// The conversion catalog is pure module metadata, independent of the plugin
	// lifecycle. signalk-server mounts registerWithRouter for a disabled plugin
	// but only calls start() (which builds pluginManager) once it is enabled, so
	// a manager-free catalog is what lets the config panel show and configure
	// conversions before the first enable. Use the running manager's catalog when
	// present (it already holds the modules), else build a standalone copy once
	// and reuse it. Shared by the API router and the advisor, which both saw an
	// empty catalog while the plugin was disabled.
	let conversionCatalog: ConversionMetadata[] | null = null;
	const getMetadata = (): ConversionMetadata[] => {
		if (pluginManager) {
			return pluginManager.getConversionMetadata();
		}
		if (!conversionCatalog) {
			conversionCatalog = buildConversionMetadata(
				createConversionModules(app, plugin),
			);
		}
		return conversionCatalog;
	};

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
	const readConfig = () => {
		const envelope = app.readPluginOptions() as { configuration?: unknown };
		return migrateLegacyConfig(envelope.configuration ?? {});
	};

	// The Config Advisor reviews live Signal K paths and recommends which
	// conversions to enable. It outlives PluginManager restarts: the shared
	// getMetadata reads through the `pluginManager` closure so it always sees the
	// current instance (or the standalone catalog before the first start).
	const advisor = new Advisor({
		buildInventory: () => buildLiveInventory(app),
		getMetadata,
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
	});

	// Drives the optional periodic review. Reconfigured on every startPlugin
	// from the advisor.schedule config, cleared on stopPlugin. A scheduled-run
	// rejection is logged here (user-triggered runs already log via the router).
	const advisorScheduler = new AdvisorScheduler(
		() => advisor.runReview(),
		(err) => app.error(`advisor periodic review failed: ${errMessage(err)}`),
	);

	plugin.registerWithRouter = createApiRouter(
		app,
		() => pluginManager,
		getMetadata,
		() => advisor,
	);

	function startPlugin(
		options: unknown,
		_restartPlugin?: (cfg: object) => void,
	): void {
		// Tear down any prior instance (and the scheduler) before re-wiring;
		// the configure() call below re-arms the scheduler from fresh config.
		stopPlugin();
		try {
			// Migrate once and share. PluginManager.start re-runs
			// migrateLegacyConfig on its input, which is idempotent (and tested as
			// such), so passing the migrated object through is a no-op there. The
			// scheduler must read advisor.schedule from the same flattened shape:
			// reading raw `options` would miss it on a config that still carries
			// the historical `configuration`-envelope nesting, so the periodic
			// review would silently never arm even though conversions still emit.
			const migrated = migrateLegacyConfig(options);
			pluginManager = new PluginManager(app, plugin, () => nmea2000Ready);
			pluginManager.start(migrated);
			const schedule = migrated.advisor?.schedule;
			advisorScheduler.configure(
				schedule?.periodic === true,
				isValidNumber(schedule?.intervalDays) ? schedule.intervalDays : 7,
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
