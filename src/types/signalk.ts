import type { Delta as OfficialDelta, ServerAPI } from "@signalk/server-api";

// Re-export official types
export type { OfficialDelta };

/**
 * Signal K server application interface
 * Extends the official ServerAPI with additional properties used by this plugin
 */
export interface SignalKApp extends ServerAPI {
  /** Emit an event to the Signal K server (for NMEA2000 output) */
  emit: (event: string, data: unknown) => void;
  /** Signal K event emitter for listening to server events */
  on: (event: string, callback: (data: unknown) => void) => void;
}

/**
 * Stream bus interface for individual data streams (BaconJS compatible)
 * This extends the official StreamBundle with the specific methods used by this plugin
 */
export interface StreamBus {
  map(selector: string | ((value: unknown) => unknown)): StreamBus;
  filter(predicate: (value: unknown) => boolean): StreamBus;
  onValue(callback: (value: unknown) => void): () => void;
}

/**
 * Signal K subscription configuration (plugin-specific format)
 */
export interface Subscription {
  /** Context for the subscription (e.g., 'vessels.self') */
  context: string;
  /** Array of paths to subscribe to */
  subscribe: Array<{ path: string }>;
}

/**
 * Signal K delta message structure (plugin-specific format)
 */
export interface Delta {
  context: string;
  updates: DeltaUpdate[];
}

/**
 * Signal K delta update structure
 */
export interface DeltaUpdate {
  source: {
    label: string;
    type?: string;
  };
  timestamp: string;
  values: DeltaValue[];
}

/**
 * Signal K delta value structure
 */
export interface DeltaValue {
  path: string;
  value: unknown;
}

/**
 * JSON Schema definition
 */
export interface JSONSchema {
  type: string;
  title?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  default?: unknown;
  enum?: unknown[];
}
