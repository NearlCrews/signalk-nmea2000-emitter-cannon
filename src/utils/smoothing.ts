import { clamp, isValidNumber } from "./validation.js";

// Module-level registry so PluginManager.stop() can wipe smoothed state on
// every instance without each conversion having to track its own smoothers.
const registeredSmoothers: Set<ExponentialSmoother> = new Set();

export class ExponentialSmoother {
	private values: Map<string, number> = new Map();
	private readonly alpha: number;

	constructor(alpha: number = 0.3) {
		this.alpha = clamp(alpha, 0, 1);
		registeredSmoothers.add(this);
	}

	// Non-finite inputs (NaN, +/-Infinity) are dropped: blending them in would
	// poison the stored value for every subsequent call against the same key.
	// If no prior value exists either, the bad input is returned as-is so
	// callers can detect upstream sensor failure.
	smooth(key: string, newValue: number): number {
		const existing = this.values.get(key);
		if (!isValidNumber(newValue)) {
			return existing ?? newValue;
		}
		if (existing === undefined) {
			this.values.set(key, newValue);
			return newValue;
		}

		const smoothed = this.alpha * newValue + (1 - this.alpha) * existing;
		this.values.set(key, smoothed);
		return smoothed;
	}

	get(key: string): number | undefined {
		return this.values.get(key);
	}

	clear(): void {
		this.values.clear();
	}

	clearKey(key: string): void {
		this.values.delete(key);
	}
}

// Releases registry references so old instances can be garbage-collected
// across plugin restarts; the registry would otherwise grow one zombie
// entry per restart.
export function clearAllSmoothers(): void {
	for (const smoother of registeredSmoothers) {
		smoother.clear();
	}
	registeredSmoothers.clear();
}

// Test-only seam: lets smoothing.test.ts assert clearAllSmoothers() emptied
// the registry. Not used by plugin runtime code.
export function getRegisteredSmootherCount(): number {
	return registeredSmoothers.size;
}
