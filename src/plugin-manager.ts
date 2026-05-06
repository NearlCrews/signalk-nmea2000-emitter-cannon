import type { Context, Path } from "@signalk/server-api";
import { debounceTime, Subject } from "rxjs";
import { createConversionModules } from "./conversions/index.js";
import type {
	ConversionModule,
	ConversionOptions,
	N2KMessage,
	OutputTypeProcessor,
	PluginOptions,
	ProcessingOptions,
	SignalKApp,
	SignalKPlugin,
	SourceTypeMapper,
} from "./types/index.js";
import { isConversionOptions } from "./types/index.js";
import { errMessage } from "./utils/errorUtils.js";
import { formatN2KMessage, validateN2KMessage } from "./utils/messageUtils.js";
import { isDefined, pathToPropName } from "./utils/pathUtils.js";
import { clearAllSmoothers } from "./utils/smoothing.js";

const VESSELS_SELF_CONTEXT = "vessels.self";

/**
 * Resolve a conversion's `keys` property which may be a static array or a
 * factory function of `(options) => string[]`.
 */
function resolveKeys(
	keys: string[] | ((options: unknown) => string[]) | undefined,
	options: unknown,
): string[] {
	if (keys === undefined) return [];
	if (typeof keys === "function") return keys(options);
	return keys;
}

export class PluginManager {
	private app: SignalKApp;
	private conversions: ConversionModule[] = [];
	private unsubscribes: Array<() => void> = [];
	private timers: NodeJS.Timeout[] = [];
	private nmea2000Ready = false;
	private globalResendInterval = 5;
	/**
	 * Stored so stop() can removeListener the exact same reference. Without
	 * this, every plugin restart leaks a listener (and the PluginManager it
	 * closes over), eventually tripping MaxListenersExceeded.
	 */
	private readonly onNmea2000Ready: (data: unknown) => void;
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

