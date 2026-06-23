import { describe, expect, it } from "vitest";
import { rowStatus } from "../panel/rowStatus.js";

const base = { key: "K", title: "Test", emitCount: 0, enabled: false } as const;

describe("rowStatus", () => {
	it("is emitting with a count and age when emitCount > 0 and no error", () => {
		const r = rowStatus(
			{ ...base, enabled: true, emitCount: 5, lastEmitMs: 1000 },
			true,
		);
		expect(r.rail).toBe("emitting");
		expect(r.recency).toMatch(/^5 emits, last /);
	});

	it("is silent with 'no recent output' when enabled but never emitted", () => {
		const r = rowStatus({ ...base, enabled: true, emitCount: 0 }, true);
		expect(r.rail).toBe("silent");
		expect(r.recency).toBe("no recent output");
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

	it("is silent with text when enabled and no status object exists yet", () => {
		const r = rowStatus(undefined, true);
		expect(r.rail).toBe("silent");
		expect(r.recency).toBe("no recent output");
	});

	it("is disabled with null recency when not enabled and not emitting", () => {
		expect(rowStatus(undefined, false)).toEqual({
			rail: "disabled",
			recency: null,
		});
		expect(rowStatus({ ...base, enabled: false, emitCount: 0 }, false)).toEqual(
			{
				rail: "disabled",
				recency: null,
			},
		);
	});
});
