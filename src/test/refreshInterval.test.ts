import { describe, expect, it } from "vitest";
import { SOURCE_TYPE, STREAM_DEBOUNCE_MS } from "../constants.js";
import { resolveRefreshInterval } from "../utils/refreshInterval.js";

describe("refresh interval validation", () => {
	it.each([
		["missing", undefined],
		["zero", 0],
		["negative", -1],
		["not finite", Number.NaN],
		["debounce boundary", STREAM_DEBOUNCE_MS],
	] as const)("rejects %s intervals", (_label, refreshInterval) => {
		const conversion = refreshInterval === undefined ? {} : { refreshInterval };
		expect(resolveRefreshInterval(conversion)).toBeUndefined();
	});

	it("accepts a finite value-change interval above the debounce window", () => {
		expect(resolveRefreshInterval({ refreshInterval: STREAM_DEBOUNCE_MS + 1 })).toBe(
			STREAM_DEBOUNCE_MS + 1,
		);
	});

	it("rejects refresh scheduling for non-stream source types", () => {
		expect(
			resolveRefreshInterval({
				refreshInterval: 1000,
				sourceType: SOURCE_TYPE.TIMER,
			}),
		).toBeUndefined();
	});
});
