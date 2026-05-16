import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { RootConfig } from "../config/schema.js";

describe("advisor config block", () => {
	it("a config with no advisor block loads with defaults", () => {
		const filled = Value.Default(RootConfig, {
			conversions: {},
		}) as Record<string, unknown>;
		const advisor = filled.advisor as Record<string, unknown>;
		expect(advisor).toBeDefined();
		expect(advisor.enabled).toBe(false);
		const questdb = advisor.questdb as Record<string, unknown>;
		expect(questdb.lookbackDays).toBe(7);
		const openRouter = advisor.openRouter as Record<string, unknown>;
		expect(openRouter.maxCallsPerDay).toBe(25);
		const schedule = advisor.schedule as Record<string, unknown>;
		expect(schedule.intervalDays).toBe(7);
	});

	it("accepts a fully specified advisor block", () => {
		const cfg = {
			conversions: {},
			advisor: {
				enabled: true,
				openRouter: {
					enabled: true,
					apiKey: "k",
					model: "m",
					maxCallsPerDay: 5,
				},
				questdb: { enabled: true, url: "http://h:9000", lookbackDays: 30 },
				schedule: { periodic: true, intervalDays: 14 },
			},
		};
		expect(Value.Check(RootConfig, Value.Default(RootConfig, cfg))).toBe(true);
	});
});
