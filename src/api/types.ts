import type { ConversionCategory, PresetTag } from "../config/enums.js";
import type { ApplyDecision, ReviewResult } from "../recommendation/types.js";

export interface StatusSnapshot {
	pluginRunning: boolean;
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
	/** Parent catalog key for a factory-produced runtime mapping row. */
	parentKey?: string;
	/** Zero-based index of this runtime mapping within its parent conversion. */
	mappingIndex?: number;
	/** Signal K paths required by this runtime conversion or mapping row. */
	inputPaths?: string[];
	/** Milliseconds since each required stream input path was last observed. */
	inputPathLastSeenMs?: Record<string, number>;
	/** Previously observed finite-timeout inputs that have now exceeded their freshness limit. */
	staleInputPaths?: string[];
	lastEmitMs?: number;
	emitCount: number;
	lastErrorMessage?: string;
	lastErrorAgeMs?: number;
	inputCount?: number;
	lastInputMs?: number;
	emptyOutputCount?: number;
	lastEmptyOutputMs?: number;
	sourceFilterDropCount?: number;
	nmea2000EchoDropCount?: number;
	lastDropReason?: "publisher-filter" | "nmea2000-echo";
	lastDropAgeMs?: number;
	/** Expected timer, refresh, or resend cadence in milliseconds. */
	expectedActivityMs?: number;
	/** Milliseconds since the last observed input, output, or scheduled tick. */
	lastActivityMs?: number;
	/** True once expected activity is overdue by three configured intervals. */
	activityStale?: boolean;
	/** Number of stale child mappings represented by a parent aggregate row. */
	staleChildCount?: number;
}

interface ExtrasFieldBase {
	key: string;
	label: string;
	default?: unknown;
}

// Discriminated on `control`: a select MUST carry its `options` (a select spec
// without them would render an empty dropdown), and only a number field accepts
// `min` / `max` bounds.
export type ExtrasFieldSpec =
	| (ExtrasFieldBase & {
			control: "text" | "number" | "boolean";
			// Inclusive bounds for `control: "number"`; ignored by the others.
			min?: number;
			max?: number;
	  })
	| (ExtrasFieldBase & {
			control: "select";
			options: { value: string; label: string }[];
	  });

export type ExtrasMeta =
	| { type: "none" }
	| {
			type:
				| "acMapping"
				| "batteryMapping"
				| "chargerMapping"
				| "inverterMapping"
				| "engineMapping"
				| "engineStaticMapping"
				| "vesselTripMapping"
				| "tankMapping"
				| "solarMapping"
				| "brightnessMapping"
				| "exhaustMapping";
			minRows: 0;
	  }
	| ({ type: "field" } & ExtrasFieldSpec)
	| { type: "fields"; fields: ExtrasFieldSpec[] };

// Set when a conversion's PGN has been superseded by a more modern NMEA 2000
// PGN. `supersededBy` names the modern PGN to prefer; `note` explains the
// deprecation. Purely informational: a legacy PGN often stays enabled for
// older MFDs that read only the old frame.
export interface ConversionLifecycle {
	supersededBy: string;
	note: string;
}

export interface ConversionMetadata {
	key: string;
	title: string;
	canResend: boolean;
	pgns: string[];
	category: ConversionCategory;
	presets: PresetTag[];
	/**
	 * Signal K input paths declared by the conversion. Dynamic factory paths are
	 * included when the metadata builder receives that conversion's current
	 * options; otherwise only paths that can be resolved without config appear.
	 */
	paths: string[];
	extras: ExtrasMeta;
	// Optional warning surfaced above the conversion card in the admin UI.
	// Used for regulatory or compatibility notes (e.g. AIS broadcast
	// licensing) that the user should see before enabling the conversion.
	description?: string;
	// Optional neutral one-line explanation of what the conversion does.
	// Rendered below the title so a non-NMEA reader can tell e.g. PGN 127498
	// (static identity) apart from 127489 (dynamic params).
	purpose?: string;
	// Optional hint for which major MFD vendors actually consume the PGN.
	// "consumes": Garmin reads and displays. "ignores": Garmin drops the
	// PGN (keep enabled for other receivers when required).
	// "partial": some Garmin models read, others do not.
	compatibility?: {
		garmin: "consumes" | "ignores" | "partial";
		note?: string;
	};
	// Drives the "Legacy" badge on the card. See ConversionLifecycle.
	legacy?: ConversionLifecycle;
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

/** Body of `POST /api/advisor/review`. */
export interface AdvisorReviewResponse {
	result: ReviewResult;
}

/**
 * Body of `GET /api/advisor/pending`. `ranAt` is absent until the first
 * review has run; consumers must treat it as optional rather than parsing
 * an empty string as a date.
 */
export interface AdvisorPendingResponse {
	result: {
		ranAt?: string;
		autoApplied: ReviewResult["autoApplied"];
		pending: ReviewResult["pending"];
		notes: ReviewResult["notes"];
	};
}

/** Request body of `POST /api/advisor/apply`. */
export interface AdvisorApplyRequest {
	decisions: ApplyDecision[];
}

/** Body of `POST /api/advisor/apply`. */
export interface AdvisorApplyResponse {
	applied: number;
}

// The remaining advisor probe responses mirror the Advisor class return
// shapes via `Awaited<ReturnType<...>>`, so a change in the advisor method
// flows through to the API contract without a manual second declaration.
type AdvisorApi = import("../advisor/advisor.js").Advisor;

/** Body of `GET /api/advisor/questdb-test`. */
export type AdvisorQuestDbTestResponse = Awaited<ReturnType<AdvisorApi["testQuestDB"]>>;
