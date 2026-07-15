import type { Context, NormalizedDelta, Path } from "@signalk/server-api";
import { debounceTime, Subject } from "rxjs";
import { buildConversionMetadata } from "./api/conversion-metadata.js";
import { findOrphanExtrasMetaKeys } from "./api/extras-meta.js";
import type { ConversionMetadata } from "./api/types.js";
import { migrateLegacyConfig } from "./config/migrate.js";
import {
	DEFAULT_GLOBAL_RESEND_SECONDS,
	SOURCE_TYPE,
	STREAM_DEBOUNCE_MS,
	VESSELS_SELF_CONTEXT,
} from "./constants.js";
import { createConversionModules } from "./conversions/index.js";
import type {
	ConversionModule,
	ConversionOptions,
	N2KMessage,
	PluginOptions,
	ProcessingOptions,
	SignalKApp,
	SignalKPlugin,
	SourceTypeMapper,
	SubConversionModule,
} from "./types/index.js";
import { isConversionOptions } from "./types/index.js";
import { isDebugEnabled } from "./utils/debugUtils.js";
import { errMessage } from "./utils/errorUtils.js";
import { formatN2KMessage, validateN2KMessage } from "./utils/messageUtils.js";
import { isDefined, pathToPropName, stripSubIndex, subIndexKey } from "./utils/pathUtils.js";
import { withCanonicalPgnPriority } from "./utils/pgnPriorities.js";
import { clearAllSmoothers } from "./utils/smoothing.js";

function resolveKeys(
	keys: string[] | ((options: ConversionOptions) => string[]) | undefined,
	options: ConversionOptions,
): string[] {
	if (keys === undefined) return [];
	if (typeof keys === "function") return keys(options);
	return keys;
}

// Throttle-bucket prefixes used by bucketKey() and the per-source label
// passed into invokeCallback(). Centralised so the snapshot path (which
// parses these prefixes) and the write sites stay in lockstep: a string
// drift between the two would silently hide errors from the panel.
const BUCKET_PREFIX = {
	CALLBACK: "callback",
	STREAM: "stream",
	DELTA: "delta",
	SUBSCRIPTION: "subscription",
	TIMER: "timer",
	RESEND: "resend",
	PROCESS: "process",
} as const;

/**
 * Per-conversion runtime state assembled in getStatusSnapshot() and tracked
 * incrementally as emits and errors happen. Indexed by parent optionKey:
 * sub-conversions (BATTERY[0], BATTERY[1], ...) aggregate under the bare
 * parent key (BATTERY), which is exactly what the panel renders per card.
 */
interface PerConversionState {
	enabled: boolean;
	emitCount: number;
	lastEmitAt?: number;
	latestError?: { message: string; emittedAt: number };
}

/**
 * Process-wide singleton wiring for the delta input handler. signalk-server's
 * registerDeltaInputHandler (server-api 2.x) exposes no unregister API, so a
 * handler installed on every start()/stop() cycle would leak forever, pinning
 * each retired PluginManager in memory. Instead one handler is installed for
 * the process lifetime and routes every delta to whichever PluginManager is
 * currently active; retired instances drop out of the active slot and become
 * collectable.
 */
let activeManager: PluginManager | null = null;
let deltaHandlerRegistered = false;

