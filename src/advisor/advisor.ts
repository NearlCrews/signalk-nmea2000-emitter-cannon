import type { ConversionMetadata } from "../api/types.js";
import type { ConversionConfig } from "../config/schema.js";
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
}

type ConversionMap = Record<string, ConversionConfig>;

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

		const autoApplied = recs.filter((r) => r.action === "enable");
		const pending = recs.filter((r) => r.action === "disable");
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

	/**
	 * Apply approved decisions; rejected decisions are left untouched.
	 *
	 * Phase 1 pending recommendations are always disables: runReview routes
	 * every `enable` into autoApplied and only `disable` into pending. So an
	 * approved decision means "disable this conversion". Deriving the action
	 * here rather than from an in-memory `lastPending` keeps applyReview
	 * correct even if the plugin restarts between review and apply.
	 */
	async applyReview(decisions: ApplyDecision[]): Promise<void> {
		const approved = decisions.filter((d) => d.approved);
		if (approved.length === 0) return;
		const config = this.deps.readConfig();
		const conversions = { ...this.conversionsOf(config) };
		for (const d of approved) {
			conversions[d.optionKey] = {
				...this.entryOf(conversions, d.optionKey),
				enabled: false,
			};
		}
		this.deps.writeConfig({ ...config, conversions });
	}

	private conversionsOf(config: Record<string, unknown>): ConversionMap {
		const c = config.conversions;
		return c && typeof c === "object" ? (c as ConversionMap) : {};
	}

	private questdbConfig(
		config: Record<string, unknown>,
	): { enabled: boolean; url: string; lookbackDays: number } | null {
		const advisor = config.advisor;
		if (!advisor || typeof advisor !== "object") return null;
		const q = (advisor as { questdb?: unknown }).questdb;
		if (!q || typeof q !== "object") return null;
		const { enabled, url, lookbackDays } = q as Record<string, unknown>;
		if (typeof url !== "string" || typeof lookbackDays !== "number") {
			return null;
		}
		return { enabled: enabled === true, url, lookbackDays };
	}

	private entryOf(map: ConversionMap, key: string): ConversionConfig {
		return map[key] ?? { enabled: false, resend: 0, sources: {}, extras: {} };
	}
}
