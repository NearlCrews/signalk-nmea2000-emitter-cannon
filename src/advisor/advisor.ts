import type { ConversionMetadata } from "../api/types.js";
import { emptyConversionConfig } from "../config/defaults.js";
import type { ConversionConfig, ConversionMap } from "../config/schema.js";
import { COMPETING_WIND_PRODUCERS, competingWindProducers } from "../config/windConflicts.js";
import { recommend } from "../recommendation/recommender.js";
import type {
	ApplyDecision,
	ClearSourceApproval,
	HistoricPaths,
	PathInventory,
	PendingReviewResult,
	Recommendation,
	ReviewResult,
} from "../recommendation/types.js";
import { errMessage } from "../utils/errorUtils.js";
import { pathToPropName } from "../utils/pathUtils.js";
import { isPlainObject, isValidNumber } from "../utils/validation.js";
import { mergeHistoric } from "./inventory.js";

/**
 * Everything the orchestrator needs, abstracted from `SignalKApp` so it is
 * unit-testable. The plugin supplies the real implementations in index.ts.
 */
export interface AdvisorDeps {
	buildInventory: () => PathInventory;
	getMetadata: () => ConversionMetadata[];
	readConfig: () => Record<string, unknown>;
	/**
	 * Apply one focused mutation to the freshest authoritative configuration.
	 * The implementation invokes the updater once immediately before persistence
	 * and skips persistence when it returns the same object.
	 */
	updateConfig: (updater: AdvisorConfigUpdater) => Promise<void>;
	now?: () => Date;
	/** Optional QuestDB history fetch. Absent or undefined skips QuestDB. */
	fetchHistoric?: (url: string, lookbackDays: number) => Promise<HistoricPaths>;
	/** Optional QuestDB reachability probe for the connectivity endpoint. */
	probeQuestDB?: (url: string) => Promise<boolean>;
}

export type AdvisorConfigUpdater = (
	currentConfig: Record<string, unknown>,
) => Record<string, unknown>;

/** Operation failure carrying wording that is safe and useful in the panel. */
export class AdvisorOperationError extends Error {
	constructor(
		message: string,
		readonly publicMessage: string,
	) {
		super(message);
		this.name = "AdvisorOperationError";
	}
}

// Runtime fallback for advisor.questdb.lookbackDays when the configured value
// is missing or not a positive number: fetchHistoricPaths builds a SQL
// `dateadd` expression and a zero/negative/NaN value produces a broken QuestDB
// query. Keep this in sync with the schema default (config/schema.ts) and its
// enum default (config/enums.ts); it is a separate copy because this guards
// unvalidated config and cannot import the validated schema default.
const DEFAULT_LOOKBACK_DAYS = 7;

type ApplicableAction = "enable" | "disable" | "clear-source";

interface ApplicableDecision {
	optionKey: string;
	action: ApplicableAction;
	clearSources: ClearSourceApproval[];
}

function applicableAction(value: unknown): ApplicableAction | null {
	if (value === undefined || value === "disable") return "disable";
	if (value === "enable" || value === "clear-source") return value;
	return null;
}

/** Defense-in-depth validation for callers other than the HTTP router. */
function applicableDecision(
	value: unknown,
	metadataByKey: ReadonlyMap<string, ConversionMetadata>,
	pendingByKey: ReadonlyMap<string, Recommendation>,
): ApplicableDecision | null {
	if (!isPlainObject(value) || value.approved !== true || typeof value.optionKey !== "string") {
		return null;
	}
	const metadata = metadataByKey.get(value.optionKey);
	const action = applicableAction(value.action);
	if (!metadata || !action) return null;

	if (action !== "clear-source") {
		return value.clearSources === undefined && value.clearSourcePaths === undefined
			? { optionKey: value.optionKey, action, clearSources: [] }
			: null;
	}
	if (
		value.clearSourcePaths !== undefined ||
		!Array.isArray(value.clearSources) ||
		value.clearSources.length === 0 ||
		!value.clearSources.every(
			(source) =>
				isPlainObject(source) &&
				typeof source.path === "string" &&
				source.path.length > 0 &&
				source.path === source.path.trim() &&
				typeof source.pinned === "string" &&
				source.pinned.trim().length > 0,
		)
	) {
		return null;
	}
	const declaredPaths = new Set(metadata.paths);
	const reviewed = pendingByKey.get(value.optionKey);
	if (reviewed?.action !== "clear-source" || !Array.isArray(reviewed.staleSources)) return null;
	const reviewedPins = new Map<string, string>();
	for (const source of reviewed.staleSources) {
		if (
			!declaredPaths.has(source.path) ||
			typeof source.pinned !== "string" ||
			source.pinned.trim().length === 0 ||
			reviewedPins.has(source.path)
		) {
			return null;
		}
		reviewedPins.set(source.path, source.pinned);
	}
	const clearSourcesByPath = new Map<string, string>();
	for (const source of value.clearSources) {
		const path = source.path as string;
		const pinned = source.pinned as string;
		if (
			!declaredPaths.has(path) ||
			reviewedPins.get(path) !== pinned ||
			clearSourcesByPath.has(path)
		) {
			return null;
		}
		clearSourcesByPath.set(path, pinned);
	}
	if (clearSourcesByPath.size !== reviewedPins.size) return null;

	return {
		optionKey: value.optionKey,
		action,
		clearSources: [...clearSourcesByPath].map(([path, pinned]) => ({ path, pinned })),
	};
}

