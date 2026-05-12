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

const ConversionCommon = Type.Object({
	enabled: Type.Boolean({ default: false }),
	resend: Type.Integer({ default: 0, minimum: 0 }),
	sources: Type.Optional(Type.Record(Type.String(), Type.String())),
});

export const Conversion = Type.Composite([
	ConversionCommon,
	Type.Object({
		extras: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
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
