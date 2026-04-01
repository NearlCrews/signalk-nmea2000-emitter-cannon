import type { Context, Path } from "@signalk/server-api";
import { isFunction, isUndefined } from "es-toolkit";
import { BehaviorSubject, debounceTime } from "rxjs";
import { createConversionModules } from "./conversions/index.js";
import type {
  ConversionModule,
  N2KMessage,
  OutputTypeProcessor,
  PluginOptions,
  ProcessingOptions,
  SignalKApp,
  SignalKPlugin,
  SourceTypeMapper,
} from "./types/index.js";
import { formatN2KMessage, validateN2KMessage } from "./utils/messageUtils.js";
import { isDefined, pathToPropName } from "./utils/pathUtils.js";

/**
 * PluginManager class - Manages the plugin lifecycle and conversions
 */
export class PluginManager {
  private app: SignalKApp;
  private conversions: ConversionModule[] = [];
  private unsubscribes: Array<() => void> = [];
  private timers: NodeJS.Timeout[] = [];
  private nmea2000Ready = false;

  constructor(app: SignalKApp, plugin: SignalKPlugin) {
    this.app = app;

    // Load conversions at initialization
    this.conversions = createConversionModules(app, plugin);
    this.app.debug(`Loaded ${this.conversions.length} conversion modules`);

    // Wait for NMEA2000 output to be available before emitting
    this.app.on("nmea2000OutAvailable", () => {
      this.nmea2000Ready = true;
      this.app.debug("NMEA2000 output is now available");
    });
  }

  /**
   * Start the plugin with given options
   */
  start(options: PluginOptions): void {
    try {
      this.app.setPluginStatus("Starting...");
      this.app.debug(`=== SIGNALK-NMEA2000-EMITTER-CANNON STARTING ===`);
      this.app.debug(`Plugin options received: ${JSON.stringify(Object.keys(options))}`);
      this.app.debug(`Using ${this.conversions.length} conversion modules`);

      // Count enabled conversions
      let enabledCount = 0;
      for (const key of Object.keys(options)) {
        if (options[key]?.enabled) {
          enabledCount++;
          this.app.debug(`${key} is ENABLED in options`);
        }
      }
      this.app.debug(`Total enabled conversions in options: ${enabledCount}`);

      // Start enabled conversions
      for (const conversion of this.conversions) {
        const conversionArray = Array.isArray(conversion) ? conversion : [conversion];

        for (const conv of conversionArray) {
          const convOptions = options[conv.optionKey];
          this.app.debug(
            `Checking conversion ${conv.title} (${conv.optionKey}) - enabled: ${convOptions?.enabled}`
          );

          if (!convOptions?.enabled) {
            continue;
          }

          this.app.debug(`*** SETTING UP ENABLED CONVERSION: ${conv.title} ***`);

          let subConversions = conv.conversions;
          if (isUndefined(subConversions)) {
            subConversions = [conv];
          } else if (isFunction(subConversions)) {
            subConversions = subConversions(convOptions);
          }

          if (!subConversions) {
            this.app.debug(`No subconversions for ${conv.title}`);
            continue;
          }

          this.app.debug(`Setting up ${subConversions.length} subconversions for ${conv.title}`);

          for (const subConversion of subConversions) {
            if (isUndefined(subConversion)) continue;

            const sourceType = subConversion.sourceType || "onValueChange";
            const mapper = this.sourceTypes[sourceType];

            this.app.debug(`Setting up subconversion with sourceType: ${sourceType}`);

            if (!mapper) {
              this.app.error(`Unknown conversion type: ${sourceType}`);
              continue;
            }

            // Set default output type
            if (isUndefined(subConversion.outputType)) {
              subConversion.outputType = "to-n2k";
            }

            this.app.debug(`Calling mapper for ${subConversion.title || "unnamed subconversion"}`);
            mapper.call(this, subConversion, convOptions);
            this.app.debug(
              `Mapper completed for ${subConversion.title || "unnamed subconversion"}`
            );
          }
        }
      }

      this.app.debug(`=== SIGNALK-NMEA2000-EMITTER-CANNON STARTUP COMPLETE ===`);
      this.app.setPluginStatus(`Running with ${enabledCount} conversions enabled`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.app.error(`Failed to start plugin: ${errorMsg}`);
      this.app.setPluginError(`Startup failed: ${errorMsg}`);
    }
  }

  /**
   * Stop the plugin and cleanup resources
   */
  stop(): void {
    // Clear all subscriptions
    for (const unsubscribe of this.unsubscribes) {
      try {
        unsubscribe();
      } catch (err) {
        this.app.error(`Error during unsubscribe: ${err}`);
      }
    }
    this.unsubscribes = [];

    // Clear all timers
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];

    // Clear conversion resend timers
    for (const conversion of this.conversions) {
      if (conversion.resendTimer) {
        clearInterval(conversion.resendTimer);
        delete conversion.resendTimer;
      }
    }
  }

