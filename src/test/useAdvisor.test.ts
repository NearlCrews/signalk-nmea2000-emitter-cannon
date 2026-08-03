import { describe, expect, it } from "vitest";
import {
	ADVISOR_APPLY_NO_CHANGE,
	finishAdvisorApply,
	finishAdvisorPendingLoad,
} from "../panel/hooks/useAdvisor.js";
import type { ApplyDecision, Recommendation, ReviewResult } from "../recommendation/types.js";

function recommendation(optionKey: string): Recommendation {
	return {
		optionKey,
		action: "enable",
		currentlyEnabled: false,
		matchedPaths: ["navigation.position"],
		confidence: "high",
		origin: "live",
		reason: "test recommendation",
	};
}

function result(...optionKeys: string[]): ReviewResult {
	return {
		ranAt: "2026-07-31T12:00:00.000Z",
		autoApplied: [],
		pending: optionKeys.map(recommendation),
		notes: [],
	};
}

function enable(optionKey: string, approved = true): ApplyDecision {
	return { optionKey, approved, action: "enable" };
}

describe("Advisor apply panel state", () => {
	it("does not restore a stale pending snapshot after review and apply complete", () => {
		const completed = { result: null, operation: "idle" as const, error: null };
		const stalePending = {
			ranAt: "2026-07-31T12:00:00.000Z",
			autoApplied: [],
			pending: [recommendation("DEPTH")],
			notes: [],
		};

		const next = finishAdvisorPendingLoad(completed, stalePending, 0, 2);

		expect(next).toBe(completed);
		expect(next.result).toBeNull();
	});

	it("retains pending rows and explains a zero-change response", () => {
		const original = result("WIND_WEATHER_APPARENT");
		const next = finishAdvisorApply(
			{ result: original, operation: "applying", error: null },
			[enable("WIND_WEATHER_APPARENT")],
			{ applied: 0 },
		);

		expect(next.result).toBe(original);
		expect(next.result?.pending).toHaveLength(1);
		expect(next.operation).toBe("idle");
		expect(next.error).toBe(ADVISOR_APPLY_NO_CHANGE);
		expect(next.error).toContain("competing wind producer");
	});

	it("dismisses approved rows after every requested change applies", () => {
		const next = finishAdvisorApply(
			{ result: result("WIND", "DEPTH"), operation: "applying", error: "old" },
			[enable("WIND")],
			{ applied: 1 },
		);

		expect(next.result?.pending.map((item) => item.optionKey)).toEqual(["DEPTH"]);
		expect(next.operation).toBe("idle");
		expect(next.error).toBeNull();
	});

	it("retains all rows when a batch only partially applies", () => {
		const original = result("WIND", "WIND_WEATHER_APPARENT");
		const next = finishAdvisorApply(
			{ result: original, operation: "applying", error: null },
			[enable("WIND"), enable("WIND_WEATHER_APPARENT")],
			{ applied: 1 },
		);

		expect(next.result).toBe(original);
		expect(next.error).toContain("applied 1 of 2");
	});

	it("does not report an error when no decisions were approved", () => {
		const original = result("DEPTH");
		const next = finishAdvisorApply(
			{ result: original, operation: "applying", error: "old" },
			[enable("DEPTH", false)],
			{ applied: 0 },
		);

		expect(next.result).toBe(original);
		expect(next.operation).toBe("idle");
		expect(next.error).toBeNull();
	});
});