// Not idempotent on a reused instance: stop() clears this.conversions and
// removes the constructor-installed listener, so a subsequent start() on the
// same instance is a no-op. index.ts always discards the instance after stop()
// and constructs a fresh PluginManager on restart.
export class PluginManager {
	private app: SignalKApp;
	private conversions: ConversionModule[] = [];
	private unsubscribes: Array<() => void> = [];
	private timers: NodeJS.Timeout[] = [];
	/**
	 * Delta-source conversions wired by mapOnDelta in the current start().
	 * The single process-wide delta input handler iterates this list on the
	 * active manager, so each restart reuses one handler instead of leaking a
	 * new one. Reset by stop().
	 */
	private deltaConversions: Array<{
		conversion: ConversionModule;
		options: ProcessingOptions;
	}> = [];
	private nmea2000Ready = false;
	private globalResendInterval = DEFAULT_GLOBAL_RESEND_SECONDS;
	/**
	 * Flipped by stop(). registerDeltaInputHandler in @signalk/server-api 2.x
	 * exposes no unregister API, so handlers from prior start()/stop() cycles
	 * remain installed forever. The handler closure checks this flag first and
	 * bails out, neutralising zombie handlers without changing wire behaviour.
	 */
	private stopped = false;
	private running = false;
	/**
	 * Stored so stop() can removeListener the exact same reference. Without
	 * this, every plugin restart leaks a listener (and the PluginManager it
	 * closes over), eventually tripping MaxListenersExceeded.
	 */
	private readonly onNmea2000Ready: () => void;
	/**
	 * Last input arguments observed for each conversion. Used by the resend
	 * timer to re-invoke the conversion callback with the most recent input
	 * (so time-derived callbacks like systemTime produce fresh output) instead
	 * of re-emitting a stale cached N2KMessage[].
	 */
	private lastInputs: Map<ConversionModule, unknown[]> = new Map();
	/**
	 * Number of conversions that start() reported as enabled. Captured so a
	 * late nmea2000OutAvailable event can refresh the plugin status from
	 * "Waiting for NMEA 2000 output..." to the running form without re-running
	 * the full enablement sweep.
	 */
	private lastEnabledCount = 0;
	/**
	 * Throttle state for repeated error log lines. Keyed by an error-site
	 * identifier (e.g. `callback:<optionKey>:<source>`). A conversion bug that
	 * fires on every delta would otherwise flood the server log; this collapses
	 * a run of identical errors into one log per window plus a final summary.
	 */
	private errorBuckets: Map<
		string,
		{
			suppressed: number;
			nextEmit: number;
		}
	> = new Map();
	private static readonly ERROR_THROTTLE_S = 60;
	private static readonly ERROR_THROTTLE_MS = PluginManager.ERROR_THROTTLE_S * 1000;
	/**
	 * Single per-conversion state record indexed by parent optionKey. Replaces
	 * four earlier Maps (emitCounts, lastEmitAt, lastEnabledKeys, and the
	 * latestErrorByParent secondary index) that all walked the same key space.
	 *
	 * Sub-conversion buckets like `BATTERY[0]` and per-source error keys like
	 * `callback:BATTERY[0]:stream` aggregate under the bare parent optionKey
	 * (BATTERY), which is what the panel displays per card. Entries are
	 * lazily created by recordEmit() and throttledError() and pre-seeded for
	 * every enabled conversion in start() so the snapshot's `enabled` flag is
	 * O(1).
	 *
	 * Cleared at start() and stop() boundaries alongside errorBuckets.
	 */
	private perConversion: Map<string, PerConversionState> = new Map();
	private startTime = Date.now();

	private getPerConversionState(key: string): PerConversionState {
		let entry = this.perConversion.get(key);
		if (entry === undefined) {
			entry = { enabled: false, emitCount: 0 };
			this.perConversion.set(key, entry);
		}
		return entry;
	}

	constructor(
		app: SignalKApp,
		plugin: SignalKPlugin,
		// Reads the factory-level `nmea2000Ready` flag from index.ts. That flag
		// folds the registration-time `app.isNmea2000OutAvailable` snapshot
		// together with the latched one-shot `nmea2000OutAvailable` event, so it
		// covers both the boot-then-ready and the enabled-after-ready cases (see
		// index.ts comment). The closure survives the PluginManager construct /
		// discard cycle, so reading it here is correct across restarts; reading
		// `app.isNmea2000OutAvailable` directly would only see the frozen
		// snapshot.
		private readonly factoryNmea2000Ready: () => boolean = () => false,
	) {
		this.app = app;

		// Load conversions at initialization
		this.conversions = createConversionModules(app, plugin);
		this.app.debug(`Loaded ${this.conversions.length} conversion modules`);
		// Sanity check: the extras-meta table must reference real loaded
		// optionKeys. A drift here breaks the per-card editor in the panel
		// without breaking runtime emission, so log via app.debug rather than
		// failing loud at startup.
		for (const orphan of findOrphanExtrasMetaKeys(this.conversions)) {
			this.app.debug(`extras-meta has entry for unknown optionKey '${orphan}'`);
		}

		// Wait for NMEA 2000 output to be available before emitting. start()
		// owns the add/remove of this listener (the constructor only captures
		// the callback so removeListener can pass the same reference). Adding
		// here would leave a leaked listener on any constructed-but-never-
		// started instance.
		this.onNmea2000Ready = () => {
			// Stopped-check first: a stray post-stop event (if removeListener
			// in stop() threw and safe() swallowed it) leaves a dead instance
			// fully quiescent rather than re-flipping its readiness flag.
			if (this.stopped) return;
			this.nmea2000Ready = true;
			this.app.debug("NMEA 2000 output is now available");
			// If start() has already completed with conversions enabled, the
			// status currently reads "Waiting for NMEA 2000 output...". Refresh
			// it to the running form so the admin UI reflects that emission
			// has begun.
			if (this.lastEnabledCount > 0) {
				this.app.setPluginStatus(this.runningStatus(this.lastEnabledCount));
			}
		};
	}

	private moduleLabel(conversion: ConversionModule): string {
		const title = conversion.title || "<unnamed>";
		const key = conversion.optionKey ? ` [${conversion.optionKey}]` : "";
		return `${title}${key}`;
	}

	private bucketKey(prefix: string, conversion: ConversionModule, suffix?: string): string {
		const id = conversion.optionKey ?? conversion.title ?? "?";
		return suffix ? `${prefix}:${id}:${suffix}` : `${prefix}:${id}`;
	}

