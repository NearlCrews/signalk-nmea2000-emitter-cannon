import { describe, expect, it } from "vitest";
import { DEFAULT_ADVISOR_CONFIG } from "../config/enums.js";
import type { Config, ConversionConfig } from "../config/schema.js";
import {
	__advisorReducerForTest,
	mergeExternalConfig,
} from "../panel/hooks/useConfig.js";

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

// Fresh conversion entry. Each call is a distinct object, so identity equality
// distinguishes a touched entry from an untouched one in the merge tests, just
// as it does for real reducer output.
function entry(over: Partial<ConversionConfig> = {}): ConversionConfig {
	return { enabled: false, resend: 0, sources: {}, extras: {}, ...over };
}

describe("mergeExternalConfig three-way merge", () => {
	it("keeps the user's edit for a touched key and adopts external for an untouched key", () => {
		const base: Config = {
			globalResendInterval: 0,
			conversions: { A: entry(), B: entry() },
		};
		// User toggled A on; B is left as-is, so it shares base's reference.
		const ours: Config = {
			...base,
			conversions: {
				...base.conversions,
				A: { ...base.conversions.A, enabled: true },
			},
		};
		// External enabled B and also changed A.
		const theirs: Config = {
			globalResendInterval: 0,
			conversions: { A: entry({ resend: 99 }), B: entry({ enabled: true }) },
		};
		const merged = mergeExternalConfig(base, ours, theirs);
		// A was touched by the user: keep the user edit, the external change loses.
		expect(merged.conversions.A).toBe(ours.conversions.A);
		expect(merged.conversions.A?.enabled).toBe(true);
		expect(merged.conversions.A?.resend).toBe(0);
		// B was untouched: adopt the external value.
		expect(merged.conversions.B).toBe(theirs.conversions.B);
		expect(merged.conversions.B?.enabled).toBe(true);
	});

	it("adopts a brand-new external key the user never touched", () => {
		const base: Config = {
			globalResendInterval: 0,
			conversions: { A: entry() },
		};
		const theirs: Config = {
			globalResendInterval: 0,
			conversions: { A: entry(), C: entry({ enabled: true }) },
		};
		const merged = mergeExternalConfig(base, base, theirs);
		expect(merged.conversions.C).toBe(theirs.conversions.C);
	});

	it("keeps a user-added key that the external config does not have", () => {
		const base: Config = { globalResendInterval: 0, conversions: {} };
		const ours: Config = {
			...base,
			conversions: { ...base.conversions, NEW: entry({ enabled: true }) },
		};
		const theirs: Config = { globalResendInterval: 0, conversions: {} };
		const merged = mergeExternalConfig(base, ours, theirs);
		expect(merged.conversions.NEW).toBe(ours.conversions.NEW);
	});

	it("drops an untouched key that the external config removed", () => {
		const base: Config = {
			globalResendInterval: 0,
			conversions: { A: entry(), B: entry() },
		};
		const ours: Config = {
			...base,
			conversions: {
				...base.conversions,
				A: { ...base.conversions.A, enabled: true },
			},
		};
		const theirs: Config = {
			globalResendInterval: 0,
			conversions: { A: entry() },
		};
		const merged = mergeExternalConfig(base, ours, theirs);
		expect("B" in merged.conversions).toBe(false);
		expect(merged.conversions.A).toBe(ours.conversions.A);
	});

	it("globalResendInterval: the user's edit wins, otherwise adopts external", () => {
		const base: Config = { globalResendInterval: 5, conversions: {} };
		const oursTouched: Config = { ...base, globalResendInterval: 10 };
		const theirs: Config = { globalResendInterval: 7, conversions: {} };
		expect(
			mergeExternalConfig(base, oursTouched, theirs).globalResendInterval,
		).toBe(10);
		// Untouched (ours === base): adopt the external value.
		expect(mergeExternalConfig(base, base, theirs).globalResendInterval).toBe(
			7,
		);
	});

	it("advisor block: the user's edit wins, otherwise adopts external", () => {
		const advisorBase = { ...DEFAULT_ADVISOR_CONFIG };
		const base: Config = {
			globalResendInterval: 0,
			conversions: {},
			advisor: advisorBase,
		};
		const oursAdvisor = { ...DEFAULT_ADVISOR_CONFIG, enabled: true };
		const ours = __advisorReducerForTest(base, oursAdvisor);
		const theirsAdvisor = { ...DEFAULT_ADVISOR_CONFIG, autoApply: false };
		const theirs: Config = {
			globalResendInterval: 0,
			conversions: {},
			advisor: theirsAdvisor,
		};
		expect(mergeExternalConfig(base, ours, theirs).advisor).toBe(oursAdvisor);
		expect(mergeExternalConfig(base, base, theirs).advisor).toBe(theirsAdvisor);
	});
});
