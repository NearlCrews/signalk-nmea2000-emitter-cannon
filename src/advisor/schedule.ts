import { clamp, isValidNumber } from "../utils/validation.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// setInterval's delay is a signed 32-bit int of milliseconds (~24.8 days).
// A larger value overflows and fires almost immediately, so the interval is
// capped here. A review every 24 days is well beyond any practical need.
const MAX_INTERVAL_DAYS = 24;
// Fallback when the configured interval is not a finite number (NaN, etc.).
// Math.trunc(NaN) is NaN and would slip through min/max, so NaN * DAY_MS
// becomes NaN and setInterval(fn, NaN) fires in a tight loop.
const DEFAULT_INTERVAL_DAYS = 1;

/**
 * Drives the advisor's optional periodic review. A single setInterval is
 * (re)armed by `configure` and cleared by `stop`. A failing review never stops
 * the schedule; the rejection is routed to the optional `onError` callback so a
 * persistently failing periodic run stays observable instead of silent.
 */
export class AdvisorScheduler {
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly run: () => Promise<unknown>,
		private readonly onError?: (err: unknown) => void,
	) {}

	/**
	 * Arm or disarm the periodic review. Always clears any existing timer
	 * first, so it is safe to call on every plugin start with fresh config.
	 */
	configure(periodic: boolean, intervalDays: number): void {
		this.stop();
		if (!periodic) return;
		const days = isValidNumber(intervalDays)
			? clamp(Math.trunc(intervalDays), 1, MAX_INTERVAL_DAYS)
			: DEFAULT_INTERVAL_DAYS;
		this.timer = setInterval(() => {
			void this.run().catch((err) => {
				// A failing review must not stop the schedule. runReview surfaces
				// QuestDB sub-failures through ReviewResult notes, but a
				// throw from buildInventory, getMetadata, or writeConfig on a
				// periodic (non-user-triggered) run would otherwise be invisible.
				this.onError?.(err);
			});
		}, days * DAY_MS);
	}

	/** Clear the periodic review timer, if any. */
	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