  /**
   * Process output messages and handle resending
   */
  private async processOutput(
    conversion: ConversionModule,
    options: ProcessingOptions | null,
    output: N2KMessage[] | Promise<N2KMessage[]>
  ): Promise<void> {
    // Handle resend functionality
    if (options?.resend && options.resend > 0) {
      if (conversion.resendTimer) {
        this.clearResendInterval(conversion.resendTimer);
      }

      const startedAt = Date.now();
      conversion.resendTimer = setInterval(async () => {
        try {
          const values = await Promise.resolve(output);
          const processor = this.outputTypes["to-n2k"];
          if (processor) {
            await processor.call(this, values);
          }
        } catch (err) {
          this.app.error(`Error in resend timer: ${err}`);
        }

        if (Date.now() - startedAt > (options.resendTime || 30) * 1000) {
          if (conversion.resendTimer) {
            this.clearResendInterval(conversion.resendTimer);
          }
        }
      }, options.resend * 1000);

      this.timers.push(conversion.resendTimer);
    }

    // Process the output immediately
    try {
      const values = await Promise.resolve(output);
      const processor = this.outputTypes["to-n2k"];
      if (processor) {
        await processor.call(this, values);
      }
    } catch (err) {
      this.app.error(`Error processing output: ${err}`);
    }
  }

  /**
   * Clear a resend timer interval
   */
  private clearResendInterval(timer: NodeJS.Timeout): void {
    const idx = this.timers.indexOf(timer);
    if (idx !== -1) {
      this.timers.splice(idx, 1);
    }
    clearInterval(timer);
  }

  /**
   * Map delta-based conversions
   */
  private mapOnDelta(conversion: ConversionModule, options: unknown): void {
    const processingOptions = options as ProcessingOptions;
    if (!conversion.callback) {
      this.app.error(`Delta conversion ${conversion.title} missing callback`);
      return;
    }

    this.app.on("delta", (delta) => {
      try {
        if (conversion.callback) {
          const result = conversion.callback(delta);
          this.processOutput(conversion, processingOptions, result);
        }
      } catch (err) {
        this.app.error(`Error in delta handler: ${err}`);
      }
    });
  }

