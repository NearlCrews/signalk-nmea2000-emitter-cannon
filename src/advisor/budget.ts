/**
 * In-memory per-UTC-day call cap that bounds OpenRouter spend. The count is
 * not persisted: a plugin restart resets it. That is acceptable here because
 * reviews are user-triggered or on a multi-day timer, so the worst case after
 * a restart is one extra day's allowance, not a runaway loop.
 */
export class BudgetTracker {
	private day: string;
	private count = 0;

	constructor(
		private readonly maxPerDay: number,
		private readonly now: () => Date = () => new Date(),
	) {
		this.day = this.utcDay();
	}

	private utcDay(): string {
		return this.now().toISOString().slice(0, 10);
	}

	private rollover(): void {
		const today = this.utcDay();
		if (today !== this.day) {
			this.day = today;
			this.count = 0;
		}
	}

	/** True when another call is within the day's cap. */
	canSpend(): boolean {
		this.rollover();
		return this.count < this.maxPerDay;
	}

	/** Record one call against the day's cap. */
	recordCall(): void {
		this.rollover();
		this.count += 1;
	}

	/** Calls recorded so far in the current UTC day. */
	callsToday(): number {
		this.rollover();
		return this.count;
	}
}
