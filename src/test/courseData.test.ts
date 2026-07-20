import { describe, expect, it, vi } from "vitest";
import {
	courseCalculation,
	coursePathValue,
	resetCourseValueCache,
} from "../conversions/courseData.js";
import type { SignalKApp } from "../types/index.js";

const delta = (path: string, value: unknown) => ({
	context: "vessels.self",
	updates: [{ values: [{ path, value }] }],
});

describe("Course Provider delta cache", () => {
	it("replaces stale leaf values when a newer root object arrives", () => {
		const app = { getSelfPath: () => undefined } as unknown as SignalKApp;

		expect(
			courseCalculation(app, "distance", delta("navigation.course.calcValues.distance", 10)),
		).toBe(10);
		expect(
			courseCalculation(app, "distance", delta("navigation.course.calcValues", { distance: 20 })),
		).toBe(20);
		expect(
			courseCalculation(
				app,
				"distance",
				delta("notifications.navigation.course.arrivalCircleEntered", { state: "normal" }),
			),
		).toBe(20);
	});

	it("does not mix sibling calculations across partial generations", () => {
		const app = { getSelfPath: () => undefined } as unknown as SignalKApp;
		courseCalculation(
			app,
			"distance",
			delta("navigation.course.calcValues", { distance: 10, bearingTrue: 1.5 }),
		);
		const nextGeneration = delta("navigation.course.calcValues.distance", 20);

		expect(courseCalculation(app, "distance", nextGeneration)).toBe(20);
		expect(courseCalculation(app, "bearingTrue", nextGeneration)).toBeUndefined();
	});

	it("unwraps leaf values from an aggregate getSelfPath result", () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-07-19T12:00:00Z"));
			const app = {
				getSelfPath: (path: string) =>
					path === "navigation.course.calcValues"
						? { distance: { value: 42, timestamp: "2026-07-19T12:00:00Z" } }
						: undefined,
			} as unknown as SignalKApp;

			expect(courseCalculation(app, "distance")).toBe(42);
			vi.advanceTimersByTime(10_001);
			expect(courseCalculation(app, "distance")).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it("clears cached calculations between plugin starts", () => {
		const app = { getSelfPath: () => undefined } as unknown as SignalKApp;
		expect(
			courseCalculation(app, "distance", delta("navigation.course.calcValues.distance", 10)),
		).toBe(10);

		resetCourseValueCache(app);

		expect(
			courseCalculation(
				app,
				"distance",
				delta("notifications.navigation.course.arrivalCircleEntered", { state: "normal" }),
			),
		).toBeUndefined();
	});

	it("expires cached calculations before a later notification", () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-07-19T12:00:00Z"));
			const app = {
				getSelfPath: (path: string) =>
					path === "navigation.course.calcValues" ? { distance: 999 } : undefined,
			} as unknown as SignalKApp;
			expect(
				courseCalculation(app, "distance", delta("navigation.course.calcValues.distance", 10)),
			).toBe(10);

			vi.advanceTimersByTime(10_001);

			expect(
				courseCalculation(
					app,
					"distance",
					delta("notifications.navigation.course.arrivalCircleEntered", { state: "normal" }),
				),
			).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it("expires cached navigation notifications", () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-07-19T12:00:00Z"));
			const app = { getSelfPath: () => undefined } as unknown as SignalKApp;
			const path = "notifications.navigation.course.arrivalCircleEntered";
			expect(coursePathValue(app, path, delta(path, { state: "alarm" }))).toEqual({
				state: "alarm",
			});

			vi.advanceTimersByTime(60_001);

			expect(
				coursePathValue(app, path, delta("navigation.course.calcValues.distance", 20)),
			).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});
});