export class Advisor {
	private lastReview: PendingReviewResult = {
		autoApplied: [],
		pending: [],
		notes: [],
	};
	private operationTail: Promise<void> = Promise.resolve();

	constructor(private readonly deps: AdvisorDeps) {}

	/** Build an inventory, recommend, auto-apply enables, return the result. */
	async runReview(): Promise<ReviewResult> {
		return this.enqueue(() => this.runReviewSerial());
	}

	private async runReviewSerial(): Promise<ReviewResult> {
		const now = (this.deps.now ?? (() => new Date()))();
		const config = this.deps.readConfig();
		const conversions = this.conversionsOf(config);

		const notes: string[] = [];
		let inventory = this.deps.buildInventory();

		const questdb = this.questdbConfig(config);
		if (questdb?.enabled && this.deps.fetchHistoric) {
			try {
				const historic = await this.deps.fetchHistoric(questdb.url, questdb.lookbackDays);
				inventory = mergeHistoric(inventory, historic);
			} catch (err) {
				const detail = errMessage(err);
				notes.push(`QuestDB history unavailable (${detail}); reviewed live data only.`);
			}
		}

		const metadata = this.deps.getMetadata();
		const recs = this.withoutWindConflicts(
			recommend({
				inventory,
				metadata,
				currentConfig: conversions,
			}),
			conversions,
			notes,
			metadata,
		);

		const enables = recs.filter((r) => r.action === "enable");
		const disables = recs.filter((r) => r.action === "disable");
		// Stale-source fixes change data routing, so like disables they are never
		// auto-applied; they always wait for approval.
		const clears = recs.filter((r) => r.action === "clear-source");
		// "keep" recommendations are never surfaced (getPending and ReviewResult
		// carry only the actionable kinds), and on a typical boat keeps are the
		// majority.
		const actionable = [...enables, ...disables, ...clears];

		const ranAt = now.toISOString();
		const autoApplyRequested = this.autoApplyFlag(config);
		const appliedKeys = new Set<string>();
		const resolvedKeys = new Set<string>();
		if (autoApplyRequested && enables.length > 0) {
			try {
				await this.deps.updateConfig((currentConfig) => {
					// A user may turn auto-apply off while a historic review is in
					// flight. Honor the freshest saved setting at the write boundary.
					if (!this.autoApplyFlag(currentConfig)) return currentConfig;

					const currentConversions = this.conversionsOf(currentConfig);
					const next = { ...currentConversions };
					for (const recommendation of enables) {
						const entry = this.entryOf(next, recommendation.optionKey);
						if (entry.enabled === true) {
							resolvedKeys.add(recommendation.optionKey);
							continue;
						}
						const competitor = competingWindProducers(recommendation.optionKey).find(
							(optionKey) => this.entryOf(next, optionKey).enabled === true,
						);
						if (competitor !== undefined) {
							notes.push(
								`Skipped enabling ${recommendation.optionKey} because ${competitor} became enabled while the review was running.`,
							);
							continue;
						}
						next[recommendation.optionKey] = { ...entry, enabled: true };
						appliedKeys.add(recommendation.optionKey);
						resolvedKeys.add(recommendation.optionKey);
					}
					return appliedKeys.size > 0 ? { ...currentConfig, conversions: next } : currentConfig;
				});
			} catch (error) {
				// A recommendation whose automatic save failed is still actionable.
				this.lastReview = { ranAt, autoApplied: [], pending: actionable, notes };
				throw error;
			}
		}

		const autoApplied = enables.filter((recommendation) =>
			appliedKeys.has(recommendation.optionKey),
		);
		const pending = autoApplyRequested
			? [
					...enables.filter((recommendation) => !resolvedKeys.has(recommendation.optionKey)),
					...disables,
					...clears,
				]
			: actionable;
		const result = { ranAt, autoApplied, pending, notes };
		this.lastReview = result;
		return result;
	}

	/** The pending list from the most recent runReview. */
	getPending(): Recommendation[] {
		return [...this.lastReview.pending];
	}