	// Throttle-bucket key for processToN2K emit errors, matching
	// bucketKey(BUCKET_PREFIX.PROCESS, conversion) so a conversion that emits a
	// bad PGN on every delta cannot flood the log. Built on the error path
	// only; processToN2K receives an optionKey, not the ConversionModule.
	private processBucketKey(optionKey: string | undefined): string {
		return `${BUCKET_PREFIX.PROCESS}:${optionKey ?? "?"}`;
	}

	private runningStatus(count: number): string {
		return `Running with ${count} conversions enabled`;
	}

	/**
	 * Extract the parent optionKey from a throttle-bucket key. Bucket keys
	 * are `<prefix>:<id>[:<source>]` where id is either `OPTION_KEY` or
	 * `OPTION_KEY[N]` for sub-conversions. Returns the bare option key so
	 * status snapshots can index by parent regardless of which sub-conversion
	 * (or which source: stream/delta/timer/etc) raised the error.
	 */
	private parentKeyFromBucketKey(bucketKey: string): string | undefined {
		const firstColon = bucketKey.indexOf(":");
		if (firstColon === -1) return undefined;
		const afterPrefix = bucketKey.substring(firstColon + 1);
		const secondColon = afterPrefix.indexOf(":");
		const id = secondColon === -1 ? afterPrefix : afterPrefix.substring(0, secondColon);
		return stripSubIndex(id);
	}

	/**
	 * Emit an error message with per-key throttling. The first message for a
	 * key passes through immediately; subsequent identical-key errors within
	 * ERROR_THROTTLE_MS are counted, and when the window expires the next
	 * error appends a suppressed-count summary. Keeps a misbehaving callback
	 * from flooding the server log on every delta.
	 *
	 * Also updates perConversion[parent].latestError so getStatusSnapshot()
	 * can surface the most recent error per parent optionKey in O(1).
	 */
	private throttledError(key: string, message: string): void {
		const now = Date.now();
		const bucket = this.errorBuckets.get(key);
		if (!bucket || now >= bucket.nextEmit) {
			const suppressed = bucket?.suppressed ?? 0;
			const suffix =
				suppressed > 0
					? ` (${suppressed} similar errors suppressed in the last ${PluginManager.ERROR_THROTTLE_S}s)`
					: "";
			this.app.error(`${message}${suffix}`);
			this.errorBuckets.set(key, {
				suppressed: 0,
				nextEmit: now + PluginManager.ERROR_THROTTLE_MS,
			});
			const parent = this.parentKeyFromBucketKey(key);
			if (parent !== undefined) {
				this.getPerConversionState(parent).latestError = {
					message,
					emittedAt: now,
				};
			}
			return;
		}
		bucket.suppressed++;
	}

	/**
	 * Invoke a conversion callback safely. Catches synchronous errors and
	 * returns the raw result (which may itself be a promise) so callers can
	 * await it in their own promise chains. Asynchronous failures must be
	 * handled by the caller (they pass through processOutput's try/catch).
	 */
	private invokeCallback(
		conversion: ConversionModule,
		args: unknown[],
		source: string,
	): N2KMessage[] | Promise<N2KMessage[]> | undefined {
		if (!conversion.callback) return undefined;
		try {
			return conversion.callback(...args);
		} catch (err) {
			const message = errMessage(err);
			this.throttledError(
				this.bucketKey(BUCKET_PREFIX.CALLBACK, conversion, source),
				`Error in ${source} callback for ${this.moduleLabel(conversion)}: ${message}`,
			);
			return undefined;
		}
	}

	/**
	 * Migrate the raw options (legacy flat shape or the typed new shape), then
	 * flatten each conversion's sources+extras back into the wide
	 * ConversionOptions surface the downstream mappers read.
	 */
	private buildPluginOptions(rawOptions: unknown): PluginOptions {
		const migrated = migrateLegacyConfig(rawOptions);
		const conversions: Record<string, ConversionOptions> = {};
		for (const [key, value] of Object.entries(migrated.conversions)) {
			// value.sources / value.extras can be undefined: the nested
			// early-return branch in migrateLegacyConfig passes a config through
			// without backfilling them. Spreading undefined is a no-op, so the
			// spread stays safe without `?? {}` guards.
			conversions[key] = {
				enabled: value.enabled,
				resend: value.resend,
				...value.sources,
				...value.extras,
			};
		}
		return {
			globalResendInterval: migrated.globalResendInterval,
			conversions,
		};
	}

