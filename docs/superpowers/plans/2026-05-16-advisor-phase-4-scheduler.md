# Advisor Phase 4: Periodic Scheduler Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Write the failing test, run it, implement, run, commit.

**Goal:** When "Review on a schedule" is enabled, the advisor re-runs `runReview()` automatically every `schedule.intervalDays` days.

**Architecture:** A small `AdvisorScheduler` wraps a single `setInterval`. The plugin (re)configures it from the `advisor.schedule` config on every `startPlugin` and clears it on `stopPlugin`, so a config change (which restarts the plugin) re-arms the timer with the new interval. A scheduled run's errors are swallowed so a failing review never kills the timer. No new UI (the schedule controls already exist from the Phase 1.5 settings panel) and no new dependencies.

**Tech Stack:** TypeScript 6 (strict, ESM), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-16-openrouter-config-advisor-design.md`, section 4.6. This plan is Phase 4 of 4, the last.

---

## File Structure

- Create: `src/advisor/schedule.ts` - the `AdvisorScheduler` class.
- Create: `src/test/schedule.test.ts` - scheduler tests (Vitest fake timers).
- Modify: `src/index.ts` - construct the scheduler, configure it in `startPlugin`, stop it in `stopPlugin`.

---

## Task 1: AdvisorScheduler

**Files:**
- Create: `src/advisor/schedule.ts`
- Test: `src/test/schedule.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/schedule.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdvisorScheduler } from "../advisor/schedule.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("AdvisorScheduler", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs the callback once per interval when periodic", async () => {
		vi.useFakeTimers();
		let runs = 0;
		const s = new AdvisorScheduler(async () => {
			runs += 1;
		});
		s.configure(true, 1);
		await vi.advanceTimersByTimeAsync(DAY_MS);
		expect(runs).toBe(1);
		s.stop();
	});

	it("does not arm a timer when periodic is false", async () => {
		vi.useFakeTimers();
		let runs = 0;
		const s = new AdvisorScheduler(async () => {
			runs += 1;
		});
		s.configure(false, 1);
		await vi.advanceTimersByTimeAsync(2 * DAY_MS);
		expect(runs).toBe(0);
	});

	it("reconfiguring clears the previous timer", async () => {
		vi.useFakeTimers();
		let runs = 0;
		const s = new AdvisorScheduler(async () => {
			runs += 1;
		});
		s.configure(true, 1);
		s.configure(false, 1);
		await vi.advanceTimersByTimeAsync(DAY_MS);
		expect(runs).toBe(0);
	});

	it("keeps running when a scheduled review throws", async () => {
		vi.useFakeTimers();
		let runs = 0;
		const s = new AdvisorScheduler(async () => {
			runs += 1;
			throw new Error("review failed");
		});
		s.configure(true, 1);
		await vi.advanceTimersByTimeAsync(DAY_MS);
		await vi.advanceTimersByTimeAsync(DAY_MS);
		expect(runs).toBe(2);
		s.stop();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/schedule.test.ts`
Expected: FAIL (cannot find module `../advisor/schedule.js`).

- [ ] **Step 3: Implement the scheduler**

```typescript
// src/advisor/schedule.ts

const DAY_MS = 24 * 60 * 60 * 1000;
// setInterval's delay is a signed 32-bit int of milliseconds (~24.8 days).
// A larger value overflows and fires almost immediately, so the interval is
// capped here. A review every 24 days is well beyond any practical need.
const MAX_INTERVAL_DAYS = 24;

/**
 * Drives the advisor's optional periodic review. A single setInterval is
 * (re)armed by `configure` and cleared by `stop`. Callback errors are
 * swallowed so one failing review does not stop the schedule.
 */
export class AdvisorScheduler {
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(private readonly run: () => Promise<unknown>) {}

	/**
	 * Arm or disarm the periodic review. Always clears any existing timer
	 * first, so it is safe to call on every plugin start with fresh config.
	 */
	configure(periodic: boolean, intervalDays: number): void {
		this.stop();
		if (!periodic) return;
		const days = Math.min(
			Math.max(1, Math.trunc(intervalDays)),
			MAX_INTERVAL_DAYS,
		);
		this.timer = setInterval(() => {
			void this.run().catch(() => {
				// A failing review must not stop the schedule; runReview
				// surfaces its own problems through the ReviewResult notes.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/schedule.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/advisor/schedule.ts src/test/schedule.test.ts
git commit -m "feat(advisor): add the periodic review scheduler"
```

---

## Task 2: Wire the scheduler into the plugin

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the import**

In `src/index.ts`, add beside the other advisor imports:

```typescript
import { AdvisorScheduler } from "./advisor/schedule.js";
```

- [ ] **Step 2: Construct the scheduler**

Immediately after the `const advisor = new Advisor({ ... });` block, add:

```typescript
	// Drives the optional periodic review. Reconfigured on every startPlugin
	// from the advisor.schedule config, cleared on stopPlugin.
	const advisorScheduler = new AdvisorScheduler(() => advisor.runReview());
```

- [ ] **Step 3: Configure it in `startPlugin`**

In `startPlugin`, after the existing `pluginManager.start(options);` line inside the `try` block, add:

```typescript
			const schedule = (
				options as {
					advisor?: { schedule?: { periodic?: unknown; intervalDays?: unknown } };
				}
			).advisor?.schedule;
			advisorScheduler.configure(
				schedule?.periodic === true,
				typeof schedule?.intervalDays === "number" ? schedule.intervalDays : 7,
			);
```

- [ ] **Step 4: Stop it in `stopPlugin`**

In `stopPlugin`, add `advisorScheduler.stop();` as the first statement of the function body, before the `if (pluginManager)` check, so the timer is cleared even if `pluginManager` is already null.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass; both builds succeed.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat(advisor): wire the periodic scheduler into the plugin lifecycle"
```

---

## Task 3: Final verification

- [ ] **Step 1: Full suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass; both builds succeed.

- [ ] **Step 2: Manual smoke check**

Rebuild and restart signalk. In the panel, enable "Review on a schedule" with
a 1-day interval and save. Confirm the plugin restarts cleanly. (A full
interval is impractical to wait out manually; the unit tests cover the timer
firing. Confirm via the server log that no scheduler error appears on start.)

---

## Self-Review

- **Spec coverage:** the periodic scheduler (spec section 4.6). The interval and the on/off toggle come from the Phase 1.5 settings panel; this plan adds only the engine.
- **Lifecycle correctness:** the scheduler is constructed once at `createPlugin` scope so it survives PluginManager restarts; `configure` clears before re-arming, so repeated `startPlugin` calls never leak timers; `stopPlugin` always clears it.
- **No loop:** a scheduled review auto-applies enables, which writes config and restarts the plugin; the restart re-arms the timer but does not itself trigger a review (review-on-start is not a configured trigger), so there is no restart loop.
- **Resilience:** a throwing review is caught inside the interval callback, so the schedule survives a failing review.
- **Placeholder scan:** none; every step has complete code.
- **Type consistency:** `AdvisorScheduler` constructed with `() => advisor.runReview()`, matching its `() => Promise<unknown>` constructor parameter.
