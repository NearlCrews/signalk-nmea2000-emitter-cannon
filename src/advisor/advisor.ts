import type { ConversionMetadata } from "../api/types.js";
import type { ConversionConfig } from "../config/schema.js";
import { recommend } from "./recommender.js";
import type {
	ApplyDecision,
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

		const recs = recommend({
			inventory: this.deps.buildInventory(),
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

		return { ranAt: now.toISOString(), autoApplied, pending, notes: [] };
	}

	/** The pending list from the most recent runReview. */
	getPending(): Recommendation[] {
		return this.lastPending;
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

	private entryOf(map: ConversionMap, key: string): ConversionConfig {
		return map[key] ?? { enabled: false, resend: 0, sources: {}, extras: {} };
	}
}