  /**
   * Map Signal K stream-based value change conversions using RxJS pattern
   */
  private mapRxJS(conversion: ConversionModule, options: unknown): void {
    const pluginOptions = options as PluginOptions[string];
    const keys = conversion.keys || [];
    const timeouts = conversion.timeouts || [];

    this.app.debug(`Setting up conversion: ${conversion.title} with keys: ${JSON.stringify(keys)}`);
    this.app.debug(`Timeouts: ${JSON.stringify(timeouts)}`);

    // Replicate the original BaconJS timeoutingArrayStream pattern
    const lastValues: Record<string, { timestamp: number; value: unknown }> = {};

    // Initialize lastValues for all keys
    keys.forEach((key) => {
      lastValues[key] = {
        timestamp: Date.now(),
        value: null,
      };
    });

    // Create a subject to combine all streams (like Bacon.Bus)
    const combinedBus = new BehaviorSubject<unknown[]>([]);

    // Set up individual stream subscriptions
    keys.forEach((skKey) => {
      const sourceRef = pluginOptions[pathToPropName(skKey)] as string | undefined;
      this.app.debug(`Setting up ${skKey} with sourceRef: ${sourceRef}`);

      let bus = this.app.streambundle.getSelfBus(skKey as Path);

      if (sourceRef) {
        bus = bus.filter((x: unknown) => {
          const obj = x as { $source?: string };
          return obj.$source === sourceRef;
        });
      }

      // This is the critical fix - use the exact same pattern as original
      const unsubscribe = bus.onValue((streamData: unknown) => {
        // Extract value exactly like the original: bus.map(".value")
        let value: unknown;
        if (streamData && typeof streamData === "object" && "value" in (streamData as object)) {
          value = (streamData as { value: unknown }).value;
        } else {
          value = streamData;
        }

        this.app.debug(`${skKey}: received value ${JSON.stringify(value)}`);

        // Update the last value for this key
        lastValues[skKey] = {
          timestamp: Date.now(),
          value,
        };

        // Push current values array (like original Bacon.Bus.push)
        const now = Date.now();
        const currentValues = keys.map((key, i) => {
          const timeout = timeouts[i];
          return !isDefined(timeout) || (lastValues[key]?.timestamp || 0) + (timeout || 0) > now
            ? lastValues[key]?.value
            : null;
        });

        this.app.debug(`Pushing combined values: ${JSON.stringify(currentValues)}`);
        combinedBus.next(currentValues);
      });

      if (unsubscribe) {
        this.unsubscribes.push(unsubscribe);
      }
    });

    // Debounce and process like the original
    const subscription = combinedBus.pipe(debounceTime(10)).subscribe({
      next: (values) => {
        try {
          this.app.debug(
            `*** CALLBACK TRIGGERED for ${conversion.title} with values: ${JSON.stringify(values)}`
          );
          if (conversion.callback) {
            const result = conversion.callback(...values);
            this.app.debug(
              `*** CALLBACK RESULT for ${conversion.title}: ${JSON.stringify(result)}`
            );
            this.processOutput(conversion, pluginOptions, result);
          }
        } catch (err) {
          this.app.error(
            `Error in callback for ${conversion.title}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      },
      error: (err) => {
        this.app.error(
          `Stream error for ${conversion.title}: ${err instanceof Error ? err.message : String(err)}`
        );
      },
    });

    this.unsubscribes.push(() => subscription.unsubscribe());
  }

  /**
   * Map subscription-based conversions
   */
  private mapSubscription(conversion: ConversionModule, options: unknown): void {
    const pluginOptions = options as PluginOptions[string];
    const keys = isFunction(conversion.keys)
      ? (conversion.keys as (options: unknown) => string[])(options)
      : conversion.keys || [];

    const subscription = {
      context: (conversion.context || "vessels.self") as Context,
      subscribe: keys.map((key) => ({ path: key as Path })),
    };

    this.app.debug(`subscription: ${JSON.stringify(subscription)}`);

    this.app.subscriptionmanager.subscribe(
      subscription,
      this.unsubscribes,
      (err: unknown) => this.app.error(err instanceof Error ? err.message : String(err)),
      (delta) => {
        try {
          if (conversion.callback) {
            const result = conversion.callback(delta);
            this.processOutput(conversion, pluginOptions, result);
          }
        } catch (err) {
          this.app.error(err instanceof Error ? err.message : String(err));
        }
      }
    );
  }

  /**
   * Map timer-based conversions
   */
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
      try {
        if (conversion.callback) {
          const result = conversion.callback(this.app);
          this.processOutput(conversion, processingOptions, result);
        }
      } catch (err) {
        this.app.error(err instanceof Error ? err.message : String(err));
      }
    }, conversion.interval);

    this.timers.push(timer);
  }

  /**
   * Source type mappers
   */
  private sourceTypes: Record<string, SourceTypeMapper> = {
    onDelta: this.mapOnDelta,
    onValueChange: this.mapRxJS,
    subscription: this.mapSubscription,
    timer: this.mapTimer,
  };

  /**
   * Process NMEA 2000 output
   */
  private async processToN2K(values: N2KMessage[] | null): Promise<void> {
    if (!values) return;

    // Check if NMEA2000 output is available
    if (!this.nmea2000Ready) {
      this.app.debug("NMEA2000 output not yet available, queuing message");
      return;
    }

    try {
      const pgns = await Promise.all(values);
      const validPgns = pgns.filter(isDefined);

      for (const pgn of validPgns) {
        try {
          // Validate message format
          const validatedPgn = validateN2KMessage(pgn);
          this.app.debug(`emit nmea2000JsonOut ${formatN2KMessage(validatedPgn)}`);
          this.app.emit("nmea2000JsonOut", validatedPgn);
        } catch (err) {
          this.app.error(`Error writing PGN ${JSON.stringify(pgn)}: ${err}`);
        }
      }

      if (this.app.reportOutputMessages) {
        this.app.reportOutputMessages(validPgns.length);
      }
    } catch (err) {
      this.app.error(`Error processing N2K values: ${err}`);
    }
  }

  /**
   * Output type processors
   */
  private outputTypes: Record<string, OutputTypeProcessor> = {
    "to-n2k": this.processToN2K,
  };
}
