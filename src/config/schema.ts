import { type Static, Type } from "@sinclair/typebox";

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
	globalResendInterval: Type.Integer({ default: 30, minimum: 0 }),
	conversions: Type.Record(Type.String(), Conversion, { default: {} }),
});

export type Config = Static<typeof RootConfig>;
export type ConversionConfig = Static<typeof Conversion>;
