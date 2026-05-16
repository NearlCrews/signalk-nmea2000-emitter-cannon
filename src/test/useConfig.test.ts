import { describe, expect, it } from "vitest";
import { DEFAULT_ADVISOR_CONFIG } from "../config/enums.js";
import { __advisorReducerForTest } from "../panel/hooks/useConfig.js";

describe("setAdvisor reducer action", () => {
	it("replaces the advisor block", () => {
		const start = { globalResendInterval: 0, conversions: {} };
		const next = __advisorReducerForTest(start, {
			...DEFAULT_ADVISOR_CONFIG,
			enabled: true,
		});
		expect(next.advisor?.enabled).toBe(true);
		expect(next.conversions).toBe(start.conversions);
	});
});
