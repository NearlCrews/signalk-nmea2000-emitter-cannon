// Shared types for the Config Advisor subsystem. Pure declarations: no
// runtime behavior, so no test file. Behavior that uses these types is
// tested in src/test/advisor.test.ts.

/** One observed Signal K path and where it currently comes from. */
export interface PathInventoryEntry {
	path: string;
	live: boolean;
	/** `$source` labels publishing this path live. Empty when not live. */
	liveSources: string[];
}

export type PathInventory = PathInventoryEntry[];

/** A single recommendation about one conversion. */
export interface Recommendation {
	optionKey: string;
	action: "enable" | "disable" | "keep";
	currentlyEnabled: boolean;
	matchedPaths: string[];
	confidence: "high" | "low";
	origin: "live" | "none";
	reason: string;
}

/** The outcome of one review run. */
export interface ReviewResult {
	ranAt: string;
	/** Confident enables, already written to config. */
	autoApplied: Recommendation[];
	/** Disables awaiting user approval. */
	pending: Recommendation[];
	/** Non-fatal warnings (e.g. a data source was unavailable). */
	notes: string[];
}

/** One user decision on a pending recommendation. */
export interface ApplyDecision {
	optionKey: string;
	approved: boolean;
}