	/**
	 * Expand one enabled conversion into its sub-conversions (factory modules
	 * return one per engine, battery, tank, etc), give each a derived identity,
	 * and dispatch it through the source-type mapper. A single-PGN module wires
	 * as itself; a factory module's children each get a `PARENT[idx]` optionKey
	 * and a useful log label so per-instance errors do not collapse into one
	 * throttle bucket.
	 */
	private wireConversion(conv: ConversionModule, convOptions: ConversionOptions): void {
		const rawConversions = conv.conversions;
		let subConversions: SubConversionModule[] | null;
		if (rawConversions === undefined) {
			subConversions = [conv];
		} else if (typeof rawConversions === "function") {
			subConversions = rawConversions(convOptions);
		} else {
			subConversions = rawConversions;
		}

		if (!subConversions) {
			this.app.debug(`No subconversions for ${conv.title}`);
			return;
		}

		for (let idx = 0; idx < subConversions.length; idx++) {
			const subConversion = subConversions[idx];
			if (subConversion === undefined) continue;

			const sourceType = subConversion.sourceType ?? SOURCE_TYPE.ON_VALUE_CHANGE;
			const mapper = this.sourceTypes[sourceType];

			if (!mapper) {
				this.app.error(`Unknown conversion type: ${sourceType}`);
				continue;
			}

			// Sub-conversions from a factory lack optionKey and may lack title,
			// so without this each per-instance error would log as "<unnamed>"
			// and collapse into a shared "?" throttle bucket (e.g. 3 batteries
			// merging into one). Spread into a fresh ConversionModule per
			// sub-conversion; mutating the source would persist annotations
			// across start/stop cycles.
			const labeled: ConversionModule =
				subConversion === conv
					? conv
					: {
							...subConversion,
							optionKey: subIndexKey(conv.optionKey, idx),
							title: subConversion.title ?? `${conv.title} #${idx}`,
							category: conv.category,
							...(conv.presets ? { presets: conv.presets } : {}),
						};

			mapper(labeled, convOptions);
		}
	}

	start(rawOptions: unknown): void {
		try {
			this.stopped = false;
			this.running = false;
			// Claim the process-wide delta-handler routing slot so the single
			// registered handler dispatches deltas to this instance.
			activeManager = this;
			this.errorBuckets.clear();
			this.perConversion.clear();
			// Re-attach the nmea2000OutAvailable listener every start: stop()
			// removes it, and start() may run multiple times across a single
			// plugin instance (disable -> enable from the admin UI). Removing
			// before adding keeps the call idempotent even on the first start
			// where the listener is already attached from the constructor.
			this.app.removeListener("nmea2000OutAvailable", this.onNmea2000Ready);
			this.app.on("nmea2000OutAvailable", this.onNmea2000Ready);
			// Sync readiness check via the factory flag (see index.ts): it folds
			// the registration-time `app.isNmea2000OutAvailable` snapshot together
			// with the latched one-shot event, so a plugin enabled after output
			// came up still detects readiness here. Reading the appCopy snapshot
			// directly would miss the boot-then-ready case.
			if (this.factoryNmea2000Ready()) {
				this.nmea2000Ready = true;
				this.app.debug("NMEA 2000 output already available at start (factory-latched flag)");
			}
			const options = this.buildPluginOptions(rawOptions);
			// Nullish-coalesce, not `||`: a configured 0 is a meaningful value
			// (disable global resend) and must survive. `migrateLegacyConfig`
			// already guarantees a number here, so `??` only fills a genuinely
			// absent value with the default. A conversion with its own resend > 0
			// still resends; only the global default is switched off.
			this.globalResendInterval = options.globalResendInterval ?? DEFAULT_GLOBAL_RESEND_SECONDS;

			this.app.setPluginStatus("Starting...");
			this.app.debug(
				`Starting with ${this.conversions.length} conversion modules; option keys: ${JSON.stringify(Object.keys(options.conversions))}`,
			);

			let enabledCount = 0;
			for (const conv of this.conversions) {
				const convOptions = options.conversions[conv.optionKey];
				const isEnabled = isConversionOptions(convOptions) && convOptions.enabled === true;
				if (!isEnabled) continue;
				enabledCount++;
				this.getPerConversionState(conv.optionKey).enabled = true;

				this.app.debug(`Enabling: ${this.moduleLabel(conv)}`);

				if (conv.onOptionsLoaded) {
					conv.onOptionsLoaded(convOptions);
				}

				this.wireConversion(conv, convOptions);
			}

			this.lastEnabledCount = enabledCount;
			if (enabledCount === 0) {
				this.app.setPluginStatus("No conversions enabled. Enable at least one in plugin settings.");
			} else if (!this.nmea2000Ready) {
				// Plugin is wired up but signalk-server has not announced
				// nmea2000OutAvailable yet. onNmea2000Ready will refresh to the
				// running form once emission becomes possible; if the event
				// never fires (no N2K provider configured), this status is the
				// accurate final state.
				this.app.setPluginStatus(
					`Waiting for NMEA 2000 output (${enabledCount} conversions enabled)`,
				);
			} else {
				this.app.setPluginStatus(this.runningStatus(enabledCount));
			}
			this.running = true;
		} catch (error) {
			const errorMsg = errMessage(error);
			this.app.error(`Failed to start plugin: ${errorMsg}`);
			this.app.setPluginError(
				`Startup failed: ${errorMsg}. Check plugin configuration and the Signal K server log for details.`,
			);
			try {
				// suppressStatus: the final setPluginStatus("Stopped") in stop()
				// would overwrite the setPluginError indicator we just set, hiding
				// the failure cause from the admin UI.
				this.stop(true);
			} catch (stopErr) {
				this.app.error(`stop() during start() failure also failed: ${errMessage(stopErr)}`);
			}
		}
	}

