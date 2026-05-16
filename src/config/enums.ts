// Plain TypeScript enums so the panel bundle does not pull in @sinclair/typebox.
// schema.ts re-exports these for server-side back-compat; the panel imports
// them directly from this module.

export const Categories = [
	"navigation",
	"engine",
	"electrical",
	"tanks",
	"environment",
	"ais",
	"comms",
	"system",
] as const;
export type ConversionCategory = (typeof Categories)[number];

export const PresetTags = [
	"basic-nav",
	"engine-set",
	"full-ais",
	"environmental",
	"raymarine",
] as const;
export type PresetTag = (typeof PresetTags)[number];

// Plain-object mirror of the AdvisorConfig schema defaults. The panel bundle
// must not import @sinclair/typebox, so the panel uses this instead of
// materializing defaults from the schema. A test in advisor-config.test.ts
// asserts this stays in lockstep with the schema.
export const DEFAULT_ADVISOR_CONFIG = {
	enabled: false,
	openRouter: {
		enabled: false,
		apiKey: "",
		model: "anthropic/claude-haiku-4.5",
		maxCallsPerDay: 25,
	},
	questdb: { enabled: false, url: "http://localhost:9000", lookbackDays: 7 },
	schedule: { periodic: false, intervalDays: 7 },
} as const;
