import type { ConversionMetadata } from "../api/types.js";
import {
	type ConversionConfig,
	emptyConversionConfig,
} from "../config/schema.js";
import { errMessage } from "../utils/errorUtils.js";
import { isPlainObject, isValidNumber } from "../utils/validation.js";
import { mergeHistoric } from "./inventory.js";
import { recommend } from "./recommender.js";
import type {
	ApplyDecision,
	HistoricPaths,
	PathInventory,
	Recommendation,
	ReviewResult,
} from "./types.js";

/**
 * Everything the orchestrator needs, abstracted from `SignalKApp` so it is
 * unit-testable. The plugin supplies the real implementations in index.ts.
 */
export interface AdvisorDeps {
	buildInventory: () => PathInventory;
	getMetadata: () => ConversionMetadata[];
	readConfig: () => Record<string, unknown>;
	writeConfig: (config: Record<string, unknown>) => void;
	now?: () => Date;
	/** Optional QuestDB history fetch. Absent or undefined skips QuestDB. */
	fetchHistoric?: (url: string, lookbackDays: number) => Promise<HistoricPaths>;
	/** Optional QuestDB reachability probe for the connectivity endpoint. */
	probeQuestDB?: (url: string) => Promise<boolean>;
	/** Optional OpenRouter rationale enrichment. Absent skips OpenRouter. */
	enrichReasons?: (
		openRouter: { apiKey: string; model: string },
		recs: Recommendation[],
	) => Promise<{ reasons: Map<string, string>; note?: string }>;
	/** Optional OpenRouter key validation for the test-key endpoint. */
	testKeyFn?: (openRouter: {
		apiKey: string;
		model: string;
	}) => Promise<boolean>;
	/** Optional OpenRouter model-list fetch for the panel's autocomplete. */
	listModelsFn?: () => Promise<string[]>;
}

type ConversionMap = Record<string, ConversionConfig>;

// Runtime fallback for advisor.questdb.lookbackDays when the configured value
// is missing or not a positive number: fetchHistoricPaths builds a SQL
// `dateadd` expression and a zero/negative/NaN value produces a broken QuestDB
// query. Keep this in sync with the schema default (config/schema.ts) and its
// enum default (config/enums.ts); it is a separate copy because this guards
// unvalidated config and cannot import the validated schema default.
const DEFAULT_LOOKBACK_DAYS = 7;

/**
 * True when a decision is a well-formed approval for a known conversion. The
 * apply endpoint already shape-checks its request body and fails closed with
 * a 403 when admin gating is unavailable, so this re-validation is deliberate
 * defense in depth for any future caller of the public applyReview API: each
 * element must be a plain object with `approved === true` and an optionKey
 * string naming a loaded conversion. Malformed or unknown-key entries are
 * dropped so they neither throw nor inject a junk key into the saved config.
 */
function isApplicableDecision(
	d: unknown,
	knownKeys: ReadonlySet<string>,
): d is ApplyDecision {
	if (!isPlainObject(d)) return false;
	return (
		d.approved === true &&
		typeof d.optionKey === "string" &&
		knownKeys.has(d.optionKey)
	);
}

export class Advisor {
	private lastPending: Recommendation[] = [];

	constructor(private readonly deps: AdvisorDeps) {}

	/** Build an inventory, recommend, auto-apply enables, return the result. */
	async runReview(): Promise<ReviewResult> {
		const now = (this.deps.now ?? (() => new Date()))();
		const config = this.deps.readConfig();
		const conversions = this.conversionsOf(config);

		const notes: string[] = [];
		let inventory = this.deps.buildInventory();

		const questdb = this.questdbConfig(config);
		if (questdb?.enabled && this.deps.fetchHistoric) {
			try {
				const historic = await this.deps.fetchHistoric(
					questdb.url,
					questdb.lookbackDays,
				);
				inventory = mergeHistoric(inventory, historic);
			} catch (err) {
				const detail = errMessage(err);
				notes.push(
					`QuestDB history unavailable (${detail}); reviewed live data only.`,
				);
			}
		}

		const recs = recommend({
			inventory,
			metadata: this.deps.getMetadata(),
			currentConfig: conversions,
		});

		const enables = recs.filter((r) => r.action === "enable");
		const disables = recs.filter((r) => r.action === "disable");
		// "keep" recommendations are never surfaced (getPending and ReviewResult
		// carry only enables and disables), and on a typical boat keeps are the
		// majority. Enrich only the actionable subset so OpenRouter is not billed
		// for rationales that are then discarded.
		const actionable = [...enables, ...disables];

		const openRouter = this.openRouterConfig(config);
		if (openRouter && this.deps.enrichReasons) {
			try {
				const { reasons, note } = await this.deps.enrichReasons(
					openRouter,
					actionable,
				);
				for (const r of actionable) {
					const enriched = reasons.get(r.optionKey);
					if (enriched) r.reason = enriched;
				}
				if (note) notes.push(note);
			} catch (err) {
				const detail = errMessage(err);
				notes.push(
					`OpenRouter enrichment unavailable (${detail}); using built-in explanations.`,
				);
			}
		}

		const autoApply = this.autoApplyFlag(config);
		const autoApplied = autoApply ? enables : [];
		const pending = autoApply ? disables : actionable;
		this.lastPending = pending;

		if (autoApplied.length > 0) {
			const next = { ...conversions };
			for (const r of autoApplied) {
				next[r.optionKey] = {
					...this.entryOf(next, r.optionKey),
					enabled: true,
				};
			}
			this.deps.writeConfig({ ...config, conversions: next });
		}

		return { ranAt: now.toISOString(), autoApplied, pending, notes };
	}