	/** Full parked review context for the panel's pending endpoint. */
	getPendingResult(): PendingReviewResult {
		return {
			...this.lastReview,
			autoApplied: [...this.lastReview.autoApplied],
			pending: [...this.lastReview.pending],
			notes: [...this.lastReview.notes],
		};
	}

	/**
	 * Probe QuestDB using the configured url. Reports `ok: false` if the
	 * probe is unavailable or QuestDB is unreachable.
	 */
	async testQuestDB(): Promise<{ ok: boolean }> {
		const questdb = this.questdbConfig(this.deps.readConfig());
		if (!questdb || !this.deps.probeQuestDB) return { ok: false };
		return { ok: await this.deps.probeQuestDB(questdb.url) };
	}

	/**
	 * Apply approved decisions; rejected decisions are left untouched.
	 *
	 * Each decision carries the recommended `action` it approves: an enable sets
	 * `enabled: true`, a disable sets `enabled: false`, and a clear-source
	 * removes named path pins only when they still match the stale values recorded
	 * by the parked recommendation. An absent action is treated as "disable" for
	 * backward compatibility with the autoApply-on flow, whose pending list is
	 * disables.
	 */
	async applyReview(decisions: ApplyDecision[]): Promise<number> {
		return this.enqueue(() => this.applyReviewSerial(decisions));
	}

	private async applyReviewSerial(decisions: ApplyDecision[]): Promise<number> {
		if (!Array.isArray(decisions)) return 0;
		const metadataByKey = new Map(
			this.deps.getMetadata().map((metadata) => [metadata.key, metadata]),
		);
		const pendingByKey = new Map(
			this.lastReview.pending.map((recommendation) => [recommendation.optionKey, recommendation]),
		);
		// The last applicable approval wins when a caller repeats an optionKey.
		// Applying two contradictory actions to one conversion would otherwise
		// inflate the applied count and make the result depend on array order.
		const approvedByKey = new Map<string, ApplicableDecision>();
		for (const decision of decisions) {
			const applicable = applicableDecision(decision, metadataByKey, pendingByKey);
			if (applicable) approvedByKey.set(applicable.optionKey, applicable);
		}
		const approved = [...approvedByKey.values()];
		if (approved.length === 0) return 0;

		const appliedKeys = new Set<string>();

		const windEnablePriority = new Map<string, number>();
		for (const [primaryKey, alternateKey] of COMPETING_WIND_PRODUCERS) {
			windEnablePriority.set(primaryKey, 0);
			windEnablePriority.set(alternateKey, 1);
		}
		const enables = approved
			.filter((decision) => decision.action === "enable")
			.sort(
				(a, b) =>
					(windEnablePriority.get(a.optionKey) ?? 0) - (windEnablePriority.get(b.optionKey) ?? 0),
			);
		await this.deps.updateConfig((currentConfig) => {
			// All decisions are applied to the newest saved configuration at the
			// persistence boundary, preserving unrelated concurrent edits.
			const conversions = { ...this.conversionsOf(currentConfig) };

			// Disable first so an explicitly approved producer swap can enable the
			// replacement in the same request without a transient wind conflict.
			for (const decision of approved.filter((item) => item.action === "disable")) {
				const entry = this.entryOf(conversions, decision.optionKey);
				if (entry.enabled !== true) continue;
				conversions[decision.optionKey] = { ...entry, enabled: false };
				appliedKeys.add(decision.optionKey);
			}

			for (const decision of approved.filter((item) => item.action === "clear-source")) {
				const entry = this.entryOf(conversions, decision.optionKey);
				const sources = { ...entry.sources };
				const matchingKeys = new Set<string>();
				let staleDecision = false;
				for (const reviewedSource of decision.clearSources) {
					const candidateKeys = new Set([reviewedSource.path, pathToPropName(reviewedSource.path)]);
					const matches = [...candidateKeys].filter(
						(key) => Object.hasOwn(sources, key) && sources[key] === reviewedSource.pinned,
					);
					if (matches.length === 0) {
						staleDecision = true;
						break;
					}
					for (const key of matches) matchingKeys.add(key);
				}
				if (staleDecision) continue;
				for (const key of matchingKeys) delete sources[key];
				conversions[decision.optionKey] = { ...entry, sources };
				appliedKeys.add(decision.optionKey);
			}

			for (const decision of enables) {
				const entry = this.entryOf(conversions, decision.optionKey);
				if (entry.enabled === true) continue;
				const hasEnabledCompetitor = competingWindProducers(decision.optionKey).some(
					(optionKey) => this.entryOf(conversions, optionKey).enabled === true,
				);
				if (hasEnabledCompetitor) continue;
				conversions[decision.optionKey] = { ...entry, enabled: true };
				appliedKeys.add(decision.optionKey);
			}

			return appliedKeys.size > 0 ? { ...currentConfig, conversions } : currentConfig;
		});

		if (appliedKeys.size === 0) return 0;

		// Drop applied items from the parked result so getPending (and the panel's
		// /pending fetch) stop reporting already-applied recommendations. The
		// Advisor instance outlives PluginManager restarts, so the implicit
		// restart from updateConfig does not clear this on its own.
		this.lastReview = {
			...this.lastReview,
			pending: this.lastReview.pending.filter((r) => !appliedKeys.has(r.optionKey)),
		};
		return appliedKeys.size;
	}

