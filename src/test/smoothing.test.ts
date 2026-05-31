import { describe, expect, it } from "vitest";
import {
	clearAllSmoothers,
	ExponentialSmoother,
	getRegisteredSmootherCount,
} from "../utils/smoothing.js";

describe("ExponentialSmoother registry", () => {
	it("clearAllSmoothers empties the registry so instances can be GCed", () => {
		// Baseline: leftover instances from other tests are possible.
		clearAllSmoothers();
		expect(getRegisteredSmootherCount()).toBe(0);

		const s1 = new ExponentialSmoother();
		const s2 = new ExponentialSmoother();
		s1.smooth("k", 1);
		s2.smooth("k", 2);

		expect(getRegisteredSmootherCount()).toBe(2);

		clearAllSmoothers();

		// Instance state cleared AND registry released (otherwise the plugin
		// leaks one entry per restart).
		expect(s1.get("k")).toBeUndefined();
		expect(s2.get("k")).toBeUndefined();
		expect(getRegisteredSmootherCount()).toBe(0);
	});
});

describe("ExponentialSmoother math", () => {
	it("returns and stores the first value unchanged, then blends by alpha", () => {
		const s = new ExponentialSmoother(0.5);
		expect(s.smooth("k", 10)).toBe(10);
		// 0.5 * 20 + 0.5 * 10
		expect(s.smooth("k", 20)).toBe(15);
		expect(s.get("k")).toBe(15);
	});

	it("clamps alpha into [0, 1]", () => {
		// alpha > 1 clamps to 1: the latest value wins, no smoothing.
		const fast = new ExponentialSmoother(2);
		fast.smooth("k", 10);
		expect(fast.smooth("k", 20)).toBe(20);

		// alpha < 0 clamps to 0: the first value is held, later inputs ignored.
		const frozen = new ExponentialSmoother(-1);
		frozen.smooth("k", 10);
		expect(frozen.smooth("k", 20)).toBe(10);
	});

	it("drops non-finite inputs without poisoning the stored value", () => {
		const s = new ExponentialSmoother(0.5);
		s.smooth("k", 10);
		// NaN with a prior value returns the prior value and leaves it stored.
		expect(s.smooth("k", Number.NaN)).toBe(10);
		expect(s.smooth("k", Number.POSITIVE_INFINITY)).toBe(10);
		expect(s.get("k")).toBe(10);

		// NaN with no prior value is returned as-is so callers can detect a
		// failed upstream sensor.
		expect(Number.isNaN(s.smooth("fresh", Number.NaN))).toBe(true);
	});
});