	/**
	 * Each cleanup step is wrapped so one failure doesn't prevent the rest
	 * from running. Errors are collected and reported once. stop() must not
	 * throw: Signal K calls it on plugin disable/uninstall.
	 *
	 * `suppressStatus` is set when stop() is called from the start() catch
	 * block: setPluginError() has just announced the startup failure, and
	 * overwriting it here with "Stopped" would hide the cause from the admin
	 * UI. All other callers (Signal K disable, index.ts normal restart) leave
	 * it false so the UI reflects the stopped state.
	 */
	stop(suppressStatus = false): void {
		this.stopped = true;
		this.running = false;
		const errors: string[] = [];
		const safe = (label: string, fn: () => void) => {
			try {
				fn();
			} catch (err) {
				const message = errMessage(err);
				errors.push(`${label}: ${message}`);
			}
		};

		// Snapshot then reset so we never leak references even if a callback throws.
		const unsubscribes = this.unsubscribes;
		this.unsubscribes = [];
		for (const unsubscribe of unsubscribes) {
			safe("unsubscribe", unsubscribe);
		}

		// Resend timers are already tracked in `this.timers`; clearing the
		// list is the sole authoritative teardown. The `conversion.resendTimer`
		// field is used only as an "armed" flag, so we just drop it here.
		const timers = this.timers;
		this.timers = [];
		for (const timer of timers) {
			safe("clearInterval", () => clearInterval(timer));
		}
		for (const conversion of this.conversions) {
			if (conversion.resendTimer) {
				delete conversion.resendTimer;
			}
		}
		this.conversions = [];

		// Drop delta-conversion wiring and release the process-wide delta
		// routing slot if it still points at this instance, so the retired
		// manager becomes collectable.
		this.deltaConversions = [];
		if (activeManager === this) {
			activeManager = null;
		}

		// Remove the nmea2000OutAvailable listener the constructor registered.
		// Without this, every restart leaks a listener plus the closure over
		// this PluginManager instance.
		safe("removeListener(nmea2000OutAvailable)", () =>
			this.app.removeListener("nmea2000OutAvailable", this.onNmea2000Ready),
		);
		// Reset readiness so a subsequent start() waits for the event again
		// instead of inheriting the previous run's state.
		this.nmea2000Ready = false;

		// Drop cached inputs so a subsequent start() begins from a clean slate.
		safe("clear lastInputs", () => this.lastInputs.clear());

		// Reset status-bookkeeping and error-throttle state so a fresh start()
		// reports an accurate enabled count and does not inherit suppressed
		// errors from the prior cycle.
		this.lastEnabledCount = 0;
		safe("clear perConversion", () => this.perConversion.clear());
		safe("clear errorBuckets", () => this.errorBuckets.clear());

		// Wipe ExponentialSmoother state across plugin restarts.
		safe("clearAllSmoothers", () => clearAllSmoothers());

		// Surface the stopped state in the Signal K admin UI. Skipped when the
		// caller is start()'s catch path: it just called setPluginError() and
		// "Stopped" would overwrite the failure indicator.
		if (!suppressStatus) {
			safe("setPluginStatus(Stopped)", () => this.app.setPluginStatus("Stopped"));
		}

		if (errors.length > 0) {
			this.app.error(
				`PluginManager.stop() encountered ${errors.length} cleanup error(s): ${errors.join("; ")}`,
			);
		}
	}

	/**
	 * The resend timer re-invokes the conversion callback with the most
	 * recent input rather than re-emitting cached output, so time-derived
	 * callbacks (e.g. systemTime) produce fresh values on every tick.
	 */
	private async resendConversion(conversion: ConversionModule): Promise<void> {
		try {
			if (this.stopped) return;
			const lastInput = this.lastInputs.get(conversion);
			// No input ever observed: skip; do not emit stale defaults.
			if (lastInput === undefined) return;

			const raw = this.invokeCallback(conversion, lastInput, BUCKET_PREFIX.RESEND);
			if (raw === undefined) return;

			const values = await Promise.resolve(raw);
			if (this.stopped) return;
			await this.processToN2K(values, conversion.optionKey);
		} catch (err) {
			const message = errMessage(err);
			this.throttledError(
				this.bucketKey(BUCKET_PREFIX.RESEND, conversion),
				`Error in resend timer for ${this.moduleLabel(conversion)}: ${message}`,
			);
		}
	}

