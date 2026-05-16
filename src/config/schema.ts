import { type Static, Type } from "@sinclair/typebox";
import { DEFAULT_GLOBAL_RESEND_SECONDS } from "../constants.js";

// Re-exported for server-side back-compat. The real definitions live in
// ./enums.ts so the panel bundle (which never needs the typebox schema) can
// import them without pulling @sinclair/typebox into the panel chunks.
export {
	Categories,
	type ConversionCategory,
	type PresetTag,
	PresetTags,
} from "./enums.js";

// sources and extras are required with a {} default so every consumer can
// rely on them being objects. The previous Type.Optional shape forced a
// `?? {}` spread at every read site (panel reducer, plugin-manager flatten,
// ConversionCard render). migrateLegacyConfig and the panel reducer both
// emit {} for missing values so on-disk configs that pre-date this change
// still load.
const ConversionCommon = Type.Object({
	enabled: Type.Boolean({ default: false }),
	resend: Type.Integer({ default: 0, minimum: 0 }),
	sources: Type.Record(Type.String(), Type.String(), { default: {} }),
});

export const Conversion = Type.Composite([
	ConversionCommon,
	Type.Object({
		extras: Type.Record(Type.String(), Type.Unknown(), { default: {} }),
	}),
]);

// Every object level carries its own `default: {}` so Value.Default
// recurses: an absent advisor block materializes as `{}`, then each child
// object materializes, then the leaf per-field defaults fill. The outer
// `default: {}` is what lets `Type.Optional(AdvisorConfig)` in RootConfig
// fill an absent block instead of leaving it undefined.
const AdvisorConfig = Type.Object(
	{
		enabled: Type.Boolean({ default: false }),
		// When true, a review enables recommended conversions immediately.
		// When false, those enables are parked as pending like disables.
		autoApply: Type.Boolean({ default: true }),
		openRouter: Type.Object(
			{
				enabled: Type.Boolean({ default: false }),
				apiKey: Type.String({ default: "" }),
				model: Type.String({ default: "anthropic/claude-haiku-4.5" }),
				maxCallsPerDay: Type.Integer({ default: 25, minimum: 0 }),
			},
			{ default: {} },
		),
		questdb: Type.Object(
			{
				enabled: Type.Boolean({ default: false }),
				url: Type.String({ default: "http://localhost:9000" }),
				lookbackDays: Type.Integer({ default: 7, minimum: 1 }),
			},
			{ default: {} },
		),
		schedule: Type.Object(
			{
				periodic: Type.Boolean({ default: false }),
				intervalDays: Type.Integer({ default: 7, minimum: 1 }),
			},
			{ default: {} },
		),
	},
	{ default: {} },
);

export const RootConfig = Type.Object({
	globalResendInterval: Type.Integer({
		default: DEFAULT_GLOBAL_RESEND_SECONDS,
		minimum: 0,
	}),
	conversions: Type.Record(Type.String(), Conversion, { default: {} }),
	advisor: Type.Optional(AdvisorConfig),
});

export type Config = Static<typeof RootConfig>;
export type ConversionConfig = Static<typeof Conversion>;
export type AdvisorConfigType = Static<typeof AdvisorConfig>;
