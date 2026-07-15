// Shared recommendation types used by both server and browser code. Pure declarations: no
// runtime behavior, so no test file. Behavior that uses these types is
// tested in src/test/advisor.test.ts.

/** One observed Signal K path and where it currently comes from. */
interface PathInventoryEntry {
	path: string;
	live: boolean;
	/** `$source` labels publishing this path live. Empty when not live. */
	liveSources: string[];
	/** QuestDB history for this path, present only when QuestDB was queried. */
	historic?: HistoricStats;
}

export type PathInventory = PathInventoryEntry[];

/** QuestDB history stats for one path within the look-back window. */
interface HistoricStats {
	samples: number;
	lastSeen: string;
}

/** Historic stats keyed by Signal K path. */
export type HistoricPaths = Map<string, HistoricStats>;

/**
 * What a review recommends doing with a conversion. `clear-source` means the
 * conversion is enabled but one of its per-path `$source` pins names a source
 * that no longer publishes that path (a renamed provider or a re-enumerated
 * sensor), so it is emitting nothing; clearing the pin lets it follow the live
 * source.
 */
export type AdvisorAction = "enable" | "disable" | "keep" | "clear-source";

/** One per-path source pin that no longer matches a live source. */
export interface StaleSourcePin {
	path: string;
	/** The configured `$source` that is no longer publishing `path`. */
	pinned: string;
	/** The sources currently publishing `path`. */
	liveSources: string[];
}

/** A single recommendation about one conversion. */
export interface Recommendation {
	optionKey: string;
	action: AdvisorAction;
	currentlyEnabled: boolean;
	matchedPaths: string[];
	confidence: "high" | "low";
	origin: "live" | "historic";
	reason: string;
	/** Present only for action "clear-source": the pins that are stale. */
	staleSources?: StaleSourcePin[];
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
	action?: Exclude<AdvisorAction, "keep">;
	/**
	 * For action "clear-source": the path keys to remove from the conversion's
	 * `sources` map, so it follows the live source for those paths again.
	 */
	clearSourcePaths?: string[];
}
