import { describe, expect, it } from "vitest";
import { rowStatus } from "../panel/rowStatus.js";

const base = { key: "K", title: "Test", emitCount: 0, enabled: false } as const;

describe("rowStatus", () => {
	it("is emitting with a count and age when emitCount > 0 and no error", () => {
		const r = rowStatus({ ...base, enabled: true, emitCount: 5, lastEmitMs: 1000 }, true);
		expect(r.rail).toBe("emitting");
		expect(r.recency).toMatch(/^5 emits, last /);
	});

	it("is silent while waiting for Signal K input", () => {
		const r = rowStatus({ ...base, enabled: true, emitCount: 0 }, true);
		expect(r.rail).toBe("silent");
		expect(r.recency).toBe("waiting for signal k input");
	});

	it("is error (rail) when a lastErrorMessage is present, keeping the emit recency", () => {
		const r = rowStatus(
			{
				...base,
				enabled: true,
				emitCount: 3,
				lastEmitMs: 0,
				lastErrorMessage: "boom",
			},
			true,
		);
		expect(r.rail).toBe("error");
		expect(r.recency).toMatch(/^3 emits, last /);
	});

	it("is error while retaining the input wait detail", () => {
		const r = rowStatus({ ...base, enabled: true, emitCount: 0, lastErrorMessage: "boom" }, true);
		expect(r.rail).toBe("error");
		expect(r.recency).toBe("waiting for signal k input");
	});

	it("is silent with text when enabled and no status object exists yet", () => {
		const r = rowStatus(undefined, true);
		expect(r.rail).toBe("silent");
		expect(r.recency).toBe("waiting for signal k input");
	});

	it("distinguishes filtered, echo-blocked, and non-encodable inputs", () => {
		expect(
			rowStatus(
				{ ...base, enabled: true, lastDropReason: "publisher-filter", lastDropAgeMs: 10 },
				true,
			).recency,
		).toBe("publisher filter does not match");
		expect(
			rowStatus(
				{ ...base, enabled: true, lastDropReason: "nmea2000-echo", lastDropAgeMs: 10 },
				true,
			).recency,
		).toBe("nmea 2000 echo blocked");
		expect(
			rowStatus({ ...base, enabled: true, inputCount: 2, lastInputMs: 10 }, true).recency,
		).toBe("input received; no encodable output");
	});

	it("warns about stale input even while cached output is still emitting", () => {
		const r = rowStatus(
			{
				...base,
				enabled: true,
				emitCount: 8,
				lastEmitMs: 10,
				staleInputPaths: ["electrical.batteries.start.voltage"],
				activityStale: true,
			},
			true,
		);
		expect(r.rail).toBe("silent");
		expect(r.recency).toBe("previously active input is stale");
	});

	it("warns when a scheduled conversion is overdue", () => {
		const r = rowStatus(
			{ ...base, enabled: true, emitCount: 2, lastEmitMs: 1000, activityStale: true },
			true,
		);
		expect(r.rail).toBe("silent");
		expect(r.recency).toBe("expected activity overdue");
	});

	it("is disabled with null recency when not enabled and not emitting", () => {
		expect(rowStatus(undefined, false)).toEqual({
			rail: "disabled",
			recency: null,
		});
		expect(rowStatus({ ...base, enabled: false, emitCount: 0 }, false)).toEqual({
			rail: "disabled",
			recency: null,
		});
	});
});
