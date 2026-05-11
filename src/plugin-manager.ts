import type { Context, NormalizedDelta, Path } from "@signalk/server-api";
import { debounceTime, Subject } from "rxjs";
import {
	DEFAULT_GLOBAL_RESEND_SECONDS,
	OUTPUT_TYPE,
	SOURCE_TYPE,
	STREAM_DEBOUNCE_MS,
	VESSELS_SELF_CONTEXT,
} from "./constants.js";
import { createConversionModules } from "./conversions/index.js";
import type {
	ConversionModule,
	ConversionOptions,
	N2KMessage,
	OutputTypeProcessor,
	PluginOptions,
	ProcessingOptions,
	RawPluginOptions,
	SignalKApp,
	SignalKPlugin,
	SourceTypeMapper,
	SubConversionModule,
} from "./types/index.js";
import { isConversionOptions, normalizePluginOptions } from "./types/index.js";
import { isDebugEnabled } from "./utils/debugUtils.js";
import { errMessage } from "./utils/errorUtils.js";
import { formatN2KMessage, validateN2KMessage } from "./utils/messageUtils.js";
import { isDefined, pathToPropName } from "./utils/pathUtils.js";
import { clearAllSmoothers } from "./utils/smoothing.js";

function resolveKeys(
	keys: string[] | ((options: ConversionOptions) => string[]) | undefined,
	options: ConversionOptions,
): string[] {
	if (keys === undefined) return [];
	if (typeof keys === "function") return keys(options);
	return keys;
}

// Not idempotent on a reused instance: stop() clears this.conversions and
// removes the constructor-installed listener, so a subsequent start() on the
// same instance is a no-op. index.ts always discards the instance after stop()
// and constructs a fresh PluginManager on restart.
export class PluginManager {
	private app: SignalKApp;
	private conversions: ConversionModule[] = [];
	private unsubscribes: Array<() => void> = [];
	private timers: NodeJS.Timeout[] = [];
	private nmea2000Ready = false;
	private globalResendInterval = DEFAULT_GLOBAL_RESEND_SECONDS;
	/**
	 * Flipped by stop(). registerDeltaInputHandler in @signalk/server-api 2.x
	 * exposes no unregister API, so handlers from prior start()/stop() cycles
	 * remain installed forever. The handler closure checks this flag first and
	 * bails out, neutralising zombie handlers without changing wire behaviour.
	 */
	private stopped = false;
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

	constructor(app: SignalKApp, plugin: SignalKPlugin) {
		this.app = app;

		// Load conversions at initialization
		this.conversions = createConversionModules(app, plugin);
		this.app.debug(`Loaded ${this.conversions.length} conversion modules`);

		// Wait for NMEA2000 output to be available before emitting
		this.onNmea2000Ready = () => {
			this.nmea2000Ready = true;
			this.app.debug("NMEA2000 output is now available");
		};
		this.app.on("nmea2000OutAvailable", this.onNmea2000Ready);
	}

