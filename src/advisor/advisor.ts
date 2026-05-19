import type { ConversionMetadata } from "../api/types.js";
import type { ConversionConfig } from "../config/schema.js";
import { isValidNumber } from "../utils/validation.js";
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

// Matches the schema default for advisor.questdb.lookbackDays. Used when the
// configured value is missing or not a positive number: fetchHistoricPaths
// builds a SQL `dateadd` expression and a zero/negative/NaN value produces a
// broken QuestDB query.
const DEFAULT_LOOKBACK_DAYS = 7;

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
				const detail = err instanceof Error ? err.message : String(err);
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

		const openRouter = this.openRouterConfig(config);
		if (openRouter && this.deps.enrichReasons) {
			try {
				const { reasons, note } = await this.deps.enrichReasons(
					openRouter,
					recs,
				);
				for (const r of recs) {
					const enriched = reasons.get(r.optionKey);
					if (enriched) r.reason = enriched;
				}
				if (note) notes.push(note);
			} catch (err) {
				const detail = err instanceof Error ? err.message : String(err);
				notes.push(
					`OpenRouter enrichment unavailable (${detail}); using built-in explanations.`,
				);
			}
		}

		const autoApply = this.autoApplyFlag(config);
		const enables = recs.filter((r) => r.action === "enable");
		const disables = recs.filter((r) => r.action === "disable");
		const autoApplied = autoApply ? enables : [];
		const pending = autoApply ? disables : [...enables, ...disables];
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
		const approved = decisions.filter((d) => d.approved);
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
		return map[key] ?? { enabled: false, resend: 0, sources: {}, extras: {} };
	}
}
