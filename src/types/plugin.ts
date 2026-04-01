import type { Plugin } from "@signalk/server-api";
import type { N2KMessage } from "./nmea2000.js";
import type { JSONSchema, SignalKApp } from "./signalk.js";

/**
 * Generic callback for NMEA 2000 conversions.
 * @template T - An array of types for the callback arguments.
 */
export type ConversionCallback<T extends unknown[] = unknown[]> = (
  ...values: T
) => N2KMessage[] | Promise<N2KMessage[]>;

/**
 * Signal K plugin interface
 * Extends the official Plugin interface with additional properties
 */
export interface SignalKPlugin extends Plugin {
  /** Plugin description */
  description: string;
}

/**
 * Configuration options for a single conversion.
 */
export interface ConversionOptions {
  enabled: boolean;
  resend?: number;
  resendTime?: number;
  [optionKey: string]: unknown;
}

/**
 * Plugin configuration options, mapping conversion keys to their settings.
 */
export interface PluginOptions {
  [key: string]: ConversionOptions;
}

/**
 * Sub-conversion module (used within conversions array)
 */
export interface SubConversionModule<T extends unknown[] = unknown[]> {
  /** Signal K paths that this conversion listens to */
  keys?: string[];
  /** Source type for data input */
  sourceType?: "onDelta" | "onValueChange" | "subscription" | "timer";
  /** Output type for data output */
  outputType?: "to-n2k";
  /** Timeout values for data freshness (ms) */
  timeouts?: number[];
  /** Timer interval for timer-based conversions (ms) */
  interval?: number;
  /** Function that converts Signal K data to N2K messages */
  callback?: ConversionCallback<T>;
  /** Test cases for this conversion */
  tests?: ConversionTest[];
}

/**
 * Conversion module configuration
 */
export interface ConversionModule<T extends unknown[] = unknown[]> {
  /** Human-readable title for this conversion */
  title: string;
  /** Option key used in plugin configuration */
  optionKey: string;
  /** Signal K paths that this conversion listens to */
  keys?: string[];
  /** Context for subscriptions (e.g., 'vessels.self') */
  context?: string;
  /** Source type for data input */
  sourceType?: "onDelta" | "onValueChange" | "subscription" | "timer";
  /** Output type for data output */
  outputType?: "to-n2k";
  /** Timeout values for data freshness (ms) */
  timeouts?: number[];
  /** Timer interval for timer-based conversions (ms) */
  interval?: number;
  /** Function that converts Signal K data to N2K messages */
  callback?: ConversionCallback<T>;
  /** Sub-conversions for complex conversion modules */
  conversions?: SubConversionModule<T>[] | ((options: unknown) => SubConversionModule<T>[] | null);
  /** Additional configuration properties for this conversion */
  properties?: JSONSchema["properties"] | (() => JSONSchema["properties"]);
  /** Test cases for this conversion */
  tests?: ConversionTest[];
  /** Test options for validating this conversion */
  testOptions?: unknown;
  /** Timer reference for cleanup */
  resendTimer?: NodeJS.Timeout;
}

/**
 * Test expectation that allows preprocessing of test results
 */
export type TestExpectedMessage = N2KMessage & {
  /** Optional preprocessing function to modify test results for validation */
  __preprocess__?: (testResult: N2KMessage) => void;
};

/**
 * Test case for a conversion module
 */
export interface ConversionTest {
  /** Input values for the conversion function */
  input: unknown[];
  /** Expected N2K messages output */
  expected:
    | TestExpectedMessage[]
    | ((testOptions: Record<string, unknown>) => TestExpectedMessage)[];
  /** Signal K data context for the test (app.getPath) */
  skData?: Record<string, unknown>;
  /** Signal K self vessel data context for the test (app.getSelfPath) */
  skSelfData?: Record<string, unknown>;
  /** Test options passed to expected function generators */
  testOptions?: Record<string, unknown>;
}

/**
 * Source type mapping functions
 */
export type SourceTypeMapper = (conversion: ConversionModule, options: unknown) => void;

/**
 * Output type processing functions
 */
export type OutputTypeProcessor = (values: N2KMessage[] | null) => Promise<void>;

/**
 * Plugin factory function type
 */
export type PluginFactory = (app: unknown) => SignalKPlugin;

/**
 * Conversion module factory function type
 */
export type ConversionModuleFactory = (
  app: SignalKApp,
  plugin: SignalKPlugin
) => ConversionModule<any> | ConversionModule<any>[];

/**
 * Options for message processing
 */
export interface ProcessingOptions {
  /** Whether to resend messages periodically */
  resend?: number;
  /** How long to continue resending (seconds) */
  resendTime?: number;
}

/**
 * Error types for plugin operations
 */
export class PluginError extends Error {
  constructor(
    message: string,
    public readonly pluginId: string,
    public readonly operation?: string
  ) {
    super(message);
    this.name = "PluginError";
  }
}

export class ConversionError extends Error {
  constructor(
    message: string,
    public readonly conversionTitle: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = "ConversionError";
  }
}
