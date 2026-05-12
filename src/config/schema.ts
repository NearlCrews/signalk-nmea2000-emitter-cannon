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

export const RootConfig = Type.Object({
	globalResendInterval: Type.Integer({
		default: DEFAULT_GLOBAL_RESEND_SECONDS,
		minimum: 0,
	}),
	conversions: Type.Record(Type.String(), Conversion, { default: {} }),
});

export type Config = Static<typeof RootConfig>;
export type ConversionConfig = Static<typeof Conversion>;
