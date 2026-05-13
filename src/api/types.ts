import type { ConversionCategory, PresetTag } from "../config/enums.js";

export interface StatusSnapshot {
	nmea2000Ready: boolean;
	enabledCount: number;
	totalConversions: number;
	perConversion: PerConversionStatus[];
	startTime: number;
}

export interface PerConversionStatus {
	key: string;
	title: string;
	enabled: boolean;
	lastEmitMs?: number;
	emitCount: number;
	lastErrorMessage?: string;
	lastErrorAgeMs?: number;
}

export interface ExtrasFieldSpec {
	key: string;
	label: string;
	control: "text" | "number" | "boolean";
	default?: unknown;
}

export type ExtrasMeta =
	| { type: "none" }
	| {
			type:
				| "batteryMapping"
				| "engineMapping"
				| "tankMapping"
				| "solarMapping"
				| "brightnessMapping"
				| "exhaustMapping";
			minRows: 0;
	  }
	| ({ type: "field" } & ExtrasFieldSpec)
	| { type: "fields"; fields: ExtrasFieldSpec[] };

export interface ConversionMetadata {
	key: string;
	title: string;
	pgns: string[];
	category: ConversionCategory;
	presets: PresetTag[];
	paths: string[];
	extras: ExtrasMeta;
}

export interface ConversionsResponse {
	conversions: ConversionMetadata[];
}

export interface PathsResponse {
	paths: string[];
}

export interface SourcesResponse {
	sources: string[];
}