	start(options: PluginOptions): void {
		try {
			this.globalResendInterval = options.globalResendInterval || 5;

			this.app.setPluginStatus("Starting...");
			this.app.debug(`=== SIGNALK-NMEA2000-EMITTER-CANNON STARTING ===`);
			this.app.debug(
				`Plugin options received: ${JSON.stringify(Object.keys(options))}`,
			);
			this.app.debug(`Using ${this.conversions.length} conversion modules`);

			let enabledCount = 0;
			for (const conversion of this.conversions) {
				const conversionArray = Array.isArray(conversion)
					? conversion
					: [conversion];

				for (const conv of conversionArray) {
					const convOptions = options[conv.optionKey];
					const isEnabled =
						isConversionOptions(convOptions) && convOptions.enabled;
					this.app.debug(
						`Checking conversion ${conv.title} (${conv.optionKey}) - enabled: ${isEnabled}`,
					);

					if (!isConversionOptions(convOptions) || !convOptions.enabled) {
						continue;
					}
					enabledCount++;

					this.app.debug(
						`*** SETTING UP ENABLED CONVERSION: ${conv.title} ***`,
					);

					if (conv.onOptionsLoaded) {
						conv.onOptionsLoaded(convOptions as Record<string, unknown>);
					}

					let subConversions = conv.conversions;
					if (subConversions === undefined) {
						subConversions = [conv];
					} else if (typeof subConversions === "function") {
						subConversions = subConversions(convOptions);
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

						const sourceType: NonNullable<ConversionModule["sourceType"]> =
							subConversion.sourceType || "onValueChange";
						const mapper = this.sourceTypes[sourceType];

						this.app.debug(
							`Setting up subconversion with sourceType: ${sourceType}`,
						);

						if (!mapper) {
							this.app.error(`Unknown conversion type: ${sourceType}`);
							continue;
						}

						if (subConversion.outputType === undefined) {
							subConversion.outputType = "to-n2k";
						}

						this.app.debug(
							`Calling mapper for ${subConversion.title || "unnamed subconversion"}`,
						);
						mapper(subConversion, convOptions);
						this.app.debug(
							`Mapper completed for ${subConversion.title || "unnamed subconversion"}`,
						);
					}
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
		}
	}

	/**
	 * Each cleanup step is wrapped so one failure doesn't prevent the rest
	 * from running. Errors are collected and reported once. stop() must not
	 * throw — Signal K calls it on plugin disable/uninstall.
	 */
	stop(): void {
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

		// Resend timers are already tracked in `this.timers` — clearing the
		// list is sole authoritative teardown. The `conversion.resendTimer`
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
				const processor = this.outputTypes["to-n2k"];
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
		// schedule — arming a resend timer on top causes double emissions
		// every global-resend window.
		if (conversion.sourceType === "timer") {
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
					const lastInput = this.lastInputs.get(conversion);
					// No input ever observed → skip; do NOT emit stale defaults.
					if (lastInput === undefined) return;

					const raw = this.invokeCallback(conversion, lastInput, "resend");
					if (raw === undefined) return;

					const values = await Promise.resolve(raw);
					const processor = this.outputTypes["to-n2k"];
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

	private mapOnDelta(conversion: ConversionModule, options: unknown): void {
		const processingOptions = options as ProcessingOptions;
		if (!conversion.callback) {
			this.app.error(`Delta conversion ${conversion.title} missing callback`);
			return;
		}

		const handler = (delta: unknown) => {
			const args: unknown[] = [delta];
			this.lastInputs.set(conversion, args);
			const result = this.invokeCallback(conversion, args, "delta");
			if (result === undefined) return;
			void this.processOutput(conversion, processingOptions, result);
		};
		this.app.on("delta", handler);
		this.unsubscribes.push(() => this.app.removeListener("delta", handler));
	}

	private mapRxJS(conversion: ConversionModule, options: unknown): void {
		const pluginOptions = options as ConversionOptions;
		const keys = resolveKeys(conversion.keys, options);
		const timeouts = conversion.timeouts || [];

		this.app.debug(
			`Setting up conversion: ${conversion.title} with ${keys.length} keys`,
		);

		const lastValues: Record<string, { timestamp: number; value: unknown }> =
			{};

		keys.forEach((key) => {
			lastValues[key] = {
				timestamp: Date.now(),
				value: null,
			};
		});

		// Create a subject to combine all streams (like Bacon.Bus). Use plain
		// Subject (not BehaviorSubject) so the pipeline stays idle until an
		// actual value arrives — a BehaviorSubject([]) seed would fire through
		// debounceTime and trigger processOutput (including arming a resend
		// timer) before any real Signal K data had been observed.
		const combinedBus = new Subject<unknown[]>();

		keys.forEach((skKey) => {
			const sourceRef = pluginOptions[pathToPropName(skKey)] as
				| string
				| undefined;
			this.app.debug(`Setting up ${skKey} with sourceRef: ${sourceRef}`);

			let bus = this.app.streambundle.getSelfBus(skKey as Path);

			if (sourceRef) {
				// Signal K `$source` values are composites like `gps1.0` or
				// `canbus0.127`, not bare labels. Accept either an exact match
				// or a label prefix (`gps1` matches `gps1.0`, `gps1.1`, ...) so
				// the UI description "enter a source label (e.g. 'gps1')"
				// actually matches real stream values.
				const sourceRefWithDot = `${sourceRef}.`;
				bus = bus.filter((x: unknown) => {
					const src = (x as { $source?: string }).$source;
					if (!src) return false;
					return src === sourceRef || src.startsWith(sourceRefWithDot);
				});
			}

			const unsubscribe = bus.onValue((streamData: unknown) => {
				let value: unknown;
				if (
					streamData &&
					typeof streamData === "object" &&
					"value" in (streamData as object)
				) {
					value = (streamData as { value: unknown }).value;
				} else {
					value = streamData;
				}

				this.app.debug(`${skKey}: received value update`);

				const now = Date.now();
				const entry = lastValues[skKey];
				if (entry) {
					entry.timestamp = now;
					entry.value = value;
				}

				const currentValues = keys.map((key, i) => {
					const timeout = timeouts[i];
					return !isDefined(timeout) ||
						(lastValues[key]?.timestamp || 0) + (timeout || 0) > now
						? lastValues[key]?.value
						: null;
				});

				this.app.debug(`Pushing combined values for ${conversion.title}`);
				combinedBus.next(currentValues);
			});

			if (unsubscribe) {
				this.unsubscribes.push(unsubscribe);
			}
		});

		// Debounce and process like the original
		const subscription = combinedBus.pipe(debounceTime(10)).subscribe({
			next: (args) => {
				this.app.debug(`Callback triggered for ${conversion.title}`);
				this.lastInputs.set(conversion, args);
				const result = this.invokeCallback(conversion, args, "stream");
				if (result === undefined) return;
				this.app.debug(
					`Callback result for ${conversion.title}: ${Array.isArray(result) ? result.length : 0} messages`,
				);
				void this.processOutput(conversion, pluginOptions, result);
			},
			error: (err) => {
				this.app.error(
					`Stream error for ${this.moduleLabel(conversion)}: ${errMessage(err)}`,
				);
			},
		});

		this.unsubscribes.push(() => subscription.unsubscribe());
	}

	private mapSubscription(
		conversion: ConversionModule,
		options: unknown,
	): void {
		const pluginOptions = options as ConversionOptions;
		const keys = resolveKeys(conversion.keys, options);

		// Event-like sources (notifications, alarms) must subscribe with
		// policy:"instant" — otherwise Signal K's default "fixed" policy with
		// period 1000ms can drop rapid-fire alerts.
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
				const args: unknown[] = [delta];
				this.lastInputs.set(conversion, args);
				const result = this.invokeCallback(conversion, args, "subscription");
				if (result === undefined) return;
				void this.processOutput(conversion, pluginOptions, result);
			},
		);
	}

	private mapTimer(conversion: ConversionModule, options: unknown): void {
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
		onDelta: (...args) => this.mapOnDelta(...args),
		onValueChange: (...args) => this.mapRxJS(...args),
		subscription: (...args) => this.mapSubscription(...args),
		timer: (...args) => this.mapTimer(...args),
	};

	private async processToN2K(values: N2KMessage[] | null): Promise<void> {
		if (!values) return;

		if (!this.nmea2000Ready) {
			this.app.debug("NMEA2000 output not yet available, queuing message");
			return;
		}

		try {
			const validPgns = values.filter(isDefined);
			// `app.debug` is a debug-library instance that self-gates. Reading
			// `.enabled` once before the loop avoids running formatN2KMessage
			// (which allocates a string) when debug output is disabled for this
			// namespace.
			const appDebug = this.app.debug as unknown as { enabled?: boolean };
			const debugEnabled = appDebug?.enabled === true;

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

			if (this.app.reportOutputMessages) {
				this.app.reportOutputMessages(validPgns.length);
			}
		} catch (err) {
			this.app.error(`Error processing N2K values: ${errMessage(err)}`);
		}
	}

	private outputTypes: Record<string, OutputTypeProcessor> = {
		"to-n2k": (...args) => this.processToN2K(...args),
	};
}
