import { Advisor, type AdvisorConfigUpdater, AdvisorOperationError } from "./advisor/advisor.js";
import { buildLiveInventory } from "./advisor/inventory.js";
import { fetchHistoricPaths, QuestDBClient } from "./advisor/questdb.js";
import { AdvisorScheduler } from "./advisor/schedule.js";
import { buildConversionMetadata } from "./api/conversion-metadata.js";
import { createApiRouter } from "./api/router.js";
import type { ConversionMetadata } from "./api/types.js";
import { migrateLegacyConfig } from "./config/migrate.js";
import { conversionOptionsByKey } from "./config/pluginOptions.js";
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
	let hostActive = false;
	let hostLifecycleEpoch = 0;
	let deltaHandlerRegistered = false;

	const ensureDeltaInputHandler = (): void => {
		if (deltaHandlerRegistered) return;
		app.registerDeltaInputHandler((delta, next) => {
			// Signal K's input chain is synchronous. Forward first so its cache and
			// Course API reflect this delta before callbacks call getSelfPath(),
			// getPath(), or getCourse(). In particular, getCourse() captures the
			// current courseInfo reference when called, before its Promise resolves.
			// Invoke next exactly once, and never retry if a downstream handler throws.
			try {
				next(delta);
			} catch (error) {
				app.error(`Unable to forward delta input: ${errMessage(error)}`);
				return;
			}
			try {
				pluginManager?.handleDeltaInput(delta);
			} catch (error) {
				app.error(`Unable to process delta input: ${errMessage(error)}`);
			}
		});
		deltaHandlerRegistered = true;
	};

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
	// both. Honoring only the event (the prior behavior) silently dropped
	// every PGN for a plugin enabled after output came up.
	let nmea2000Ready = app.isNmea2000OutAvailable === true;
	const factoryListener = (): void => {
		nmea2000Ready = true;
		pluginManager?.notifyNmea2000Ready();
	};
	// Signal K binds app.on to this plugin object's actor id, but does not add
	// event-listener cleanup to its plugin onStopHandlers. Register once for the
	// factory lifetime: it captures pre-start readiness, survives host and
	// manager restarts, and always routes to the current manager closure.
	app.on("nmea2000OutAvailable", factoryListener);

	const plugin: SignalKPlugin = {
		id: "signalk-nmea2000-emitter-cannon",
		name: "NMEA 2000 Emitter Cannon",
		description: "Plugin to convert Signal K to NMEA 2000 with enhanced Garmin compatibility",
		schema: () => RootConfig,
		start: startPlugin,
		stop: stopPlugin,
	};

	// The conversion catalog is pure module metadata, independent of the plugin
	// lifecycle. signalk-server mounts registerWithRouter for a disabled plugin
	// but only calls start() (which builds pluginManager) once it is enabled, so
	// a manager-free catalog is what lets the config panel show and configure
	// conversions before the first enable. Use the manager's catalog when it is
	// populated, else reuse standalone modules and rebuild their metadata with the
	// latest saved mapping options. The fallback also
	// covers failed starts, where the manager has already cleared its modules.
	// Shared by the API router and the advisor, which both previously saw an empty
	// catalog while the plugin was disabled.
	let standaloneConversions: ReturnType<typeof createConversionModules> | null = null;
	const getMetadata = (): ConversionMetadata[] => {
		if (pluginManager) {
			const managerMetadata = pluginManager.getConversionMetadata();
			if (managerMetadata.length > 0) return managerMetadata;
		}
		const config = readConfigBestEffort();
		standaloneConversions ??= createConversionModules(app, plugin);
		return buildConversionMetadata(standaloneConversions, conversionOptionsByKey(config));
	};

	// readPluginOptions returns the full options envelope
	// (`{ enabled, configuration, enableLogging, enableDebug }`); the plugin
	// config lives under `.configuration`. The authoritative reader runs that through
	// migrateLegacyConfig, which flattens the envelope. A historical save bug
	// could nest the envelope several layers deep; a single `.configuration`
	// unwrap would then leave the advisor with a config whose `conversions`
	// key is still buried, which the recommender mistakes for an empty config
	// and rebuilds from scratch, stranding every factory-module conversion
	// (BATTERY, NOTIFICATIONS, ENGINE_*, TANKS, SOLAR). savePluginOptions
	// re-wraps the bare config as `.configuration`, so updateConfig passes the
	// flattened object straight through.
	function readConfigAuthoritative() {
		if (typeof app.readPluginOptions !== "function") {
			throw new AdvisorOperationError(
				"Signal K did not provide readPluginOptions",
				"The saved plugin configuration could not be read. No changes were made.",
			);
		}
		try {
			const envelope = app.readPluginOptions() as { configuration?: unknown };
			return migrateLegacyConfig(envelope.configuration ?? {});
		} catch (error) {
			app.error(`Unable to read plugin configuration: ${errMessage(error)}`);
			throw new AdvisorOperationError(
				`Unable to read plugin configuration: ${errMessage(error)}`,
				"The saved plugin configuration could not be read. No changes were made.",
			);
		}
	}

	function readConfigBestEffort() {
		try {
			return readConfigAuthoritative();
		} catch {
			// The disabled-plugin catalog remains useful even when configuration
			// storage is temporarily unavailable. Advisor operations use the strict
			// reader above and never treat this fallback as authoritative.
			return migrateLegacyConfig({});
		}
	}

	function persistConfig(config: Record<string, unknown>): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			try {
				app.savePluginOptions(config, (error) => {
					if (error) reject(error);
					else resolve();
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	async function updateConfig(updater: AdvisorConfigUpdater): Promise<void> {
		// Read at the persistence boundary, after any inventory or QuestDB work,
		// so the updater merges only its intended fields into the newest config.
		const previous = readConfigAuthoritative();
		const next = updater(previous);
		if (next === previous) return;

		const hostWasActiveAtSave = hostActive;
		const lifecycleEpochAtSave = hostLifecycleEpoch;
		try {
			await persistConfig(next);
		} catch (error) {
			app.error(`advisor config save failed: ${errMessage(error)}`);
			throw new AdvisorOperationError(
				`Unable to persist Advisor configuration: ${errMessage(error)}`,
				"The configuration could not be saved. No changes were applied.",
			);
		}

		// Saving while disabled changes only the stored options. The epoch guard
		// prevents an asynchronous callback from resurrecting a stopped plugin.
		if (!hostWasActiveAtSave || !hostActive || hostLifecycleEpoch !== lifecycleEpochAtSave) {
			return;
		}

		try {
			startManager(next);
			return;
		} catch (startError) {
			app.error(`advisor runtime restart failed: ${errMessage(startError)}`);

			let persistenceRollbackError: unknown;
			try {
				await persistConfig(previous);
			} catch (rollbackError) {
				persistenceRollbackError = rollbackError;
				app.error(`advisor config rollback failed: ${errMessage(rollbackError)}`);
			}

			let runtimeRollbackError: unknown;
			if (hostActive && hostLifecycleEpoch === lifecycleEpochAtSave) {
				try {
					startManager(previous);
				} catch (rollbackError) {
					runtimeRollbackError = rollbackError;
					app.error(`advisor runtime rollback failed: ${errMessage(rollbackError)}`);
				}
			}

			if (persistenceRollbackError === undefined && runtimeRollbackError === undefined) {
				throw new AdvisorOperationError(
					`Advisor configuration start failed and was rolled back: ${errMessage(startError)}`,
					"The proposed configuration could not be started, so the previous configuration was restored.",
				);
			}

			throw new AdvisorOperationError(
				`Advisor configuration recovery failed after start error (${errMessage(startError)}); persistence rollback: ${persistenceRollbackError === undefined ? "ok" : errMessage(persistenceRollbackError)}; runtime rollback: ${runtimeRollbackError === undefined ? "ok" : errMessage(runtimeRollbackError)}`,
				"The proposed configuration could not be started, and the previous configuration could not be fully restored. Check the Signal K server log, then restart the plugin.",
			);
		}
	}

	// The Config Advisor reviews live Signal K paths and recommends which
	// conversions to enable. It outlives PluginManager restarts: the shared
	// getMetadata reads through the `pluginManager` closure so it always sees the
	// current instance (or the standalone catalog before the first start).
	const advisor = new Advisor({
		buildInventory: () => buildLiveInventory(app),
		getMetadata,
		readConfig: readConfigAuthoritative,
		updateConfig,
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

	function startManager(options: unknown): void {
		// Tear down only plugin-owned runtime state. The host-owned delta input
		// handler remains registered across Advisor restarts and routes through
		// the pluginManager closure to the replacement instance.
		stopManager(true);
		let candidate: PluginManager | null = null;
		try {
			// Migrate once and share. PluginManager.start re-runs
			// migrateLegacyConfig on its input, which is idempotent (and tested as
			// such), so passing the migrated object through is a no-op there. The
			// scheduler must read advisor.schedule from the same flattened shape:
			// reading raw `options` would miss it on a config that still carries
			// the historical `configuration`-envelope nesting, so the periodic
			// review would silently never arm even though conversions still emit.
			const migrated = migrateLegacyConfig(options);
			candidate = new PluginManager(app, plugin, () => nmea2000Ready, ensureDeltaInputHandler);
			// Publish the candidate before its synchronous start so the sole factory
			// readiness listener can reach it if the provider event fires during
			// startup. JavaScript runs start() without interleaving unrelated deltas.
			pluginManager = candidate;
			candidate.start(migrated);
			const schedule = migrated.advisor?.schedule;
			advisorScheduler.configure(
				schedule?.periodic === true,
				isValidNumber(schedule?.intervalDays) ? schedule.intervalDays : 7,
			);
		} catch (error) {
			advisorScheduler.stop();
			pluginManager = null;
			candidate?.stop(true);
			throw error instanceof Error ? error : new Error(errMessage(error));
		}
	}

	function stopManager(suppressStatus = false): void {
		advisorScheduler.stop();
		const manager = pluginManager;
		pluginManager = null;
		manager?.stop(suppressStatus);
	}

	function startPlugin(options: unknown, _restartPlugin?: (cfg: object) => void): void {
		hostActive = true;
		hostLifecycleEpoch++;
		try {
			startManager(options);
		} catch (error) {
			// A failed host start is not an active lifecycle. Invalidate the epoch
			// so an Advisor save cannot mistake the failed attempt for a running
			// plugin and resurrect a manager behind Signal K's back.
			hostActive = false;
			hostLifecycleEpoch++;
			throw error;
		}
	}

	function stopPlugin(): void {
		hostActive = false;
		hostLifecycleEpoch++;
		stopManager();
		// Signal K runs the unregister callback associated with every delta
		// input handler before invoking plugin.stop(). The next host start must
		// therefore register a new handler. Manager-only restarts never reach
		// this path and retain the existing registration.
		deltaHandlerRegistered = false;
	}

	return plugin;
}