	private moduleLabel(conversion: ConversionModule): string {
		const title = conversion.title || "<unnamed>";
		const key = conversion.optionKey ? ` [${conversion.optionKey}]` : "";
		return `${title}${key}`;
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
			this.app.error(
				`Error in ${source} callback for ${this.moduleLabel(conversion)}: ${message}`,
			);
			return undefined;
		}
	}

	start(rawOptions: RawPluginOptions | PluginOptions): void {
		try {
			this.stopped = false;
			const options = normalizePluginOptions(rawOptions);
			this.globalResendInterval =
				options.globalResendInterval || DEFAULT_GLOBAL_RESEND_SECONDS;

			this.app.setPluginStatus("Starting...");
			this.app.debug(`=== SIGNALK-NMEA2000-EMITTER-CANNON STARTING ===`);
			this.app.debug(
				`Plugin options received: ${JSON.stringify(Object.keys(options.conversions))}`,
			);
			this.app.debug(`Using ${this.conversions.length} conversion modules`);

			let enabledCount = 0;
			for (const conv of this.conversions) {
				const convOptions = options.conversions[conv.optionKey];
				const isEnabled =
					isConversionOptions(convOptions) && convOptions.enabled === true;
				this.app.debug(
					`Checking conversion ${conv.title} (${conv.optionKey}) - enabled: ${isEnabled}`,
				);

				if (!isEnabled) continue;
				enabledCount++;

				this.app.debug(`*** SETTING UP ENABLED CONVERSION: ${conv.title} ***`);

				if (conv.onOptionsLoaded) {
					conv.onOptionsLoaded(convOptions);
				}

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
					continue;
				}

				this.app.debug(
					`Setting up ${subConversions.length} subconversions for ${conv.title}`,
				);

				for (const subConversion of subConversions) {
					if (subConversion === undefined) continue;

					const sourceType =
						subConversion.sourceType ?? SOURCE_TYPE.ON_VALUE_CHANGE;
					const mapper = this.sourceTypes[sourceType];

					if (!mapper) {
						this.app.error(`Unknown conversion type: ${sourceType}`);
						continue;
					}

					mapper(subConversion as ConversionModule, convOptions);
				}
			}

			this.app.debug(
				`=== SIGNALK-NMEA2000-EMITTER-CANNON STARTUP COMPLETE ===`,
			);
			this.app.setPluginStatus(
				`Running with ${enabledCount} conversions enabled`,
			);
		} catch (error) {
			const errorMsg = errMessage(error);
			this.app.error(`Failed to start plugin: ${errorMsg}`);
			this.app.setPluginError(`Startup failed: ${errorMsg}`);
			try {
				this.stop();
			} catch (stopErr) {
				this.app.error(
					`stop() during start() failure also failed: ${errMessage(stopErr)}`,
				);
			}
		}
	}

	/**
	 * Each cleanup step is wrapped so one failure doesn't prevent the rest
	 * from running. Errors are collected and reported once. stop() must not
	 * throw: Signal K calls it on plugin disable/uninstall.
	 */
	stop(): void {
		this.stopped = true;
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

		// Wipe ExponentialSmoother state across plugin restarts.
		safe("clearAllSmoothers", () => clearAllSmoothers());

		// Surface the stopped state in the Signal K admin UI.
		safe("setPluginStatus(Stopped)", () => this.app.setPluginStatus("Stopped"));

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
	private async processOutput(
		conversion: ConversionModule,
		options: ProcessingOptions | null,
		output: N2KMessage[] | Promise<N2KMessage[]> | undefined,
	): Promise<void> {
		try {
			if (output !== undefined) {
				const values = await Promise.resolve(output);
				const processor = this.outputTypes[OUTPUT_TYPE.TO_N2K];
				if (processor) {
					await processor(values);
				}
			}
		} catch (err) {
			const message = errMessage(err);
			this.app.error(
				`Error processing output for ${this.moduleLabel(conversion)}: ${message}`,
			);
		}

		// Timer-source conversions (e.g. systemTime) provide their own
		// schedule; arming a resend timer on top would double-emit every
		// global-resend window.
		if (conversion.sourceType === SOURCE_TYPE.TIMER) {
			return;
		}

		// Resolve effective resend interval: per-conversion overrides global when non-zero
		const effectiveResend =
			options?.resend && options.resend > 0
				? options.resend
				: this.globalResendInterval;

		if (effectiveResend > 0 && !conversion.resendTimer) {
			conversion.resendTimer = setInterval(async () => {
				try {
					if (this.stopped) return;
					const lastInput = this.lastInputs.get(conversion);
					// No input ever observed: skip; do not emit stale defaults.
					if (lastInput === undefined) return;

					const raw = this.invokeCallback(conversion, lastInput, "resend");
					if (raw === undefined) return;

					const values = await Promise.resolve(raw);
					if (this.stopped) return;
					const processor = this.outputTypes[OUTPUT_TYPE.TO_N2K];
					if (processor) {
						await processor(values);
					}
				} catch (err) {
					const message = errMessage(err);
					this.app.error(
						`Error in resend timer for ${this.moduleLabel(conversion)}: ${message}`,
					);
				}
			}, effectiveResend * 1000);

			this.timers.push(conversion.resendTimer);
		}
	}

	private mapOnDelta(
		conversion: ConversionModule,
		options: ConversionOptions,
	): void {
		const processingOptions = options as ProcessingOptions;
		if (!conversion.callback) {
			this.app.error(`Delta conversion ${conversion.title} missing callback`);
			return;
		}

		// next(delta) first so app.getPath() reflects the just-applied state.
		this.app.registerDeltaInputHandler((delta, next) => {
			next(delta);
			if (this.stopped) return;
			const args: unknown[] = [delta];
			this.lastInputs.set(conversion, args);
			const result = this.invokeCallback(conversion, args, "delta");
			if (result === undefined) return;
			void this.processOutput(conversion, processingOptions, result);
		});
	}

	private mapRxJS(
		conversion: ConversionModule,
		options: ConversionOptions,
	): void {
		const pluginOptions = options;
		const keys = resolveKeys(conversion.keys, options);
		const timeouts = conversion.timeouts || [];

		this.app.debug(
			`Setting up conversion: ${conversion.title} with ${keys.length} keys`,
		);

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
			const sourceRef = pluginOptions[pathToPropName(skKey)] as
				| string
				| undefined;

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
					currentValues[i] =
						!isDefined(timeout) || ts + (timeout || 0) > now ? values[i] : null;
				}

				combinedBus.next(currentValues);
			});

			if (unsubscribe) {
				this.unsubscribes.push(unsubscribe);
			}
		});

		const subscription = combinedBus
			.pipe(debounceTime(STREAM_DEBOUNCE_MS))
			.subscribe({
				next: (args) => {
					if (this.stopped) return;
					this.lastInputs.set(conversion, args.slice());
					const result = this.invokeCallback(conversion, args, "stream");
					if (result === undefined) return;
					void this.processOutput(conversion, pluginOptions, result);
				},
				error: (err) => {
					this.app.error(
						`Stream error for ${this.moduleLabel(conversion)}: ${errMessage(err)}`,
					);
				},
			});

		this.unsubscribes.push(() => {
			subscription.unsubscribe();
			combinedBus.complete();
		});
	}

	private mapSubscription(
		conversion: ConversionModule,
		options: ConversionOptions,
	): void {
		const pluginOptions = options;
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
			(err: unknown) => this.app.error(errMessage(err)),
			(delta) => {
				if (this.stopped) return;
				const args: unknown[] = [delta];
				this.lastInputs.set(conversion, args);
				const result = this.invokeCallback(conversion, args, "subscription");
				if (result === undefined) return;
				void this.processOutput(conversion, pluginOptions, result);
			},
		);
	}

	private mapTimer(
		conversion: ConversionModule,
		options: ConversionOptions,
	): void {
		const processingOptions = options as ProcessingOptions;
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
			const result = this.invokeCallback(conversion, args, "timer");
			if (result === undefined) return;
			void this.processOutput(conversion, processingOptions, result);
		}, conversion.interval);

		this.timers.push(timer);
	}

	private sourceTypes: Record<
		NonNullable<ConversionModule["sourceType"]>,
		SourceTypeMapper
	> = {
		[SOURCE_TYPE.ON_DELTA]: (...args) => this.mapOnDelta(...args),
		[SOURCE_TYPE.ON_VALUE_CHANGE]: (...args) => this.mapRxJS(...args),
		[SOURCE_TYPE.SUBSCRIPTION]: (...args) => this.mapSubscription(...args),
		[SOURCE_TYPE.TIMER]: (...args) => this.mapTimer(...args),
	};

	private async processToN2K(values: N2KMessage[] | null): Promise<void> {
		if (!values) return;

		if (!this.nmea2000Ready) {
			this.app.debug("NMEA2000 output not yet available, dropping message");
			return;
		}

		try {
			const validPgns = values.filter(isDefined);
			const debugEnabled = isDebugEnabled(this.app);

			for (const pgn of validPgns) {
				try {
					const validatedPgn = validateN2KMessage(pgn);
					if (debugEnabled) {
						this.app.debug(
							`emit nmea2000JsonOut ${formatN2KMessage(validatedPgn)}`,
						);
					}
					this.app.emit("nmea2000JsonOut", validatedPgn);
				} catch (err) {
					this.app.error(
						`Error writing PGN ${JSON.stringify(pgn)}: ${errMessage(err)}`,
					);
				}
			}

			this.app.reportOutputMessages(validPgns.length);
		} catch (err) {
			this.app.error(`Error processing N2K values: ${errMessage(err)}`);
		}
	}

	private outputTypes: Record<string, OutputTypeProcessor> = {
		[OUTPUT_TYPE.TO_N2K]: (...args) => this.processToN2K(...args),
	};
}
