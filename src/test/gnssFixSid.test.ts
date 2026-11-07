import { afterEach, describe, expect, it, vi } from "vitest";
import createCogSogConversion from "../conversions/cogSOG.js";
import createGnssDataConversions from "../conversions/gnssData.js";
import createGpsConversion from "../conversions/gps.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import {
	GnssFixSid,
	gnssFixSidFor,
	N2K_SID_MAX,
	N2K_SID_NOT_AVAILABLE,
	resetGnssFixSid,
} from "../utils/gnssFixSid.js";

function sidOf(messages: N2KMessage[], pgn: number): unknown {
	return messages.find((m) => m.pgn === pgn)?.fields.sid;
}

function call(conversion: ConversionModule, ...values: unknown[]): N2KMessage[] {
	if (!conversion.callback) throw new Error(`Missing callback for ${conversion.optionKey}`);
	return conversion.callback(...values) as N2KMessage[];
}

function mockApp(): SignalKApp {
	return { getSelfPath: () => undefined } as unknown as SignalKApp;
}

afterEach(() => {
	vi.useRealTimers();
});

describe("GnssFixSid", () => {
	it("reports not available before the first fix", () => {
		expect(new GnssFixSid().current(0)).toBe(N2K_SID_NOT_AVAILABLE);
	});

	it("advances on every new position and keeps one SID for a repeated one", () => {
		const seq = new GnssFixSid();
		expect(seq.advance(45.5, 9.1, 0)).toBe(0);
		// RMC and GGA of the same fix repeat the same coordinates.
		expect(seq.advance(45.5, 9.1, 200)).toBe(0);
		expect(seq.advance(45.50001, 9.1, 1000)).toBe(1);
		expect(seq.current(1100)).toBe(1);
	});

	it("advances for a stationary boat once the merge window has passed", () => {
		const seq = new GnssFixSid();
		expect(seq.advance(45.5, 9.1, 0)).toBe(0);
		expect(seq.advance(45.5, 9.1, 1000)).toBe(1);
		expect(seq.advance(45.5, 9.1, 2000)).toBe(2);
	});

	it("wraps after 252 and never emits a reserved value", () => {
		const seq = new GnssFixSid();
		let sid = -1;
		for (let i = 0; i <= N2K_SID_MAX; i++) sid = seq.advance(i, 0, i * 1000);
		expect(sid).toBe(N2K_SID_MAX);
		expect(seq.advance(-1, 0, 1_000_000)).toBe(0);
	});

	it("reports not available once the fix goes stale", () => {
		const seq = new GnssFixSid();
		seq.advance(45.5, 9.1, 0);
		expect(seq.current(3000)).toBe(0);
		expect(seq.current(3001)).toBe(N2K_SID_NOT_AVAILABLE);
	});

	it("shares one sequencer per app until reset", () => {
		const app = mockApp();
		const first = gnssFixSidFor(app);
		expect(gnssFixSidFor(app)).toBe(first);
		resetGnssFixSid(app);
		expect(gnssFixSidFor(app)).not.toBe(first);
	});
});

describe("GNSS PGNs share the fix SID", () => {
	it("tags 129029, 129026, and 129539 from one fix with one SID and moves on with the next", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
		const app = mockApp();
		const gps = createGpsConversion(app) as ConversionModule;
		const cogSog = createCogSogConversion(app) as ConversionModule;
		const dops = createGnssDataConversions(app).find((c) => c.optionKey === "GNSS_DOPS");
		if (!dops) throw new Error("Missing GNSS_DOPS");

		const fix1 = call(gps, { latitude: 45.5085, longitude: 9.1 });
		expect(sidOf(fix1, 129029)).toBe(0);
		expect(sidOf(call(cogSog, 1.2, 3), 129026)).toBe(0);
		expect(sidOf(call(dops, 0.92, 1.5), 129539)).toBe(0);

		vi.advanceTimersByTime(1100);
		const fix2 = call(gps, { latitude: 45.50851, longitude: 9.1 });
		expect(sidOf(fix2, 129029)).toBe(1);
		expect(sidOf(call(cogSog, 1.2, 3), 129026)).toBe(1);
		expect(sidOf(call(dops, 0.92, 1.5), 129539)).toBe(1);
	});

	it("advances on positions that the 129029 rate limit skips", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
		const app = mockApp();
		const gps = createGpsConversion(app) as ConversionModule;
		const cogSog = createCogSogConversion(app) as ConversionModule;

		call(gps, { latitude: 45.5, longitude: 9.1 });
		vi.advanceTimersByTime(200);
		const fast = call(gps, { latitude: 45.50001, longitude: 9.1 });
		expect(fast.map((m) => m.pgn)).toEqual([129025]);
		expect(sidOf(call(cogSog, 1.2, 3), 129026)).toBe(1);
	});

	it("sends COG and SOG as not available when no fix is current", () => {
		const cogSog = createCogSogConversion(mockApp()) as ConversionModule;
		expect(sidOf(call(cogSog, 1.2, 3), 129026)).toBe(N2K_SID_NOT_AVAILABLE);
	});
});
