import { describe, expect, it } from "vitest";
import type { ConversionMetadata } from "../api/types.js";
import { DEFAULT_ADVISOR_CONFIG } from "../config/enums.js";
import { RAYMARINE_EXTRAS_PATCH } from "../config/raymarinePreset.js";
import type { Config, ConversionConfig } from "../config/schema.js";
import { shouldShowFirstRunCallout } from "../panel/firstRunState.js";
import {
	__advisorReducerForTest,
	__applyPresetForTest,
	__configReducerForTest,
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

// Minimal catalog row carrying just the preset tags the reducer reads.
function meta(key: string, presets: ConversionMetadata["presets"]) {
	return { presets, key } as unknown as ConversionMetadata;
}

describe("first-run callout", () => {
	const catalog = [{ key: "WIND" }, { key: "DEPTH" }];

	it("uses current panel configuration rather than inactive runtime counters", () => {
		expect(
			shouldShowFirstRunCallout(catalog, {
				WIND: entry({ enabled: true }),
			}),
		).toBe(false);
	});

	it("waits for the catalog and appears when no catalog entry is enabled", () => {
		expect(shouldShowFirstRunCallout([], {})).toBe(false);
		expect(
			shouldShowFirstRunCallout(catalog, {
				WIND: entry(),
			}),
		).toBe(true);
	});
});

describe("applyPreset reducer action", () => {
	// A realistic Raymarine catalog: three patch-table keys plus one
	// raymarine-tagged proprietary module that is not in the patch table.
	const raymarineCatalog = [
		meta("TEMPERATURE2_INSIDE", ["environmental", "raymarine"]),
		meta("TEMPERATURE2_REFRIGERATOR", ["environmental", "raymarine"]),
		meta("HUMIDITY_INSIDE", ["environmental", "raymarine"]),
		meta("RAYMARINE_BRIGHTNESS", ["raymarine"]),
	];

	it("Raymarine preset enables and remaps the inside-family temps and humidity", () => {
		const start: Config = { globalResendInterval: 0, conversions: {} };
		const next = __applyPresetForTest(start, "raymarine", raymarineCatalog);

		for (const [key, patch] of Object.entries(RAYMARINE_EXTRAS_PATCH)) {
			const cfg = next.conversions[key];
			expect(cfg?.enabled).toBe(true);
			expect(cfg?.extras).toMatchObject({
				n2kSource: patch.n2kSource,
				instance: patch.instance,
			});
		}
		// A raymarine-tagged conversion that is not in the patch table is enabled
		// but gets no source/instance extras.
		expect(next.conversions.RAYMARINE_BRIGHTNESS?.enabled).toBe(true);
		expect(next.conversions.RAYMARINE_BRIGHTNESS?.extras).toEqual({});
	});

	it("is idempotent under a double apply with a real catalog", () => {
		const start: Config = { globalResendInterval: 0, conversions: {} };
		const once = __applyPresetForTest(start, "raymarine", raymarineCatalog);
		const twice = __applyPresetForTest(once, "raymarine", raymarineCatalog);
		expect(twice.conversions).toEqual(once.conversions);
		expect(twice).toBe(once);
	});

	it("a non-Raymarine preset writes no source/instance extras", () => {
		const catalog = [meta("HUMIDITY_INSIDE", ["environmental"])];
		const start: Config = { globalResendInterval: 0, conversions: {} };
		const next = __applyPresetForTest(start, "environmental", catalog);
		expect(next.conversions.HUMIDITY_INSIDE?.enabled).toBe(true);
		expect(next.conversions.HUMIDITY_INSIDE?.extras).toEqual({});
	});
});

describe("no-op reducer actions", () => {
	const start: Config = {
		globalResendInterval: 5,
		conversions: {
			WIND: entry({
				enabled: true,
				resend: 3,
				sources: { "environment.wind.speedApparent": "wind.0" },
				extras: { instance: 2 },
			}),
		},
		advisor: { ...DEFAULT_ADVISOR_CONFIG },
	};

	it.each([
		{ type: "setGlobalResend", ms: 5 } as const,
		{ type: "setEnabled", key: "WIND", enabled: true } as const,
		{ type: "setEnabled", key: "ABSENT", enabled: false } as const,
		{ type: "setResend", key: "WIND", ms: 3 } as const,
		{ type: "setResend", key: "ABSENT", ms: 0 } as const,
		{
			type: "setSource",
			key: "WIND",
			path: "environment.wind.speedApparent",
			source: "wind.0",
		} as const,
		{
			type: "setSource",
			key: "ABSENT",
			path: "environment.wind.speedApparent",
			source: "",
		} as const,
		{ type: "setExtras", key: "WIND", extras: { instance: 2 } } as const,
		{ type: "setExtras", key: "ABSENT", extras: {} } as const,
		{
			type: "setAdvisor",
			advisor: { ...DEFAULT_ADVISOR_CONFIG },
		} as const,
	])("preserves identity for $type", (action) => {
		expect(__configReducerForTest(start, action)).toBe(start);
	});
});

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
				A: entry({ enabled: true }),
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
				A: entry({ enabled: true }),
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
		expect(mergeExternalConfig(base, oursTouched, theirs).globalResendInterval).toBe(10);
		// Untouched (ours === base): adopt the external value.
		expect(mergeExternalConfig(base, base, theirs).globalResendInterval).toBe(7);
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
