import { describe, expect, it, vi } from "vitest";
import { RootConfig } from "../config/schema.js";
import { PluginManager } from "../plugin-manager.js";
import type { SignalKApp, SignalKPlugin } from "../types/index.js";

function makeMockApp(): SignalKApp {
	interface MockStream {
		value: null;
		map: () => MockStream;
		filter: () => MockStream;
		onValue: () => () => void;
	}
	const mockStream: MockStream = {
		value: null,
		map: () => mockStream,
		filter: () => mockStream,
		onValue: () => () => {},
	};
	return {
		selfId: "urn:mrn:imo:mmsi:111222333",
		debug: () => {},
		error: () => {},
		emit: () => {},
		setPluginStatus: () => {},
		setPluginError: () => {},
		getSelfPath: () => undefined,
		getPath: () => undefined,
		streambundle: {
			getSelfBus: () => mockStream,
		},
		subscriptionmanager: {
			subscribe: () => {},
		},
		on: () => undefined,
		removeListener: () => undefined,
	} as unknown as SignalKApp;
}

const mockPlugin: SignalKPlugin = {
	id: "signalk-nmea2000-emitter-cannon",
	name: "Test Plugin",
	description: "Test plugin",
	schema: () => RootConfig,
	start: () => {},
	stop: () => {},
};

describe("PluginManager.getStatusSnapshot", () => {
	it("returns the canonical shape even before start()", () => {
		const app = makeMockApp();
		const pm = new PluginManager(app, mockPlugin);
		const snap = pm.getStatusSnapshot();
		expect(snap).toHaveProperty("nmea2000Ready", false);
		expect(snap).toHaveProperty("enabledCount", 0);
		expect(snap).toHaveProperty("totalConversions");
		expect(snap.totalConversions).toBeGreaterThan(0);
		// Before start(), every conversion is reported as not enabled.
		expect(snap.perConversion.length).toBe(snap.totalConversions);
		expect(snap.perConversion.every((c) => c.enabled === false)).toBe(true);
		expect(snap.perConversion.every((c) => c.emitCount === 0)).toBe(true);
	});

	it("aggregates sub-conversion emit counters under the parent optionKey", () => {
		const app = makeMockApp();
		const pm = new PluginManager(app, mockPlugin);
		// Simulate emits from two sub-conversions of the BATTERY module
		// (factory creates one sub-conversion per battery instance). The
		// processToN2K path calls recordEmit() with the indexed sub-key.
		const recordEmit = (
			pm as unknown as { recordEmit: (k: string) => void }
		).recordEmit.bind(pm);
		recordEmit("BATTERY[0]");
		recordEmit("BATTERY[1]");
		recordEmit("BATTERY[0]");
		const snap = pm.getStatusSnapshot();
		const battery = snap.perConversion.find((c) => c.key === "BATTERY");
		expect(battery).toBeDefined();
		expect(battery?.emitCount).toBe(3);
		expect(battery?.lastEmitMs).toBeDefined();
	});

	it("surfaces error buckets from non-stream sources (e.g. delta)", () => {
		const app = makeMockApp();
		const pm = new PluginManager(app, mockPlugin);
		// NOTIFICATIONS is an ON_DELTA conversion, so its error bucket key is
		// `callback:NOTIFICATIONS:delta`. The snapshot's parent index must
		// surface this regardless of the `:delta` source suffix.
		const throttledError = (
			pm as unknown as { throttledError: (k: string, m: string) => void }
		).throttledError.bind(pm);
		throttledError("callback:NOTIFICATIONS:delta", "boom");
		const snap = pm.getStatusSnapshot();
		const notif = snap.perConversion.find((c) => c.key === "NOTIFICATIONS");
		expect(notif).toBeDefined();
		expect(notif?.lastErrorMessage).toBe("boom");
		expect(notif?.lastErrorAgeMs).toBeGreaterThanOrEqual(0);
	});

	it("surfaces error buckets keyed under sub-conversion brackets", () => {
		const app = makeMockApp();
		const pm = new PluginManager(app, mockPlugin);
		// Sub-conversion buckets carry a bracketed index (BATTERY[2]); the
		// parent-key index in latestErrorByParent must aggregate them under
		// the bare parent optionKey (BATTERY).
		const throttledError = (
			pm as unknown as { throttledError: (k: string, m: string) => void }
		).throttledError.bind(pm);
		throttledError("callback:BATTERY[2]:stream", "subfail");
		const snap = pm.getStatusSnapshot();
		const battery = snap.perConversion.find((c) => c.key === "BATTERY");
		expect(battery?.lastErrorMessage).toBe("subfail");
	});
});

describe("PluginManager.getConversionMetadata", () => {
	it("returns one entry per loaded conversion with key/category/extras", () => {
		const app = makeMockApp();
		const pm = new PluginManager(app, mockPlugin);
		const meta = pm.getConversionMetadata();
		expect(meta.length).toBeGreaterThan(40);
		const first = meta[0];
		expect(first).toBeDefined();
		expect(first).toHaveProperty("key");
		expect(first).toHaveProperty("category");
		expect(first).toHaveProperty("extras");
		expect(first).toHaveProperty("pgns");
		expect(Array.isArray(first?.pgns)).toBe(true);
	});

	// Regression guard: extractPgnsFromTitle parses the "Name (PGN N)" /
	// "Name (PGNs N, M)" suffix. A future rename that drops the parenthetical
	// would silently produce empty pgns arrays in the /api/conversions
	// response without this assertion. Every loaded conversion must yield at
	// least one PGN string.
	it("every loaded conversion exposes at least one PGN", () => {
		const app = makeMockApp();
		const pm = new PluginManager(app, mockPlugin);
		const meta = pm.getConversionMetadata();
		const missing = meta.filter((m) => m.pgns.length === 0);
		expect(missing).toEqual([]);
	});
});

describe("PluginManager.throttledError window", () => {
	it("suppresses repeat errors within 60s and reopens with a suppressed-count suffix", () => {
		vi.useFakeTimers();
		try {
			const errors: string[] = [];
			const app = makeMockApp();
			// Capture the throttled error output. makeMockApp's error() is a
			// no-op, so override it to record what actually reaches the log.
			(app as unknown as { error: (m: string) => void }).error = (m) => {
				errors.push(m);
			};
			const pm = new PluginManager(app, mockPlugin);
			const throttledError = (
				pm as unknown as { throttledError: (k: string, m: string) => void }
			).throttledError.bind(pm);
			const key = "callback:WIND:stream";

			// First error for the key passes through immediately.
			throttledError(key, "boom");
			expect(errors).toEqual(["boom"]);

			// A second identical-key error inside the 60s window is suppressed
			// (counted, not logged).
			vi.advanceTimersByTime(30_000);
			throttledError(key, "boom");
			expect(errors).toHaveLength(1);

			// Once the window expires, the next error logs again and reports how
			// many were suppressed during the window.
			vi.advanceTimersByTime(31_000);
			throttledError(key, "boom");
			expect(errors).toHaveLength(2);
			expect(errors[1]).toBe(
				"boom (1 similar errors suppressed in the last 60s)",
			);
		} finally {
			vi.useRealTimers();
		}
	});
});
