import { describe, expect, it } from "vitest";
import {
	clearAllSmoothers,
	ExponentialSmoother,
	getRegisteredSmootherCount,
} from "../utils/smoothing.js";

describe("ExponentialSmoother registry", () => {
	it("clearAllSmoothers empties the registry so instances can be GCed", () => {
		// Baseline — leftover instances from other tests are possible.
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
