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
