import type { Plugin } from "@signalk/server-api";
import type { SourceType } from "../constants.js";
import type { N2KMessage } from "./nmea2000.js";
import type { SignalKApp } from "./signalk.js";

export type ConversionCallback<T extends unknown[] = unknown[]> = (
	...values: T
) => N2KMessage[] | Promise<N2KMessage[]>;

export interface SignalKPlugin extends Plugin {
	description: string;
}

export interface ConversionOptions {
	enabled: boolean;
	resend?: number;
	[optionKey: string]: unknown;
}

// Normalized internal shape. Per-conversion options live under
// `conversions` keyed by each module's `optionKey`, narrowing every read
// to `ConversionOptions | undefined` instead of the wide wire-format union.
export interface PluginOptions {
	globalResendInterval?: number;
	conversions: Record<string, ConversionOptions>;
}

export function isConversionOptions(
	v: ConversionOptions | undefined,
): v is ConversionOptions {
	return typeof v === "object" && v !== null;
}

// `callback` and `conversions` use method-style signatures so TypeScript
// treats their parameters bivariantly. This lets the registry hold
// heterogeneous SubConversionModule values (each with its own narrow tuple)
// under a single SubConversionModule<unknown[]> umbrella while individual
// modules declare a precise input type. Switching to arrow-style under
// strictFunctionTypes would break compilation in every module.
export interface SubConversionModule<T extends unknown[] = unknown[]> {
	title?: string;
	keys?: string[] | ((options: ConversionOptions) => string[]);
	sourceType?: SourceType;
	timeouts?: number[];
	interval?: number;
	callback?(...values: T): N2KMessage[] | Promise<N2KMessage[]>;
	tests?: ConversionTest[];
}

export interface ConversionModule<T extends unknown[] = unknown[]> {
	title: string;
	optionKey: string;
	category: import("../config/enums.js").ConversionCategory;
	presets?: import("../config/enums.js").PresetTag[];
	keys?: string[] | ((options: ConversionOptions) => string[]);
	context?: string;
	sourceType?: SourceType;
	timeouts?: number[];
	interval?: number;
	callback?(...values: T): N2KMessage[] | Promise<N2KMessage[]>;
	conversions?:
		| SubConversionModule<T>[]
		| ((options: ConversionOptions) => SubConversionModule<T>[] | null);
	tests?: ConversionTest[];
	testOptions?: unknown;
	resendTimer?: NodeJS.Timeout;
	onOptionsLoaded?: (options: ConversionOptions) => void;
}

type TestExpectedMessage = N2KMessage & {
	__preprocess__?: (testResult: N2KMessage) => void;
};

interface ConversionTest {
	input: unknown[];
	expected:
		| TestExpectedMessage[]
		| ((testOptions: Record<string, unknown>) => TestExpectedMessage)[];
	skData?: Record<string, unknown>;
	skSelfData?: Record<string, unknown>;
	testOptions?: Record<string, unknown>;
}

export type SourceTypeMapper = (
	conversion: ConversionModule,
	options: ConversionOptions,
) => void;

export type ConversionModuleFactory = (
	app: SignalKApp,
	plugin: SignalKPlugin,
) => ConversionModule<unknown[]> | ConversionModule<unknown[]>[];

export interface ProcessingOptions {
	resend?: number;
}
