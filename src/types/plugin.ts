import type { JSONSchema } from './signalk.js'
import type { N2KMessage } from './nmea2000.js'

/**
 * Signal K plugin interface
 * Main structure that every Signal K plugin must implement
 */
export interface SignalKPlugin {
  /** Unique plugin identifier */
  id: string
  /** Human-readable plugin name */
  name: string
  /** Plugin description */
  description: string
  /** Function that returns the plugin's configuration schema */
  schema: () => JSONSchema
  /** Function called when the plugin starts */
  start: (options: PluginOptions) => void
  /** Function called when the plugin stops */
  stop: () => void
}

/**
 * Plugin configuration options
 */
export interface PluginOptions {
  [key: string]: {
    enabled: boolean
    resend?: number
    resendTime?: number
    [optionKey: string]: unknown
  }
}

/**
 * Sub-conversion module (used within conversions array)
 */
export interface SubConversionModule {
  /** Signal K paths that this conversion listens to */
  keys?: string[]
  /** Source type for data input */
  sourceType?: 'onDelta' | 'onValueChange' | 'subscription' | 'timer'
  /** Output type for data output */
  outputType?: 'to-n2k'
  /** Timeout values for data freshness (ms) */
  timeouts?: number[]
  /** Timer interval for timer-based conversions (ms) */
  interval?: number
  /** Function that converts Signal K data to N2K messages */
  callback?: (...values: unknown[]) => N2KMessage[] | Promise<N2KMessage[]>
  /** Test cases for this conversion */
  tests?: ConversionTest[]
}

/**
 * Conversion module configuration
 */
export interface ConversionModule {
  /** Human-readable title for this conversion */
  title: string
  /** Option key used in plugin configuration */
  optionKey: string
  /** Signal K paths that this conversion listens to */
  keys?: string[]
  /** Context for subscriptions (e.g., 'vessels.self') */
  context?: string
  /** Source type for data input */
  sourceType?: 'onDelta' | 'onValueChange' | 'subscription' | 'timer'
  /** Output type for data output */
  outputType?: 'to-n2k'
  /** Timeout values for data freshness (ms) */
  timeouts?: number[]
  /** Timer interval for timer-based conversions (ms) */
  interval?: number
  /** Function that converts Signal K data to N2K messages */
  callback?: (...values: unknown[]) => N2KMessage[] | Promise<N2KMessage[]>
  /** Sub-conversions for complex conversion modules */
  conversions?: SubConversionModule[] | ((options: unknown) => SubConversionModule[] | null)
  /** Additional configuration properties for this conversion */
  properties?: JSONSchema['properties'] | (() => JSONSchema['properties'])
  /** Test cases for this conversion */
  tests?: ConversionTest[]
  /** Test options for validating this conversion */
  testOptions?: unknown
  /** Timer reference for cleanup */
  resendTimer?: NodeJS.Timeout
}

/**
 * Test expectation that allows preprocessing of test results
 */
export type TestExpectedMessage = N2KMessage & {
  /** Optional preprocessing function to modify test results for validation */
  __preprocess__?: (testResult: N2KMessage) => void
}

/**
 * Test case for a conversion module
 */
export interface ConversionTest {
  /** Input values for the conversion function */
  input: unknown[]
  /** Expected N2K messages output */
  expected: TestExpectedMessage[] | ((testOptions: Record<string, unknown>) => TestExpectedMessage)[]
  /** Signal K data context for the test (app.getPath) */
  skData?: Record<string, unknown>
  /** Signal K self vessel data context for the test (app.getSelfPath) */
  skSelfData?: Record<string, unknown>
  /** Test options passed to expected function generators */
  testOptions?: Record<string, unknown>
}

/**
 * Source type mapping functions
 */
export type SourceTypeMapper = (
  conversion: ConversionModule,
  options: unknown
) => void

/**
 * Output type processing functions
 */
export type OutputTypeProcessor = (values: N2KMessage[] | null) => Promise<void>

/**
 * Plugin factory function type
 */
export type PluginFactory = (app: unknown) => SignalKPlugin

/**
 * Conversion module factory function type
 */
export type ConversionModuleFactory = (
  app: unknown,
  plugin: unknown
) => ConversionModule | ConversionModule[]

/**
 * Options for message processing
 */
export interface ProcessingOptions {
  /** Whether to resend messages periodically */
  resend?: number
  /** How long to continue resending (seconds) */
  resendTime?: number
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
    super(message)
    this.name = 'PluginError'
  }
}

export class ConversionError extends Error {
  constructor(
    message: string,
    public readonly conversionTitle: string,
    public readonly originalError?: Error
  ) {
    super(message)
    this.name = 'ConversionError'
  }
}
