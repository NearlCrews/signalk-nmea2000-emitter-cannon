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
				| "engineStaticMapping"
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
	pgns: string[];
	category: ConversionCategory;
	presets: PresetTag[];
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
	// PGN (keep enabled for other consumers like Victron or Maretron).
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
