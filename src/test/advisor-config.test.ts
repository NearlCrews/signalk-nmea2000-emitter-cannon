import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { DEFAULT_ADVISOR_CONFIG } from "../config/enums.js";
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
		const schedule = advisor.schedule as Record<string, unknown>;
		expect(schedule.intervalDays).toBe(7);
	});

	it("accepts a fully specified advisor block", () => {
		const cfg = {
			conversions: {},
			advisor: {
				enabled: true,
				questdb: { enabled: true, url: "http://h:9000", lookbackDays: 30 },
				schedule: { periodic: true, intervalDays: 14 },
			},
		};
		expect(Value.Check(RootConfig, Value.Default(RootConfig, cfg))).toBe(true);
	});
});

describe("DEFAULT_ADVISOR_CONFIG", () => {
	it("matches the schema-materialized advisor defaults", () => {
		const filled = Value.Default(RootConfig, { conversions: {} }) as {
			advisor: unknown;
		};
		expect(DEFAULT_ADVISOR_CONFIG).toEqual(filled.advisor);
	});
});
