/**
 * In-memory per-UTC-day call counter that bounds OpenRouter spend. The count
 * is not persisted: a plugin restart resets it. That is acceptable here
 * because reviews are user-triggered or on a multi-day timer, so the worst
 * case after a restart is one extra day's allowance, not a runaway loop. The
 * configured cap is dynamic, so it is compared against `callsToday()` at the
 * call site rather than held here.
 */
export class BudgetTracker {
	private day: string;
	private count = 0;

	constructor(private readonly now: () => Date = () => new Date()) {
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

	/** Record one call against the day's count. */
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
