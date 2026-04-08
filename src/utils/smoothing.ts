/**
 * Smoothing utilities for sensor data
 */

/**
 * Exponential moving average smoother
 * Maintains state for multiple instances identified by key
 */
export class ExponentialSmoother {
  private values: Map<string, number> = new Map();
  private readonly alpha: number;

  /**
   * Create a new exponential smoother
   * @param alpha - Smoothing factor (0-1). Higher = more weight to new values
   */
  constructor(alpha: number = 0.3) {
    this.alpha = Math.max(0, Math.min(1, alpha));
  }

  /**
   * Apply exponential smoothing to a value
   * @param key - Instance identifier for maintaining separate smoothing states
   * @param newValue - New value to smooth
   * @returns Smoothed value
   */
  smooth(key: string, newValue: number): number {
    const existing = this.values.get(key);
    if (existing === undefined) {
      this.values.set(key, newValue);
      return newValue;
    }

    const smoothed = this.alpha * newValue + (1 - this.alpha) * existing;
    this.values.set(key, smoothed);
    return smoothed;
  }

  /**
   * Get the current smoothed value for a key
   * @param key - Instance identifier
   * @returns Current smoothed value or undefined if not set
   */
  get(key: string): number | undefined {
    return this.values.get(key);
  }

  /**
   * Clear all smoothing state
   */
  clear(): void {
    this.values.clear();
  }

  /**
   * Clear smoothing state for a specific key
   * @param key - Instance identifier to clear
   */
  clearKey(key: string): void {
    this.values.delete(key);
  }
}
