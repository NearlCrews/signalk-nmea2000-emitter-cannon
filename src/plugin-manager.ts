import type { Context, NormalizedDelta, Path } from "@signalk/server-api";
import { debounceTime, Subject } from "rxjs";
import { buildConversionMetadata } from "./api/conversion-metadata.js";
import { findOrphanExtrasMetaKeys } from "./api/extras-meta.js";
import type { ConversionMetadata, PerConversionStatus, StatusSnapshot } from "./api/types.js";
import { buildPluginOptions } from "./config/pluginOptions.js";
import { COMPETING_WIND_PRODUCERS } from "./config/windConflicts.js";
import {
	DEFAULT_GLOBAL_RESEND_SECONDS,
	SOURCE_TYPE,
	STREAM_DEBOUNCE_MS,
	VESSELS_SELF_CONTEXT,
} from "./constants.js";
import { resetCourseValueCache } from "./conversions/courseData.js";
import { createConversionModules } from "./conversions/index.js";
import {
	classifySourceOrigin,
	SOURCE_ORIGIN,
	sourceMatchesFilter,
} from "./recommendation/busSource.js";
import type {
	ConversionModule,
	ConversionOptions,
	N2KMessage,
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
import { resolveRefreshInterval } from "./utils/refreshInterval.js";
import { clearAllSmoothers } from "./utils/smoothing.js";

function resolveKeys(
	keys: string[] | ((options: ConversionOptions) => string[]) | undefined,
	options: ConversionOptions,
): string[] {
	if (keys === undefined) return [];
	if (typeof keys === "function") return keys(options);
	return keys;
}

interface DeltaSource {
	type?: unknown;
	src?: unknown;
	pgn?: unknown;
	canName?: unknown;
	label?: unknown;
	talker?: unknown;
}

interface DeltaValueLike {
	path?: unknown;
	value?: unknown;
}

interface DeltaUpdateLike {
	$source?: unknown;
	source?: DeltaSource;
	values?: DeltaValueLike[];
}

interface WireResult {
	wiredCount: number;
	hadFailure: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sourcePgn(source: DeltaSource | null | undefined): number | undefined {
	const value = source?.pgn;
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
	return undefined;
}

function deltaSourceRef(update: DeltaUpdateLike): string {
	if (typeof update.$source === "string" && update.$source.length > 0) return update.$source;
	const source = update.source;
	if (!source) return "no_source";
	const label =
		typeof source.label === "string" && source.label.length > 0 ? source.label : undefined;
	const canName =
		typeof source.canName === "string" && source.canName.length > 0 ? source.canName : undefined;
	const src =
		typeof source.src === "string" || typeof source.src === "number"
			? String(source.src)
			: undefined;
	if (canName !== undefined) return `${label ?? src ?? "unknown_source"}.${canName}`;
	if (src !== undefined) return `${label ?? canName ?? "unknown_source"}.${src}`;
	if (source.type === "plugin") return label ?? "unknown_source";
	const talker =
		typeof source.talker === "string" && source.talker.length > 0 ? source.talker : undefined;
	return `${label ?? "unknown_source"}.${talker ?? "XX"}`;
}

function pathMatchesSubscriptionKey(path: string, key: string): boolean {
	if (path === key) return true;
	if (key.endsWith("*")) return path.startsWith(key.slice(0, -1));
	return path.startsWith(`${key}.`);
}

function mergeAllowedPaths(
	parent: string[] | undefined,
	child: string[] | undefined,
): string[] | undefined {
	if (!parent && !child) return undefined;
	return [...new Set([...(parent ?? []), ...(child ?? [])])];
}

function mergeAllowedPgns(
	parent: Record<string, readonly number[]> | undefined,
	child: Record<string, readonly number[]> | undefined,
): Record<string, readonly number[]> | undefined {
	if (!parent && !child) return undefined;
	const out: Record<string, readonly number[]> = { ...(parent ?? {}) };
	for (const [path, pgns] of Object.entries(child ?? {})) {
		out[path] = [...new Set([...(out[path] ?? []), ...pgns])];
	}
	return out;
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
 * incrementally as inputs, emits, drops, and errors happen. Factory children
 * retain their indexed key while each event is also folded into the parent
 * record used by the catalog card.
 */
interface PerConversionState {
	enabled: boolean;
	emitCount: number;
	inputCount: number;
	emptyOutputCount: number;
	sourceFilterDropCount: number;
	nmea2000EchoDropCount: number;
	lastEmitAt?: number;
	lastInputAt?: number;
	lastActivityAt?: number;
	lastScheduledActivityAt?: number;
	inputPathLastSeenAt?: Map<string, number>;
	lastEmptyOutputAt?: number;
	lastDrop?: { reason: "publisher-filter" | "nmea2000-echo"; at: number };
	latestError?: { message: string; emittedAt: number };
}

/** Runtime identity and activity expectations for one wired conversion. */
interface RuntimeStatusDescriptor {
	key: string;
	title: string;
	parentKey?: string;
	mappingIndex?: number;
	inputPaths: string[];
	inputTimeoutMs: Map<string, number>;
	expectedActivityMs?: number;
	waitsForInput: boolean;
}

// Not idempotent on a reused instance: stop() clears this.conversions, so a
// subsequent start() on the same instance is a no-op. index.ts always discards
// the instance after stop() and constructs a fresh PluginManager on restart.
export class PluginManager {
	private app: SignalKApp;
	private conversions: ConversionModule[] = [];
	private unsubscribes: Array<() => void> = [];
	private timers: NodeJS.Timeout[] = [];
	/**
	 * Delta-source conversions wired by mapOnDelta in the current start().
	 * A factory-owned delta input handler iterates this list. Manager-only
	 * Advisor restarts reuse that handler, while Signal K host restarts register
	 * a fresh handler after the server removes the prior lifecycle's handler.
	 */
	private deltaConversions: Array<{
		conversion: ConversionModule;
		options: ConversionOptions;
	}> = [];
	private nmea2000Ready = false;
	private globalResendInterval = DEFAULT_GLOBAL_RESEND_SECONDS;
	private configuredOptions: Record<string, ConversionOptions> = {};
	/** Flipped by stop() so callbacks already in flight leave this manager idle. */
	private stopped = false;
	private running = false;
	/**
	 * Immediate timer callbacks parked until the factory-level Signal K
	 * readiness listener calls notifyNmea2000Ready(). Keeping these callbacks
	 * inside the manager avoids registering plugin-bound app.on listeners that
	 * Signal K's wrapped-emitter bookkeeping retains across manager-only
	 * Advisor restarts.
	 */
	private deferredImmediateRuns: Array<() => void> = [];
	/**
	 * Last input arguments observed for each conversion. Used by the resend
	 * timer to re-invoke the conversion callback with the most recent input
	 * (so time-derived callbacks like systemTime produce fresh output) instead
	 * of re-emitting a stale cached N2KMessage[].
	 */
	private lastInputs: Map<ConversionModule, unknown[]> = new Map();
	/** Rebuild current stream inputs so resend ticks reapply per-key freshness. */
	private freshInputProviders: Map<ConversionModule, () => unknown[] | undefined> = new Map();
	/**
	 * Number of conversions that start() reported as enabled. Captured so a
	 * late nmea2000OutAvailable event can refresh the plugin status from
	 * "Waiting for NMEA 2000 output..." to the running form without re-running
	 * the full enablement sweep.
	 */
	private lastEnabledCount = 0;
	private lastConfigurationErrorCount = 0;
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
	 * Per-conversion state records indexed by both runtime child and parent key.
	 * Replaces
	 * four earlier Maps (emitCounts, lastEmitAt, lastEnabledKeys, and the
	 * latestErrorByParent secondary index) that all walked the same key space.
	 *
	 * Sub-conversion buckets like `BATTERY[0]` retain their own record and also
	 * update the bare parent optionKey (BATTERY), which is what the panel
	 * displays per card. Entries are
	 * lazily created by recordEmit() and throttledError() and pre-seeded for
	 * every enabled conversion in start() so the snapshot's `enabled` flag is
	 * O(1).
	 *
	 * Cleared at start() and stop() boundaries alongside errorBuckets.
	 */
	private perConversion: Map<string, PerConversionState> = new Map();
	private runtimeStatusDescriptors: Map<string, RuntimeStatusDescriptor> = new Map();
	private startTime = Date.now();
	private localDeltaHandlerRegistered = false;
	private readonly ensureDeltaInputHandler: () => void;

	private getPerConversionState(key: string): PerConversionState {
		let entry = this.perConversion.get(key);
		if (entry === undefined) {
			entry = {
				enabled: false,
				emitCount: 0,
				inputCount: 0,
				emptyOutputCount: 0,
				sourceFilterDropCount: 0,
				nmea2000EchoDropCount: 0,
			};
			this.perConversion.set(key, entry);
		}
		return entry;
	}

	/** Update a runtime child and its parent aggregate with one timestamp. */
	private updatePerConversionStates(
		key: string,
		update: (entry: PerConversionState, now: number) => void,
	): void {
		const now = Date.now();
		update(this.getPerConversionState(key), now);
		const parent = stripSubIndex(key);
		if (parent !== key) update(this.getPerConversionState(parent), now);
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
		ensureDeltaInputHandler?: () => void,
	) {
		this.app = app;
		this.ensureDeltaInputHandler =
			ensureDeltaInputHandler ??
			(() => {
				if (this.localDeltaHandlerRegistered) return;
				this.app.registerDeltaInputHandler((delta, next) => {
					try {
						next(delta);
					} catch (error) {
						this.app.error(`Unable to forward delta input: ${errMessage(error)}`);
						return;
					}
					try {
						this.handleDeltaInput(delta);
					} catch (error) {
						this.app.error(`Unable to process delta input: ${errMessage(error)}`);
					}
				});
				this.localDeltaHandlerRegistered = true;
			});

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
	}

	/**
	 * Receive the one host-level NMEA 2000 readiness notification. The plugin
	 * factory owns the only app.on listener and routes it to the current manager,
	 * so replacing a manager never adds another wrapped-emitter callback.
	 */
	public notifyNmea2000Ready(): void {
		if (this.stopped || this.nmea2000Ready) return;
		this.nmea2000Ready = true;
		this.app.debug("NMEA 2000 output is now available");

		const deferredRuns = this.deferredImmediateRuns;
		this.deferredImmediateRuns = [];
		for (const run of deferredRuns) {
			try {
				run();
			} catch (error) {
				this.app.error(`Unable to run deferred NMEA 2000 output: ${errMessage(error)}`);
			}
		}

		// If start() completed while output was unavailable, refresh the status
		// now that emission and any deferred identity messages are active.
		if (this.lastConfigurationErrorCount > 0) {
			this.setConfigurationErrorStatus();
		} else if (this.lastEnabledCount > 0) {
			this.app.setPluginStatus(this.runningStatus(this.lastEnabledCount));
		}
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

	private setConfigurationErrorStatus(): void {
		const errorNoun = this.lastConfigurationErrorCount === 1 ? "conversion" : "conversions";
		const wiredNoun = this.lastEnabledCount === 1 ? "conversion is" : "conversions are";
		this.app.setPluginError(
			`Configuration error: ${this.lastConfigurationErrorCount} enabled ${errorNoun} could not be safely wired. ${this.lastEnabledCount} ${wiredNoun} wired.`,
		);
	}

	/**
	 * Extract the runtime optionKey from a throttle-bucket key. Bucket keys
	 * are `<prefix>:<id>[:<source>]` where id is either `OPTION_KEY` or
	 * `OPTION_KEY[N]` for sub-conversions. The indexed identity is preserved so
	 * the panel can identify the failing mapping row; the write path also folds
	 * it into the parent aggregate.
	 */
	private conversionKeyFromBucketKey(bucketKey: string): string | undefined {
		const firstColon = bucketKey.indexOf(":");
		if (firstColon === -1) return undefined;
		const afterPrefix = bucketKey.substring(firstColon + 1);
		const secondColon = afterPrefix.indexOf(":");
		return secondColon === -1 ? afterPrefix : afterPrefix.substring(0, secondColon);
	}

	/**
	 * Emit an error message with per-key throttling. The first message for a
	 * key passes through immediately; subsequent identical-key errors within
	 * ERROR_THROTTLE_MS are counted, and when the window expires the next
	 * error appends a suppressed-count summary. Keeps a misbehaving callback
	 * from flooding the server log on every delta.
	 *
	 * Also updates the exact runtime conversion and its parent aggregate so the
	 * panel can surface both the failing mapping and the card-level warning.
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
			const conversionKey = this.conversionKeyFromBucketKey(key);
			if (conversionKey !== undefined) {
				this.updatePerConversionStates(conversionKey, (entry) => {
					entry.latestError = { message, emittedAt: now };
				});
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

	private acceptsInput(conversion: ConversionModule, args: unknown[], source: string): boolean {
		if (!conversion.acceptsInput) return true;
		try {
			return conversion.acceptsInput(...args);
		} catch (err) {
			const message = errMessage(err);
			this.throttledError(
				this.bucketKey(BUCKET_PREFIX.CALLBACK, conversion, `${source}-accepts-input`),
				`Error in ${source} input acceptance for ${this.moduleLabel(conversion)}: ${message}`,
			);
			return false;
		}
	}

	private expectedActivityFor(
		conversion: ConversionModule,
		options: ConversionOptions,
	): { intervalMs?: number; waitsForInput: boolean } {
		const sourceType = conversion.sourceType ?? SOURCE_TYPE.ON_VALUE_CHANGE;
		if (
			sourceType === SOURCE_TYPE.TIMER &&
			typeof conversion.interval === "number" &&
			Number.isFinite(conversion.interval) &&
			conversion.interval > 0
		) {
			return { intervalMs: conversion.interval, waitsForInput: false };
		}

		const refreshInterval = resolveRefreshInterval(conversion);
		if (refreshInterval !== undefined) {
			return { intervalMs: refreshInterval, waitsForInput: true };
		}

		if (
			conversion.allowResend !== false &&
			sourceType !== SOURCE_TYPE.ON_DELTA &&
			sourceType !== SOURCE_TYPE.TIMER
		) {
			const resendSeconds =
				typeof options.resend === "number" && options.resend > 0
					? options.resend
					: this.globalResendInterval;
			if (Number.isFinite(resendSeconds) && resendSeconds > 0) {
				return { intervalMs: resendSeconds * 1000, waitsForInput: true };
			}
		}

		return { waitsForInput: sourceType !== SOURCE_TYPE.TIMER };
	}

	private registerRuntimeStatus(
		conversion: ConversionModule,
		options: ConversionOptions,
		parentKey?: string,
		mappingIndex?: number,
	): void {
		const key = conversion.optionKey;
		if (!key) return;
		const activity = this.expectedActivityFor(conversion, options);
		const resolvedInputPaths = resolveKeys(conversion.keys, options);
		const inputPaths = [...new Set(resolvedInputPaths)];
		const inputTimeoutMs = new Map<string, number>();
		for (let index = 0; index < resolvedInputPaths.length; index++) {
			const timeout = conversion.timeouts?.[index];
			if (typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0) {
				const path = resolvedInputPaths[index];
				if (path !== undefined) inputTimeoutMs.set(path, timeout);
			}
		}
		this.runtimeStatusDescriptors.set(key, {
			key,
			title: conversion.title,
			...(parentKey === undefined ? {} : { parentKey }),
			...(mappingIndex === undefined ? {} : { mappingIndex }),
			inputPaths,
			inputTimeoutMs,
			...(activity.intervalMs === undefined ? {} : { expectedActivityMs: activity.intervalMs }),
			waitsForInput: activity.waitsForInput,
		});
		this.getPerConversionState(key).enabled = true;
	}

	/**
	 * Expand one enabled conversion into its sub-conversions (factory modules
	 * return one per engine, battery, tank, etc), give each a derived identity,
	 * and dispatch it through the source-type mapper. A single-PGN module wires
	 * as itself; a factory module's children each get a `PARENT[idx]` optionKey
	 * and a useful log label so per-instance errors do not collapse into one
	 * throttle bucket.
	 */
	private wireConversion(conv: ConversionModule, convOptions: ConversionOptions): WireResult {
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
			return { wiredCount: 0, hadFailure: false };
		}

		let wiredCount = 0;
		let hadFailure = false;
		for (let idx = 0; idx < subConversions.length; idx++) {
			const subConversion = subConversions[idx];
			if (subConversion === undefined) {
				hadFailure = true;
				this.app.error(`${this.moduleLabel(conv)} produced an undefined mapping at row ${idx + 1}`);
				continue;
			}
			const allowResend = subConversion.allowResend ?? conv.allowResend;
			const refreshInterval = subConversion.refreshInterval ?? conv.refreshInterval;
			const immediate = subConversion.immediate ?? conv.immediate;
			const keys = subConversion.keys ?? conv.keys;
			const timeouts = subConversion.timeouts ?? conv.timeouts;
			const interval = subConversion.interval ?? conv.interval;
			const context = subConversion.context ?? conv.context;
			const callback = subConversion.callback ?? conv.callback;
			const allowNmea2000InputPaths = mergeAllowedPaths(
				conv.allowNmea2000InputPaths,
				subConversion.allowNmea2000InputPaths,
			);
			const allowNmea2000InputPgns = mergeAllowedPgns(
				conv.allowNmea2000InputPgns,
				subConversion.allowNmea2000InputPgns,
			);

			const sourceType = subConversion.sourceType ?? conv.sourceType ?? SOURCE_TYPE.ON_VALUE_CHANGE;
			const mapper = this.sourceTypes[sourceType];

			if (!mapper) {
				this.app.error(`Unknown conversion type: ${sourceType}`);
				hadFailure = true;
				continue;
			}

			// Sub-conversions from a factory lack optionKey and may lack title,
			// so without this each per-instance error would log as "<unnamed>"
			// and collapse into a shared "?" throttle bucket (e.g. 3 batteries
			// merging into one). Spread into a fresh ConversionModule per
			// sub-conversion; mutating the source would persist annotations
			// across start/stop cycles.
			const labeled: ConversionModule = {
				...conv,
				...subConversion,
				optionKey: subConversion === conv ? conv.optionKey : subIndexKey(conv.optionKey, idx),
				title:
					subConversion === conv
						? conv.title
						: (subConversion.title ?? `${conv.title}, mapping row ${idx + 1}`),
				category: conv.category,
				sourceType,
				...(keys === undefined ? {} : { keys }),
				...(timeouts === undefined ? {} : { timeouts }),
				...(interval === undefined ? {} : { interval }),
				...(context === undefined ? {} : { context }),
				...(callback === undefined ? {} : { callback }),
				...(allowResend === undefined ? {} : { allowResend }),
				...(refreshInterval === undefined ? {} : { refreshInterval }),
				...(immediate === undefined ? {} : { immediate }),
				...(allowNmea2000InputPaths === undefined ? {} : { allowNmea2000InputPaths }),
				...(allowNmea2000InputPgns === undefined ? {} : { allowNmea2000InputPgns }),
				...(conv.presets ? { presets: conv.presets } : {}),
			};

			if (!labeled.callback) {
				this.app.error(`Conversion ${this.moduleLabel(labeled)} has no callback`);
				hadFailure = true;
				continue;
			}
			if (sourceType === SOURCE_TYPE.TIMER && !labeled.interval) {
				this.app.error(`Timer conversion ${this.moduleLabel(labeled)} has no interval`);
				hadFailure = true;
				continue;
			}
			if (
				(sourceType === SOURCE_TYPE.ON_VALUE_CHANGE || sourceType === SOURCE_TYPE.SUBSCRIPTION) &&
				resolveKeys(labeled.keys, convOptions).length === 0
			) {
				this.app.error(`Input conversion ${this.moduleLabel(labeled)} has no input paths`);
				hadFailure = true;
				continue;
			}

			this.registerRuntimeStatus(
				labeled,
				convOptions,
				subConversion === conv ? undefined : conv.optionKey,
				subConversion === conv ? undefined : idx,
			);
			mapper(labeled, convOptions);
			wiredCount++;
		}
		return { wiredCount, hadFailure };
	}

	start(rawOptions: unknown): void {
		try {
			this.stopped = false;
			this.running = false;
			resetCourseValueCache(this.app);
			this.errorBuckets.clear();
			this.perConversion.clear();
			this.runtimeStatusDescriptors.clear();
			this.deferredImmediateRuns = [];
			this.startTime = Date.now();
			// Sync readiness check via the factory flag (see index.ts): it folds
			// the registration-time `app.isNmea2000OutAvailable` snapshot together
			// with the latched one-shot event, so a plugin enabled after output
			// came up still detects readiness here. Reading the appCopy snapshot
			// directly would miss the boot-then-ready case.
			if (this.factoryNmea2000Ready()) {
				this.nmea2000Ready = true;
				this.app.debug("NMEA 2000 output already available at start (factory-latched flag)");
			}
			const options = buildPluginOptions(rawOptions);
			this.configuredOptions = options.conversions;
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
			const blockedByConflict = new Map<string, string[]>();
			for (const [primaryKey, alternateKey] of COMPETING_WIND_PRODUCERS) {
				const primary = options.conversions[primaryKey];
				const alternate = options.conversions[alternateKey];
				if (primary?.enabled !== true || alternate?.enabled !== true) continue;
				const blockers = blockedByConflict.get(alternateKey) ?? [];
				blockers.push(primaryKey);
				blockedByConflict.set(alternateKey, blockers);
			}
			for (const [alternateKey, blockers] of blockedByConflict) {
				this.app.error(
					`Not enabling ${alternateKey}: enabled ${blockers.join(" and ")} wind data conflicts on PGN 130306`,
				);
			}
			let configurationErrorCount = blockedByConflict.size;
			for (const conv of this.conversions) {
				const convOptions = options.conversions[conv.optionKey];
				const isEnabled = isConversionOptions(convOptions) && convOptions.enabled === true;
				if (!isEnabled) continue;
				if (blockedByConflict.has(conv.optionKey)) continue;
				this.app.debug(`Enabling: ${this.moduleLabel(conv)}`);

				if (conv.onOptionsLoaded) {
					conv.onOptionsLoaded(convOptions);
				}

				const { wiredCount, hadFailure } = this.wireConversion(conv, convOptions);
				if (hadFailure || wiredCount === 0) {
					configurationErrorCount++;
				}
				if (wiredCount === 0) {
					this.app.error(
						`Enabled conversion ${this.moduleLabel(conv)} produced no runnable mappings`,
					);
					continue;
				}
				enabledCount++;
				this.getPerConversionState(conv.optionKey).enabled = true;
			}

			this.lastEnabledCount = enabledCount;
			this.lastConfigurationErrorCount = configurationErrorCount;
			if (configurationErrorCount > 0) {
				this.setConfigurationErrorStatus();
			} else if (enabledCount === 0) {
				this.app.setPluginStatus("No conversions enabled. Enable at least one in plugin settings.");
			} else if (!this.nmea2000Ready) {
				// Plugin is wired up but signalk-server has not announced
				// nmea2000OutAvailable yet. notifyNmea2000Ready will refresh to the
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
			throw error instanceof Error ? error : new Error(errorMsg);
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
	 * UI. Signal K host stops leave it false so the UI reflects the stopped
	 * state; manager-only replacements suppress that transient status.
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
		this.conversions = [];

		// Drop delta-conversion wiring. Signal K owns registered input-handler
		// cleanup at the host lifecycle boundary; manager-only Advisor restarts
		// reuse the factory-level handler without retaining this instance.
		this.deltaConversions = [];
		this.configuredOptions = {};

		// Drop deferred immediate callbacks before resetting readiness so this
		// discarded manager retains no conversion closures.
		this.deferredImmediateRuns = [];
		this.nmea2000Ready = false;

		// Drop cached inputs so a subsequent start() begins from a clean slate.
		safe("clear lastInputs", () => this.lastInputs.clear());
		safe("clear freshInputProviders", () => this.freshInputProviders.clear());

		// Reset status-bookkeeping and error-throttle state so a fresh start()
		// reports an accurate enabled count and does not inherit suppressed
		// errors from the prior cycle.
		this.lastEnabledCount = 0;
		this.lastConfigurationErrorCount = 0;
		safe("clear perConversion", () => this.perConversion.clear());
		safe("clear runtimeStatusDescriptors", () => this.runtimeStatusDescriptors.clear());
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
			const currentInput = this.freshInputProviders.get(conversion)?.();
			const lastInput = currentInput ?? this.lastInputs.get(conversion);
			// No input ever observed: skip; do not emit stale defaults.
			if (lastInput === undefined) return;
			if (conversion.optionKey !== undefined) {
				this.recordScheduledActivity(conversion.optionKey);
			}

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

	private allowsNmea2000Input(
		conversion: ConversionModule,
		path: string,
		source: DeltaSource | null | undefined,
	): boolean {
		if (conversion.allowNmea2000InputPaths?.includes(path)) return true;
		const allowedPgns = conversion.allowNmea2000InputPgns?.[path];
		if (!allowedPgns || allowedPgns.length === 0) return false;
		const pgn = sourcePgn(source);
		return pgn !== undefined && allowedPgns.includes(pgn);
	}

	/**
	 * Apply publisher pins and echo protection to every values update in a raw
	 * Signal K delta. Mixed-source deltas retain their safe updates instead of
	 * being accepted or rejected as one indivisible message.
	 */
	private filterDeltaForConversion(
		conversion: ConversionModule,
		options: ConversionOptions,
		delta: unknown,
		getSourceMetadata: () => unknown = () => this.app.getPath?.("sources"),
	): unknown | undefined {
		if (!isRecord(delta) || !Array.isArray(delta.updates)) return delta;
		const subscriptionKeys = [...resolveKeys(conversion.keys, options)].sort(
			(a, b) => b.length - a.length,
		);
		const updates: DeltaUpdateLike[] = [];
		let changed = false;

		for (const rawUpdate of delta.updates) {
			if (!isRecord(rawUpdate) || !Array.isArray(rawUpdate.values)) {
				changed = true;
				continue;
			}
			const update = rawUpdate as DeltaUpdateLike;
			const rawValues = rawUpdate.values as DeltaValueLike[];
			const sourceRef = deltaSourceRef(update);
			let origin = classifySourceOrigin(sourceRef, update.source);
			if (origin === SOURCE_ORIGIN.UNKNOWN) {
				origin = classifySourceOrigin(sourceRef, undefined, getSourceMetadata());
			}
			const values = rawValues.filter((rawValue) => {
				if (!isRecord(rawValue) || typeof rawValue.path !== "string") return false;
				const path = rawValue.path;
				const subscriptionKey = subscriptionKeys.find((key) =>
					pathMatchesSubscriptionKey(path, key),
				);
				const pin =
					options[path] ??
					options[pathToPropName(path)] ??
					(subscriptionKey === undefined
						? undefined
						: (options[subscriptionKey] ?? options[pathToPropName(subscriptionKey)]));
				if (typeof pin === "string" && pin.length > 0 && !sourceMatchesFilter(sourceRef, pin)) {
					this.recordDrop(conversion.optionKey, "publisher-filter");
					return false;
				}
				if (
					origin === SOURCE_ORIGIN.NMEA2000 &&
					!this.allowsNmea2000Input(conversion, path, update.source)
				) {
					this.recordDrop(conversion.optionKey, "nmea2000-echo");
					return false;
				}
				return true;
			});
			const updateChanged = values.length !== rawValues.length;
			if (updateChanged) changed = true;
			if (values.length > 0) updates.push(updateChanged ? { ...update, values } : update);
		}

		if (updates.length === 0) return undefined;
		return changed || updates.length !== delta.updates.length ? { ...delta, updates } : delta;
	}

	private async processOutput(
		conversion: ConversionModule,
		options: ProcessingOptions | null,
		output: N2KMessage[] | Promise<N2KMessage[]> | undefined,
	): Promise<void> {
		try {
			if (output !== undefined) {
				const values = await Promise.resolve(output);
				// A callback Promise can resolve after this manager was stopped or
				// replaced. Leave before recording activity, emitting, or arming a
				// resend timer so the retired manager remains fully quiescent.
				if (this.stopped) return;
				if (values.length === 0) {
					// ON_DELTA callbacks use [] to reject unrelated process-wide
					// deltas. That is not accepted input or an empty conversion result.
					if (conversion.sourceType === SOURCE_TYPE.ON_DELTA) return;
					if (conversion.optionKey !== undefined) {
						this.recordEmptyOutput(conversion.optionKey);
					}
				} else if (
					conversion.sourceType === SOURCE_TYPE.ON_DELTA &&
					conversion.optionKey !== undefined
				) {
					// A non-empty resolved result is the first reliable indication that
					// an ON_DELTA callback accepted this server-wide delta. Record here
					// so async callbacks are handled correctly too.
					this.recordInput(conversion.optionKey);
				}
				await this.processToN2K(values, conversion.optionKey);
			}
		} catch (err) {
			if (this.stopped) return;
			const message = errMessage(err);
			this.throttledError(
				this.bucketKey(BUCKET_PREFIX.PROCESS, conversion),
				`Error processing output for ${this.moduleLabel(conversion)}: ${message}`,
			);
		}

		// Timer-source and freshness-refresh conversions provide their own
		// schedules; arming a resend timer on top would double-emit. ON_DELTA
		// conversions are event-driven: replaying an old AIS target or Course API
		// calculation would make stale state look current.
		if (
			conversion.allowResend === false ||
			resolveRefreshInterval(conversion) !== undefined ||
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

		// The factory coordinates handler ownership across two different
		// lifecycles: Advisor restarts keep the host handler, while a Signal K
		// stop removes it and the next host start registers a fresh one.
		this.ensureDeltaInputHandler();
	}

	/**
	 * Fan a delta out to every delta-source conversion wired in this manager.
	 * Invoked by the factory-owned process-wide delta input handler. The stopped
	 * check neutralizes a delta already in flight during manager replacement.
	 */
	handleDeltaInput(delta: unknown): void {
		if (this.stopped) return;
		let sourceMetadataLoaded = false;
		let sourceMetadata: unknown;
		const getSourceMetadata = (): unknown => {
			if (!sourceMetadataLoaded) {
				sourceMetadata = this.app.getPath?.("sources");
				sourceMetadataLoaded = true;
			}
			return sourceMetadata;
		};
		// ON_DELTA conversions are purely event-driven, so we neither record
		// lastInputs nor arm a resend timer for them (see processOutput). A replay
		// would re-broadcast one stale target or course calculation every interval.
		for (const { conversion, options } of this.deltaConversions) {
			const filteredDelta = this.filterDeltaForConversion(
				conversion,
				options,
				delta,
				getSourceMetadata,
			);
			if (filteredDelta === undefined) continue;
			const args: unknown[] = [filteredDelta];
			const result = this.invokeCallback(conversion, args, BUCKET_PREFIX.DELTA);
			// The process-wide delta handler fires on every server-wide delta.
			// Synchronous callbacks commonly return [] for unrelated updates, so
			// skip the promise chain immediately. Async callbacks are classified
			// after resolution in processOutput.
			if (result === undefined || (Array.isArray(result) && result.length === 0)) continue;
			void this.processOutput(conversion, options, result);
		}
	}

	private mapRxJS(conversion: ConversionModule, options: ConversionOptions): void {
		const keys = resolveKeys(conversion.keys, options);
		const timeouts = conversion.timeouts || [];
		const refreshInterval = resolveRefreshInterval(conversion);

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
		let hasInput = false;
		const refreshValues = (now: number): void => {
			for (let i = 0; i < keys.length; i++) {
				const timeout = timeouts[i];
				const ts = timestamps[i] ?? 0;
				currentValues[i] = !isDefined(timeout) || ts + (timeout || 0) > now ? values[i] : null;
			}
		};
		this.freshInputProviders.set(conversion, () => {
			if (!hasInput) return undefined;
			refreshValues(Date.now());
			return currentValues.slice();
		});

		keys.forEach((skKey) => {
			// Accept both shapes during the legacy-flat to nested-sources transition.
			// Panel writes use the dotted Signal K path as the source key; legacy
			// on-disk configs and migrate.ts use the dotless propName form. Reading
			// both keeps source-locks working regardless of how the config landed.
			const sourceRef = (options[skKey] ?? options[pathToPropName(skKey)]) as string | undefined;

			let bus = this.app.streambundle.getSelfBus(skKey as Path);

			// Apply the optional publisher pin and the default echo guard in one
			// pass. Structured delta metadata is authoritative when present; the
			// server's sources tree covers stream producers that omit it. Unknown
			// origins remain accepted for compatibility. Known NMEA 2000 input is
			// blocked unless the conversion explicitly declares that path as a
			// supporting input that cannot be echoed by its output.
			bus = bus.filter((x: NormalizedDelta) => {
				const src = String(x.$source ?? "");
				if (sourceRef && !sourceMatchesFilter(src, sourceRef)) {
					if (conversion.optionKey !== undefined) {
						this.recordDrop(conversion.optionKey, "publisher-filter");
					}
					return false;
				}
				let origin = classifySourceOrigin(src, x.source);
				if (origin === SOURCE_ORIGIN.UNKNOWN) {
					origin = classifySourceOrigin(src, undefined, this.app.getPath?.("sources"));
				}
				if (
					origin === SOURCE_ORIGIN.NMEA2000 &&
					!this.allowsNmea2000Input(conversion, skKey, x.source)
				) {
					if (conversion.optionKey !== undefined) {
						this.recordDrop(conversion.optionKey, "nmea2000-echo");
					}
					return false;
				}
				return true;
			});

			const unsubscribe = bus.onValue((streamData: NormalizedDelta) => {
				hasInput = true;
				if (conversion.optionKey !== undefined) {
					this.recordInput(conversion.optionKey, skKey);
				}
				const value: unknown = streamData.value;

				const now = Date.now();
				const idx = keyIndex.get(skKey);
				if (idx !== undefined) {
					timestamps[idx] = now;
					values[idx] = value;
				}

				if (refreshInterval === undefined) {
					refreshValues(now);
					combinedBus.next(currentValues);
				}
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

		if (refreshInterval !== undefined) {
			const timer = setInterval(() => {
				if (this.stopped || !hasInput) return;
				if (conversion.optionKey !== undefined) {
					this.recordScheduledActivity(conversion.optionKey);
				}
				refreshValues(Date.now());
				combinedBus.next(currentValues);
			}, refreshInterval);
			this.timers.push(timer);
		}

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
			sourcePolicy: "all" as const,
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
				let sourceMetadataLoaded = false;
				let sourceMetadata: unknown;
				const filteredDelta = this.filterDeltaForConversion(conversion, options, delta, () => {
					if (!sourceMetadataLoaded) {
						sourceMetadata = this.app.getPath?.("sources");
						sourceMetadataLoaded = true;
					}
					return sourceMetadata;
				});
				if (filteredDelta === undefined) return;
				const args: unknown[] = [filteredDelta];
				// Rejected input is invisible to replay state. This lets event-style
				// conversions ignore feedback deltas without poisoning their last
				// accepted input or resetting runtime activity.
				if (!this.acceptsInput(conversion, args, BUCKET_PREFIX.SUBSCRIPTION)) return;
				if (conversion.optionKey !== undefined) this.recordInput(conversion.optionKey);
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

		const run = (): void => {
			if (this.stopped) return;
			if (conversion.optionKey !== undefined) {
				this.recordScheduledActivity(conversion.optionKey);
			}
			const args: unknown[] = [this.app];
			this.lastInputs.set(conversion, args);
			const result = this.invokeCallback(conversion, args, BUCKET_PREFIX.TIMER);
			if (result === undefined) return;
			void this.processOutput(conversion, options, result);
		};

		if (conversion.immediate === true) {
			if (this.nmea2000Ready) {
				run();
			} else {
				// Startup can precede the provider's one-shot ready event. Park the
				// initial identity broadcast inside this manager; the factory's one
				// readiness listener flushes it through notifyNmea2000Ready().
				this.deferredImmediateRuns.push(run);
			}
		}
		const timer = setInterval(run, conversion.interval);

		this.timers.push(timer);
	}

	private sourceTypes: Record<NonNullable<ConversionModule["sourceType"]>, SourceTypeMapper> = {
		[SOURCE_TYPE.ON_DELTA]: (...args) => this.mapOnDelta(...args),
		[SOURCE_TYPE.ON_VALUE_CHANGE]: (...args) => this.mapRxJS(...args),
		[SOURCE_TYPE.SUBSCRIPTION]: (...args) => this.mapSubscription(...args),
		[SOURCE_TYPE.TIMER]: (...args) => this.mapTimer(...args),
	};

	private async processToN2K(values: N2KMessage[] | null, optionKey?: string): Promise<void> {
		// Defense at the final emission boundary for callers other than
		// processOutput and for a stop triggered synchronously by an emit listener.
		if (!values || this.stopped) return;

		if (!this.nmea2000Ready) {
			this.app.debug("NMEA 2000 output not yet available, dropping message");
			return;
		}

		try {
			const validPgns = values.filter(isDefined);
			const debugEnabled = isDebugEnabled(this.app);
			let emitted = 0;

			for (const pgn of validPgns) {
				if (this.stopped) break;
				try {
					const validatedPgn = withCanonicalPgnPriority(validateN2KMessage(pgn));
					if (debugEnabled) {
						this.app.debug(`emit nmea2000JsonOut ${formatN2KMessage(validatedPgn)}`);
					}
					this.app.emit("nmea2000JsonOut", validatedPgn);
					emitted++;
					// An emit listener can synchronously stop this manager. Count the
					// frame that physically emitted, but do not recreate runtime status
					// state that stop() just cleared.
					if (!this.stopped && optionKey !== undefined) {
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
	 * Sub-conversion keys arrive here as `PARENT[idx]`. Each update is retained
	 * on that exact key and folded into the parent card's aggregate.
	 */
	private recordEmit(key: string): void {
		this.updatePerConversionStates(key, (entry, now) => {
			entry.emitCount++;
			entry.lastEmitAt = now;
			entry.lastActivityAt = now;
		});
	}

	private recordInput(key: string, inputPath?: string): void {
		this.updatePerConversionStates(key, (entry, now) => {
			entry.inputCount++;
			entry.lastInputAt = now;
			entry.lastActivityAt = now;
			if (inputPath !== undefined) {
				entry.inputPathLastSeenAt ??= new Map();
				entry.inputPathLastSeenAt.set(inputPath, now);
			}
		});
	}

	private recordEmptyOutput(key: string): void {
		this.updatePerConversionStates(key, (entry, now) => {
			entry.emptyOutputCount++;
			entry.lastEmptyOutputAt = now;
			entry.lastActivityAt = now;
		});
	}

	private recordScheduledActivity(key: string): void {
		this.updatePerConversionStates(key, (entry, now) => {
			entry.lastActivityAt = now;
			entry.lastScheduledActivityAt = now;
		});
	}

	private recordDrop(key: string, reason: "publisher-filter" | "nmea2000-echo"): void {
		this.updatePerConversionStates(key, (entry, now) => {
			if (reason === "publisher-filter") entry.sourceFilterDropCount++;
			else entry.nmea2000EchoDropCount++;
			entry.lastDrop = { reason, at: now };
		});
	}

	private isActivityStale(
		descriptor: RuntimeStatusDescriptor,
		state: PerConversionState | undefined,
		now: number,
	): boolean {
		const cadence = descriptor.expectedActivityMs;
		if (cadence === undefined) return false;
		const baseline =
			state?.lastScheduledActivityAt ??
			(descriptor.waitsForInput ? state?.lastInputAt : this.startTime);
		return baseline !== undefined && now - baseline > cadence * 3;
	}

	private statusEntry(
		descriptor: RuntimeStatusDescriptor,
		state: PerConversionState | undefined,
		now: number,
	): PerConversionStatus {
		const entry: PerConversionStatus = {
			key: descriptor.key,
			title: descriptor.title,
			enabled: state?.enabled ?? false,
			emitCount: state?.emitCount ?? 0,
			inputCount: state?.inputCount ?? 0,
			emptyOutputCount: state?.emptyOutputCount ?? 0,
			sourceFilterDropCount: state?.sourceFilterDropCount ?? 0,
			nmea2000EchoDropCount: state?.nmea2000EchoDropCount ?? 0,
			...(descriptor.parentKey === undefined ? {} : { parentKey: descriptor.parentKey }),
			...(descriptor.mappingIndex === undefined ? {} : { mappingIndex: descriptor.mappingIndex }),
			...(descriptor.inputPaths.length === 0 ? {} : { inputPaths: descriptor.inputPaths }),
			...(descriptor.expectedActivityMs === undefined
				? {}
				: { expectedActivityMs: descriptor.expectedActivityMs }),
		};
		if (state?.lastEmitAt !== undefined) entry.lastEmitMs = now - state.lastEmitAt;
		if (state?.latestError !== undefined) {
			entry.lastErrorMessage = state.latestError.message;
			entry.lastErrorAgeMs = now - state.latestError.emittedAt;
		}
		if (state?.lastInputAt !== undefined) entry.lastInputMs = now - state.lastInputAt;
		if (state?.lastActivityAt !== undefined) entry.lastActivityMs = now - state.lastActivityAt;
		if (state?.lastEmptyOutputAt !== undefined) {
			entry.lastEmptyOutputMs = now - state.lastEmptyOutputAt;
		}
		if (state?.lastDrop !== undefined) {
			entry.lastDropReason = state.lastDrop.reason;
			entry.lastDropAgeMs = now - state.lastDrop.at;
		}
		if (state?.inputPathLastSeenAt && state.inputPathLastSeenAt.size > 0) {
			entry.inputPathLastSeenMs = Object.fromEntries(
				[...state.inputPathLastSeenAt].map(([path, at]) => [path, now - at]),
			);
		}
		const staleInputPaths = descriptor.inputPaths.filter((path) => {
			const timeout = descriptor.inputTimeoutMs.get(path);
			const lastSeenAt = state?.inputPathLastSeenAt?.get(path);
			return timeout !== undefined && lastSeenAt !== undefined && now - lastSeenAt > timeout;
		});
		if (staleInputPaths.length > 0) entry.staleInputPaths = staleInputPaths;
		if (this.isActivityStale(descriptor, state, now) || staleInputPaths.length > 0) {
			entry.activityStale = true;
		}
		return entry;
	}

	/**
	 * Snapshot of plugin runtime state for the panel's status dashboard.
	 * Read-only; callers must not retain references to the returned arrays
	 * across event-loop turns since this PluginManager may stop and clear them.
	 */
	public getStatusSnapshot(): StatusSnapshot {
		const now = Date.now();
		const childDescriptorsByParent = new Map<string, RuntimeStatusDescriptor[]>();
		for (const descriptor of this.runtimeStatusDescriptors.values()) {
			if (descriptor.parentKey === undefined) continue;
			const children = childDescriptorsByParent.get(descriptor.parentKey) ?? [];
			children.push(descriptor);
			childDescriptorsByParent.set(descriptor.parentKey, children);
		}

		const perConversion: PerConversionStatus[] = this.conversions.map((conversion) => {
			const ownDescriptor = this.runtimeStatusDescriptors.get(conversion.optionKey);
			const children = childDescriptorsByParent.get(conversion.optionKey) ?? [];
			const childPaths = children.flatMap((child) => child.inputPaths);
			const expectedCadences = children
				.map((child) => child.expectedActivityMs)
				.filter((cadence): cadence is number => cadence !== undefined);
			const descriptor: RuntimeStatusDescriptor = ownDescriptor ?? {
				key: conversion.optionKey,
				title: conversion.title,
				inputPaths: [...new Set(childPaths)],
				inputTimeoutMs: new Map(),
				...(expectedCadences.length === 0
					? {}
					: { expectedActivityMs: Math.min(...expectedCadences) }),
				waitsForInput: children.every((child) => child.waitsForInput),
			};
			const entry = this.statusEntry(
				{ ...descriptor, key: conversion.optionKey, title: conversion.title },
				this.perConversion.get(conversion.optionKey),
				now,
			);
			if (children.length > 0) {
				const childStatuses = children.map((child) =>
					this.statusEntry(child, this.perConversion.get(child.key), now),
				);
				const staleChildCount = childStatuses.filter((child) => child.activityStale).length;
				const staleInputPaths = [
					...new Set(childStatuses.flatMap((child) => child.staleInputPaths ?? [])),
				];
				entry.staleChildCount = staleChildCount;
				entry.activityStale = staleChildCount > 0;
				if (staleInputPaths.length > 0) entry.staleInputPaths = staleInputPaths;
			}
			return entry;
		});

		for (const descriptor of this.runtimeStatusDescriptors.values()) {
			if (descriptor.parentKey === undefined) continue;
			perConversion.push(this.statusEntry(descriptor, this.perConversion.get(descriptor.key), now));
		}

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
	 * endpoint. One entry per module loaded at construction. Factory modules
	 * receive the same flattened options used at runtime so configured engine,
	 * battery, tank, and other mapped paths are visible to the panel and Advisor.
	 */
	public getConversionMetadata(): ConversionMetadata[] {
		return buildConversionMetadata(this.conversions, this.configuredOptions);
	}
}