	/** The pending list from the most recent runReview. */
	getPending(): Recommendation[] {
		return this.lastPending;
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

	/** Validate the configured OpenRouter key. */
	async testKey(): Promise<{ ok: boolean }> {
		const openRouter = this.openRouterConfig(this.deps.readConfig());
		if (!openRouter || !this.deps.testKeyFn) return { ok: false };
		try {
			return { ok: await this.deps.testKeyFn(openRouter) };
		} catch {
			return { ok: false };
		}
	}

	/** The OpenRouter model ids for the panel's autocomplete; empty on error. */
	async listModels(): Promise<{ models: string[] }> {
		if (!this.deps.listModelsFn) return { models: [] };
		try {
			return { models: await this.deps.listModelsFn() };
		} catch {
			return { models: [] };
		}
	}

	/**
	 * Apply approved decisions; rejected decisions are left untouched.
	 *
	 * Each decision carries the recommended `action` it approves, so an enable
	 * sets `enabled: true` and a disable sets `enabled: false`. Carrying the
	 * action in the decision (rather than reading an in-memory `lastPending`)
	 * keeps applyReview correct even if the plugin restarts between review and
	 * apply. An absent action is treated as "disable" for backward
	 * compatibility with the autoApply-on flow, whose pending list is disables.
	 */
	async applyReview(decisions: ApplyDecision[]): Promise<void> {
		// Trust nothing about the inbound decisions: keep only well-formed
		// approvals whose optionKey names a loaded conversion. This tolerates
		// malformed elements (null, missing optionKey) without throwing and
		// stops an arbitrary key from being written to the saved config.
		const knownKeys = new Set(this.deps.getMetadata().map((m) => m.key));
		const approved = decisions.filter((d) =>
			isApplicableDecision(d, knownKeys),
		);
		if (approved.length === 0) return;
		const config = this.deps.readConfig();
		const conversions = { ...this.conversionsOf(config) };
		for (const d of approved) {
			conversions[d.optionKey] = {
				...this.entryOf(conversions, d.optionKey),
				enabled: d.action === "enable",
			};
		}
		this.deps.writeConfig({ ...config, conversions });

		// Drop applied items from lastPending so getPending (and the panel's
		// /pending fetch) stop reporting already-applied recommendations. The
		// Advisor instance outlives PluginManager restarts, so the implicit
		// restart from writeConfig does not clear this on its own.
		const appliedKeys = new Set(approved.map((d) => d.optionKey));
		this.lastPending = this.lastPending.filter(
			(r) => !appliedKeys.has(r.optionKey),
		);
	}

	private conversionsOf(config: Record<string, unknown>): ConversionMap {
		const c = config.conversions;
		return c && typeof c === "object" ? (c as ConversionMap) : {};
	}

	/** The `advisor` config block as an object, or null when absent. */
	private advisorSection(
		config: Record<string, unknown>,
	): Record<string, unknown> | null {
		const advisor = config.advisor;
		return advisor && typeof advisor === "object"
			? (advisor as Record<string, unknown>)
			: null;
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
		if (!q || typeof q !== "object") return null;
		const { enabled, url, lookbackDays } = q as Record<string, unknown>;
		if (typeof url !== "string") return null;
		const days =
			isValidNumber(lookbackDays) && lookbackDays > 0
				? lookbackDays
				: DEFAULT_LOOKBACK_DAYS;
		return { enabled: enabled === true, url, lookbackDays: days };
	}

	private openRouterConfig(
		config: Record<string, unknown>,
	): { apiKey: string; model: string } | null {
		const o = this.advisorSection(config)?.openRouter;
		if (!o || typeof o !== "object") return null;
		const { enabled, apiKey, model } = o as Record<string, unknown>;
		if (enabled !== true) return null;
		if (typeof apiKey !== "string" || apiKey.trim() === "") return null;
		return { apiKey, model: typeof model === "string" ? model : "" };
	}

	private entryOf(map: ConversionMap, key: string): ConversionConfig {
		return map[key] ?? emptyConversionConfig();
	}
}