	/** Suppress recommendations that would create two PGN 130306 producers. */
	private withoutWindConflicts(
		recommendations: Recommendation[],
		conversions: ConversionMap,
		notes: string[],
		metadata: ConversionMetadata[],
	): Recommendation[] {
		const byKey = new Map(
			recommendations.map((recommendation) => [recommendation.optionKey, recommendation]),
		);
		const metadataByKey = new Map(metadata.map((conversion) => [conversion.key, conversion]));
		const suppressed = new Set<string>();
		const replacements = new Map<string, Recommendation>();

		for (const [primaryKey, alternateKey, identity] of COMPETING_WIND_PRODUCERS) {
			const primaryEnabled = this.entryOf(conversions, primaryKey).enabled === true;
			const alternateEnabled = this.entryOf(conversions, alternateKey).enabled === true;
			const primary = byKey.get(primaryKey);
			const alternate = byKey.get(alternateKey);

			if (primaryEnabled && alternateEnabled) {
				if (primary?.action !== "disable" && alternate?.action !== "disable") {
					replacements.set(alternateKey, {
						...(alternate ?? {
							optionKey: alternateKey,
							currentlyEnabled: true,
							matchedPaths: metadataByKey.get(alternateKey)?.paths ?? [],
							confidence: "high" as const,
							origin: "configuration" as const,
						}),
						action: "disable",
						reason: `${alternateKey}: disable this duplicate producer because ${primaryKey} already emits ${identity} as PGN 130306.`,
					});
				}
				notes.push(
					`${primaryKey} and ${alternateKey} are both enabled for ${identity}; approve a disable recommendation or disable one producer in settings.`,
				);
				continue;
			}

			if (primaryEnabled && alternate?.action === "enable") {
				suppressed.add(alternateKey);
				notes.push(
					`Skipped enabling ${alternateKey} because ${primaryKey} already emits ${identity}.`,
				);
				continue;
			}
			if (alternateEnabled && primary?.action === "enable") {
				suppressed.add(primaryKey);
				notes.push(
					`Skipped enabling ${primaryKey} because ${alternateKey} already emits ${identity}.`,
				);
				continue;
			}
			if (primary?.action === "enable" && alternate?.action === "enable") {
				suppressed.add(alternateKey);
				notes.push(
					`Skipped enabling ${alternateKey} because ${primaryKey} is the preferred ${identity} producer.`,
				);
			}
		}

		const withSyntheticReplacements = [...recommendations];
		for (const [optionKey, replacement] of replacements) {
			if (!byKey.has(optionKey)) withSyntheticReplacements.push(replacement);
		}

		return withSyntheticReplacements
			.filter((recommendation) => !suppressed.has(recommendation.optionKey))
			.map((recommendation) => replacements.get(recommendation.optionKey) ?? recommendation);
	}

	/** Serialize read-modify-write operations, and keep the queue usable after a failure. */
	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.operationTail.then(operation, operation);
		this.operationTail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private conversionsOf(config: Record<string, unknown>): ConversionMap {
		const c = config.conversions;
		return isPlainObject(c) ? (c as ConversionMap) : {};
	}

	/** The `advisor` config block as an object, or null when absent. */
	private advisorSection(config: Record<string, unknown>): Record<string, unknown> | null {
		const advisor = config.advisor;
		return isPlainObject(advisor) ? advisor : null;
	}

	/** The advisor.autoApply flag; defaults to true when unset. */
	private autoApplyFlag(config: Record<string, unknown>): boolean {
		const advisor = this.advisorSection(config);
		return advisor ? advisor.autoApply !== false : true;
	}

	private questdbConfig(
		config: Record<string, unknown>,
	): { enabled: boolean; url: string; lookbackDays: number } | null {
		const q = this.advisorSection(config)?.questdb;
		if (!isPlainObject(q)) return null;
		const { enabled, url, lookbackDays } = q;
		if (typeof url !== "string") return null;
		const days =
			isValidNumber(lookbackDays) && lookbackDays > 0 ? lookbackDays : DEFAULT_LOOKBACK_DAYS;
		return { enabled: enabled === true, url, lookbackDays: days };
	}

	private entryOf(map: ConversionMap, key: string): ConversionConfig {
		return map[key] ?? emptyConversionConfig();
	}
}