	private async processOutput(
		conversion: ConversionModule,
		options: ProcessingOptions | null,
		output: N2KMessage[] | Promise<N2KMessage[]> | undefined,
	): Promise<void> {
		try {
			if (output !== undefined) {
				const values = await Promise.resolve(output);
				await this.processToN2K(values, conversion.optionKey);
			}
		} catch (err) {
			const message = errMessage(err);
			this.throttledError(
				this.bucketKey(BUCKET_PREFIX.PROCESS, conversion),
				`Error processing output for ${this.moduleLabel(conversion)}: ${message}`,
			);
		}

		// Timer-source conversions (e.g. systemTime) provide their own schedule;
		// arming a resend timer on top would double-emit every global-resend
		// window. ON_DELTA conversions (AIS) are purely event-driven: resend
		// would re-broadcast one arbitrary stale target, so they get no timer
		// either (see dispatchDelta).
		if (
			conversion.sourceType === SOURCE_TYPE.TIMER ||
			conversion.sourceType === SOURCE_TYPE.ON_DELTA
		) {
			return;
		}

		// Resolve effective resend interval: per-conversion overrides global when non-zero
		const effectiveResend =
			options?.resend && options.resend > 0 ? options.resend : this.globalResendInterval;

		// processOutput is async: stop() may have run while it was mid-flight.
		// Arming a resend timer now would push it to a this.timers array that
		// nothing drains, leaking the interval and this PluginManager closure.
		if (this.stopped) return;

		if (effectiveResend > 0 && !conversion.resendTimer) {
			conversion.resendTimer = setInterval(() => {
				void this.resendConversion(conversion);
			}, effectiveResend * 1000);

			this.timers.push(conversion.resendTimer);
		}
	}

	private mapOnDelta(conversion: ConversionModule, options: ConversionOptions): void {
		if (!conversion.callback) {
			this.app.error(`Delta conversion ${conversion.title} missing callback`);
			return;
		}

		// ConversionOptions structurally satisfies ProcessingOptions (only
		// `resend` is read downstream), so it stores without a cast.
		this.deltaConversions.push({ conversion, options });

		// Install the process-wide delta input handler exactly once.
		// registerDeltaInputHandler has no unregister API, so registering one
		// per start()/stop() cycle would leak a handler (and the PluginManager
		// it closes over) on every restart. The single handler routes each
		// delta to whichever manager is currently active.
		if (!deltaHandlerRegistered) {
			deltaHandlerRegistered = true;
			// next(delta) first so app.getPath() reflects the just-applied state.
			this.app.registerDeltaInputHandler((delta, next) => {
				next(delta);
				activeManager?.dispatchDelta(delta);
			});
		}
	}

	/**
	 * Fan a delta out to every delta-source conversion wired in the current
	 * start(). Invoked only by the process-wide delta input handler, via the
	 * active manager. The stopped check neutralises a delta that arrives after
	 * stop() but before a new manager claims the active slot.
	 */
	private dispatchDelta(delta: unknown): void {
		if (this.stopped) return;
		// ON_DELTA conversions are purely event-driven, so we neither record
		// lastInputs nor arm a resend timer for them (see processOutput). AIS is
		// the only ON_DELTA module: a resend would re-broadcast a single stale
		// target every interval (lastInputs holds just one delta), making a dead
		// contact look live on an MFD. The arg array is identical for every
		// delta-conversion this tick, so allocate it once.
		const args: unknown[] = [delta];
		for (const { conversion, options } of this.deltaConversions) {
			const result = this.invokeCallback(conversion, args, BUCKET_PREFIX.DELTA);
			// The process-wide delta handler fires on every server-wide delta;
			// the AIS callback returns [] for the overwhelming majority that
			// are not AIS. Skip the processOutput promise chain for that no-op.
			// Array.isArray screens out a Promise result (a Promise is not an
			// array), so an async callback still falls through to processOutput.
			if (result === undefined || (Array.isArray(result) && result.length === 0)) {
				continue;
			}
			void this.processOutput(conversion, options, result);
		}
	}

