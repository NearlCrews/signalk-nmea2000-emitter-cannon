/**
 * Signal K server application interface
 * Defines the API that Signal K server provides to plugins
 */
export interface SignalKApp {
  /** Get a value from the vessel's own data */
  getSelfPath(path: string): unknown
  /** Get a value from any vessel's data */
  getPath(path: string): unknown
  /** Debug logging function */
  debug: (msg: string) => void
  /** Error logging function */
  error: (error: Error | string) => void
  /** Emit an event to the Signal K server */
  emit: (event: string, data: unknown) => void
  /** Stream bundle for reactive data access */
  streambundle: StreamBundle
  /** Subscription manager for data subscriptions */
  subscriptionmanager: {
    subscribe(
      subscription: Subscription,
      unsubscribes: Array<() => void>,
      errorCallback: (err: Error) => void,
      callback: (delta: Delta) => void
    ): void
  }
  /** Signal K event emitter */
  signalk: {
    on(event: string, callback: (data: unknown) => void): void
  }
  /** Optional function to report output message count */
  reportOutputMessages?: (count: number) => void
  /** Optional function to set provider error status */
  setProviderError?: (error: string) => void
  /** Handle incoming message/delta */
  handleMessage?: (pluginId: string, delta: Delta) => void
  /** Self vessel ID */
  selfId?: string
}

/**
 * Stream bundle interface for reactive data streams
 */
export interface StreamBundle {
  getSelfBus(path: string): StreamBus
}

/**
 * Stream bus interface for individual data streams
 */
export interface StreamBus {
  map(selector: string | ((value: unknown) => unknown)): StreamBus
  filter(predicate: (value: unknown) => boolean): StreamBus
  onValue(callback: (value: unknown) => void): () => void
}

/**
 * Signal K subscription configuration
 */
export interface Subscription {
  /** Context for the subscription (e.g., 'vessels.self') */
  context: string
  /** Array of paths to subscribe to */
  subscribe: Array<{ path: string }>
}

/**
 * Signal K delta message structure
 */
export interface Delta {
  context: string
  updates: DeltaUpdate[]
}

/**
 * Signal K delta update structure
 */
export interface DeltaUpdate {
  source: {
    label: string
    type?: string
  }
  timestamp: string
  values: DeltaValue[]
}

/**
 * Signal K delta value structure
 */
export interface DeltaValue {
  path: string
  value: unknown
}

/**
 * JSON Schema definition
 */
export interface JSONSchema {
  type: string
  title?: string
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  default?: unknown
  enum?: unknown[]
}
