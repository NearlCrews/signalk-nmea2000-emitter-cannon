// Shared types for the Config Advisor subsystem. Pure declarations: no
// runtime behavior, so no test file. Behavior that uses these types is
// tested in src/test/advisor.test.ts.

/** One observed Signal K path and where it currently comes from. */
export interface PathInventoryEntry {
	path: string;
	live: boolean;
	/** `$source` labels publishing this path live. Empty when not live. */
	liveSources: string[];
	/** QuestDB history for this path, present only when QuestDB was queried. */
	historic?: HistoricStats;
}

export type PathInventory = PathInventoryEntry[];

/** QuestDB history stats for one path within the look-back window. */
export interface HistoricStats {
	samples: number;
	lastSeen: string;
}

/** Historic stats keyed by Signal K path. */
export type HistoricPaths = Map<string, HistoricStats>;

/** What a review recommends doing with a conversion. */
export type AdvisorAction = "enable" | "disable" | "keep";

/** A single recommendation about one conversion. */
export interface Recommendation {
	optionKey: string;
	action: AdvisorAction;
	currentlyEnabled: boolean;
	matchedPaths: string[];
	confidence: "high" | "low";
	origin: "live" | "historic" | "none";
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
	/**
	 * The recommended action this decision approves. Carried in the request so
	 * applyReview does not depend on in-memory state surviving a restart.
	 * Absent is treated as "disable" for backward compatibility.
	 */
	action?: "enable" | "disable";
}
