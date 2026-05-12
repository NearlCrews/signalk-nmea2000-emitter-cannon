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