	private mapRxJS(conversion: ConversionModule, options: ConversionOptions): void {
		const keys = resolveKeys(conversion.keys, options);
		const timeouts = conversion.timeouts || [];

		this.app.debug(`Setting up conversion: ${conversion.title} with ${keys.length} keys`);

		// Per-key timestamp / value records, plus a parallel typed timestamp
		// array for the per-delta freshness check. Avoids O(keys) hash lookups
		// on every value update.
		const now0 = Date.now();
		const timestamps = new Array<number>(keys.length).fill(now0);
		const values = new Array<unknown>(keys.length).fill(null);
		const keyIndex = new Map<string, number>();
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i];
			if (k !== undefined) keyIndex.set(k, i);
		}

		// Reused on every emit so we do not allocate `keys.length` slots per
		// delta. The downstream Subject + debounceTime always reads the
		// latest reference at fire time, so mutate-in-place is safe.
		const currentValues = new Array<unknown>(keys.length);

		// Plain Subject (not BehaviorSubject) so the pipeline stays idle
		// until a real value arrives. A BehaviorSubject([]) seed would fire
		// through debounceTime and arm the resend timer before any data.
		const combinedBus = new Subject<unknown[]>();

		keys.forEach((skKey) => {
			// Accept both shapes during the legacy-flat to nested-sources transition.
			// Panel writes use the dotted Signal K path as the source key; legacy
			// on-disk configs and migrate.ts use the dotless propName form. Reading
			// both keeps source-locks working regardless of how the config landed.
			const sourceRef = (options[skKey] ?? options[pathToPropName(skKey)]) as string | undefined;

			let bus = this.app.streambundle.getSelfBus(skKey as Path);

			if (sourceRef) {
				// SK `$source` values are composites like `gps1.0`. Accept an
				// exact match or a label prefix (`gps1` matches `gps1.0`,
				// `gps1.1`, ...) so the UI description "enter a source label"
				// matches real stream values.
				const sourceRefWithDot = `${sourceRef}.`;
				bus = bus.filter((x: NormalizedDelta) => {
					const src = x.$source;
					if (!src) return false;
					return src === sourceRef || src.startsWith(sourceRefWithDot);
				});
			}

			const unsubscribe = bus.onValue((streamData: NormalizedDelta) => {
				const value: unknown = streamData.value;

				const now = Date.now();
				const idx = keyIndex.get(skKey);
				if (idx !== undefined) {
					timestamps[idx] = now;
					values[idx] = value;
				}

				for (let i = 0; i < keys.length; i++) {
					const timeout = timeouts[i];
					const ts = timestamps[i] ?? 0;
					currentValues[i] = !isDefined(timeout) || ts + (timeout || 0) > now ? values[i] : null;
				}

				combinedBus.next(currentValues);
			});

			if (unsubscribe) {
				this.unsubscribes.push(unsubscribe);
			}
		});

		const subscription = combinedBus.pipe(debounceTime(STREAM_DEBOUNCE_MS)).subscribe({
			next: (args) => {
				if (this.stopped) return;
				this.lastInputs.set(conversion, args.slice());
				const result = this.invokeCallback(conversion, args, BUCKET_PREFIX.STREAM);
				if (result === undefined) return;
				void this.processOutput(conversion, options, result);
			},
			error: (err) => {
				this.throttledError(
					this.bucketKey(BUCKET_PREFIX.STREAM, conversion),
					`Stream error for ${this.moduleLabel(conversion)}: ${errMessage(err)}`,
				);
			},
		});

		this.unsubscribes.push(() => {
			subscription.unsubscribe();
			combinedBus.complete();
		});
	}

	private mapSubscription(conversion: ConversionModule, options: ConversionOptions): void {
		const keys = resolveKeys(conversion.keys, options);

		// Event-like sources (notifications, alarms) need policy:"instant" so
		// Signal K's "fixed" 1000ms period doesn't drop rapid-fire alerts.
		const subscription = {
			context: (conversion.context || VESSELS_SELF_CONTEXT) as Context,
			subscribe: keys.map((key) => ({
				path: key as Path,
				policy: "instant" as const,
			})),
		};

		this.app.debug(`subscription: ${JSON.stringify(subscription)}`);

		this.app.subscriptionmanager.subscribe(
			subscription,
			this.unsubscribes,
			(err: unknown) =>
				this.throttledError(
					this.bucketKey(BUCKET_PREFIX.SUBSCRIPTION, conversion),
					`Subscription error for ${this.moduleLabel(conversion)}: ${errMessage(err)}`,
				),
			(delta) => {
				if (this.stopped) return;
				const args: unknown[] = [delta];
				this.lastInputs.set(conversion, args);
				const result = this.invokeCallback(conversion, args, BUCKET_PREFIX.SUBSCRIPTION);
				if (result === undefined) return;
				void this.processOutput(conversion, options, result);
			},
		);
	}

	private mapTimer(conversion: ConversionModule, options: ConversionOptions): void {
		if (!conversion.interval) {
			this.app.error(`Timer conversion ${conversion.title} missing interval`);
			return;
		}

		if (!conversion.callback) {
			this.app.error(`Timer conversion ${conversion.title} missing callback`);
			return;
		}

		const timer = setInterval(() => {
			if (this.stopped) return;
			const args: unknown[] = [this.app];
			this.lastInputs.set(conversion, args);
			const result = this.invokeCallback(conversion, args, BUCKET_PREFIX.TIMER);
			if (result === undefined) return;
			void this.processOutput(conversion, options, result);
		}, conversion.interval);

		this.timers.push(timer);
	}

	private sourceTypes: Record<NonNullable<ConversionModule["sourceType"]>, SourceTypeMapper> = {
		[SOURCE_TYPE.ON_DELTA]: (...args) => this.mapOnDelta(...args),
		[SOURCE_TYPE.ON_VALUE_CHANGE]: (...args) => this.mapRxJS(...args),
		[SOURCE_TYPE.SUBSCRIPTION]: (...args) => this.mapSubscription(...args),
		[SOURCE_TYPE.TIMER]: (...args) => this.mapTimer(...args),
	};

	private async processToN2K(values: N2KMessage[] | null, optionKey?: string): Promise<void> {
		if (!values) return;

		if (!this.nmea2000Ready) {
			this.app.debug("NMEA 2000 output not yet available, dropping message");
			return;
		}

		try {
			const validPgns = values.filter(isDefined);
			const debugEnabled = isDebugEnabled(this.app);
			let emitted = 0;

			for (const pgn of validPgns) {
				try {
					const validatedPgn = withCanonicalPgnPriority(validateN2KMessage(pgn));
					if (debugEnabled) {
						this.app.debug(`emit nmea2000JsonOut ${formatN2KMessage(validatedPgn)}`);
					}
					this.app.emit("nmea2000JsonOut", validatedPgn);
					emitted++;
					if (optionKey !== undefined) {
						this.recordEmit(optionKey);
					}
				} catch (err) {
					this.throttledError(
						this.processBucketKey(optionKey),
						`Error writing PGN ${JSON.stringify(pgn)}: ${errMessage(err)}`,
					);
				}
			}

			this.app.reportOutputMessages(emitted);
		} catch (err) {
			this.throttledError(
				this.processBucketKey(optionKey),
				`Error processing N2K values: ${errMessage(err)}`,
			);
		}
	}

	/**
	 * Per-message hook called immediately after the `nmea2000JsonOut` emit.
	 * One Map.get+set per emit; the state object is mutated in place so the
	 * counter/timestamp update is two field writes, no additional allocation.
	 *
	 * Sub-conversion keys arrive here as `PARENT[idx]` (e.g. `BATTERY[0]`,
	 * `BATTERY[1]`); the bracket suffix is stripped so all sub-conversions of
	 * a module aggregate under the parent optionKey. Without this aggregation,
	 * getStatusSnapshot() would look up the parent key and find nothing for
	 * every factory-bearing module (BATTERY, ENGINE_PARAMETERS, TANKS, SOLAR,
	 * EXHAUST_TEMPERATURE, RAYMARINE_BRIGHTNESS, TEMPERATURE_*).
	 *
	 * stripSubIndex does no allocation on the single-PGN path; the
	 * sub-conversion path allocates one substring per emit, amortized across
	 * the conversion's full traffic.
	 */
	private recordEmit(key: string): void {
		const parent = stripSubIndex(key);
		const entry = this.getPerConversionState(parent);
		entry.emitCount++;
		entry.lastEmitAt = Date.now();
	}

	/**
	 * Snapshot of plugin runtime state for the panel's status dashboard.
	 * Read-only; callers must not retain references to the returned arrays
	 * across event-loop turns since this PluginManager may stop and clear them.
	 */
	public getStatusSnapshot(): import("./api/types.js").StatusSnapshot {
		const now = Date.now();
		const perConversion: import("./api/types.js").PerConversionStatus[] = this.conversions.map(
			(c) => {
				// All four pieces of per-conversion state (enabled, emit counter,
				// last-emit timestamp, latest error) live in one record indexed
				// by parent optionKey. Sub-conversions (BATTERY[0], BATTERY[1],
				// ...) and per-source error keys (stream/delta/subscription/
				// timer/resend) aggregate under the bare parent key, which is
				// exactly what the panel displays per card.
				const state = this.perConversion.get(c.optionKey);
				const entry: import("./api/types.js").PerConversionStatus = {
					key: c.optionKey,
					title: c.title,
					enabled: state?.enabled ?? false,
					emitCount: state?.emitCount ?? 0,
				};
				if (state?.lastEmitAt !== undefined) {
					entry.lastEmitMs = now - state.lastEmitAt;
				}
				if (state?.latestError !== undefined) {
					entry.lastErrorMessage = state.latestError.message;
					entry.lastErrorAgeMs = now - state.latestError.emittedAt;
				}
				return entry;
			},
		);

		return {
			pluginRunning: this.running,
			nmea2000Ready: this.nmea2000Ready,
			enabledCount: this.lastEnabledCount,
			totalConversions: this.conversions.length,
			perConversion,
			startTime: this.startTime,
		};
	}

	/**
	 * Catalog of loaded conversion modules for the panel's `/api/conversions`
	 * endpoint. One entry per module loaded at construction. `paths` is empty
	 * for modules whose keys are a function of runtime config (e.g. per-engine
	 * factories): the panel falls back to free-text in that case. The mapping is
	 * pure module metadata, so it lives in buildConversionMetadata and is shared
	 * with the disabled-plugin catalog path in index.ts.
	 */
	public getConversionMetadata(): ConversionMetadata[] {
		return buildConversionMetadata(this.conversions);
	}
}
