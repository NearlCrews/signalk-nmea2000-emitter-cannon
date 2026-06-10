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

// Display labels for each category. Shared by every panel surface that renders
// a category name (the tabs, the search-result group headers, the setup wizard)
// so the casing stays consistent, notably "AIS" rather than a naive "Ais".
export const CategoryLabels: Record<ConversionCategory, string> = {
	navigation: "Navigation",
	engine: "Engine",
	electrical: "Electrical",
	tanks: "Tanks",
	environment: "Environment",
	ais: "AIS",
	comms: "Comms",
	system: "System",
};

/**
 * Group items by their conversion category, in canonical Categories order,
 * dropping empty groups. Shared by the panel surfaces that render
 * category-sectioned lists so the section order cannot drift between them.
 */
export function groupByCategory<T extends { category: ConversionCategory }>(
	items: readonly T[],
): Array<{ cat: ConversionCategory; list: T[] }> {
	return Categories.flatMap((cat) => {
		const list = items.filter((item) => item.category === cat);
		return list.length > 0 ? [{ cat, list }] : [];
	});
}

// canboat SEATALK_NETWORK_GROUP labels for the PGN 126720 `group` LOOKUP, in
// canboat enum order. Shared by the runtime label-validation fallback in
// conversions/raymarineBrightness.ts and the panel's group picker, so the two
// cannot drift.
export const SEATALK_NETWORK_GROUPS: readonly string[] = [
	"None",
	"Helm 1",
	"Helm 2",
	"Cockpit",
	"Flybridge",
	"Mast",
	"Group 1",
	"Group 2",
	"Group 3",
	"Group 4",
	"Group 5",
];

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
	autoApply: true,
	openRouter: {
		enabled: false,
		apiKey: "",
		model: "anthropic/claude-haiku-4.5",
		maxCallsPerDay: 25,
	},
	questdb: { enabled: false, url: "http://localhost:9000", lookbackDays: 7 },
	schedule: { periodic: false, intervalDays: 7 },
} as const;

// Single source for the globalResendInterval help text: schema.ts uses it as
// the TypeBox description and the panel's GlobalSettings renders it. It lives
// here (not schema.ts) so the panel import stays typebox-free.
export const GLOBAL_RESEND_HELP =
	"Seconds between automatic re-emits of each conversion's most recent value. Set 0 to disable global resend; a conversion can still opt in with its own resend interval.";
