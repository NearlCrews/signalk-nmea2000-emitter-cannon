import { describe, expect, it, vi } from "vitest";
import { RootConfig } from "../config/schema.js";
import { SLOW_DATA_TIMEOUT_MS, SOURCE_TYPE } from "../constants.js";
import { outputStateFor } from "../panel/outputState.js";
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

describe("outputStateFor", () => {
	it("reports loading before the first status snapshot arrives", () => {
		expect(outputStateFor(null)).toBe("loading");
	});

	it("gives plugin inactivity precedence over a stale readiness flag", () => {
		expect(outputStateFor({ pluginRunning: false, nmea2000Ready: true })).toBe("inactive");
	});

	it("distinguishes a running plugin that is waiting from one that is ready", () => {
		expect(outputStateFor({ pluginRunning: true, nmea2000Ready: false })).toBe("waiting");
		expect(outputStateFor({ pluginRunning: true, nmea2000Ready: true })).toBe("ready");
	});
});

describe("PluginManager.getStatusSnapshot", () => {
	it("returns the canonical shape even before start()", () => {
		const app = makeMockApp();
		const pm = new PluginManager(app, mockPlugin);
		const snap = pm.getStatusSnapshot();
		expect(snap).toHaveProperty("pluginRunning", false);
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
		const recordEmit = (pm as unknown as { recordEmit: (k: string) => void }).recordEmit.bind(pm);
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

	it("reports accepted inputs, empty outputs, and source-safety drops", () => {
		const pm = new PluginManager(makeMockApp(), mockPlugin);
		const internal = pm as unknown as {
			recordInput: (key: string) => void;
			recordEmptyOutput: (key: string) => void;
			recordDrop: (key: string, reason: "publisher-filter" | "nmea2000-echo") => void;
		};
		internal.recordInput("BATTERY[0]");
		internal.recordEmptyOutput("BATTERY[0]");
		internal.recordDrop("BATTERY[1]", "publisher-filter");
		internal.recordDrop("BATTERY[1]", "nmea2000-echo");

		const battery = pm.getStatusSnapshot().perConversion.find((row) => row.key === "BATTERY");
		expect(battery).toMatchObject({
			inputCount: 1,
			emptyOutputCount: 1,
			sourceFilterDropCount: 1,
			nmea2000EchoDropCount: 1,
			lastDropReason: "nmea2000-echo",
		});
		expect(battery?.lastInputMs).toBeGreaterThanOrEqual(0);
		expect(battery?.lastEmptyOutputMs).toBeGreaterThanOrEqual(0);
		expect(battery?.lastDropAgeMs).toBeGreaterThanOrEqual(0);
	});

	it("ignores unrelated synchronous and asynchronous ON_DELTA results", async () => {
		const pm = new PluginManager(makeMockApp(), mockPlugin);
		const callbacks = [() => [], async () => []];
		const internal = pm as unknown as {
			deltaConversions: Array<{
				conversion: {
					title: string;
					optionKey: string;
					sourceType: string;
					callback: () => unknown[] | Promise<unknown[]>;
				};
				options: { resend: number };
			}>;
			handleDeltaInput: (delta: unknown) => void;
		};

		for (const callback of callbacks) {
			internal.deltaConversions = [
				{
					conversion: {
						title: "Notifications",
						optionKey: "NOTIFICATIONS",
						sourceType: SOURCE_TYPE.ON_DELTA,
						callback,
					},
					options: { resend: 0 },
				},
			];
			internal.handleDeltaInput({ updates: [{ values: [{ path: "unrelated", value: true }] }] });
		}
		await Promise.resolve();
		await Promise.resolve();

		const notifications = pm
			.getStatusSnapshot()
			.perConversion.find((row) => row.key === "NOTIFICATIONS");
		expect(notifications).toMatchObject({ inputCount: 0, emptyOutputCount: 0 });
	});

	it("retains child mapping status while preserving the parent aggregate", () => {
		const pm = new PluginManager(makeMockApp(), mockPlugin);
		pm.start({
			globalResendInterval: 0,
			conversions: {
				BATTERY: {
					enabled: true,
					resend: 0,
					sources: {},
					extras: {
						batteries: [
							{ signalkId: "house", instanceId: 0 },
							{ signalkId: "start", instanceId: 1 },
						],
					},
				},
			},
		});
		const internal = pm as unknown as {
			recordEmit: (key: string) => void;
			recordInput: (key: string, path?: string) => void;
			recordEmptyOutput: (key: string) => void;
			throttledError: (key: string, message: string) => void;
		};
		internal.recordInput("BATTERY[0]", "electrical.batteries.house.voltage");
		internal.recordEmit("BATTERY[0]");
		internal.recordEmptyOutput("BATTERY[1]");
		internal.throttledError("callback:BATTERY[1]:stream", "start battery failed");

		const rows = pm.getStatusSnapshot().perConversion;
		const parent = rows.find((row) => row.key === "BATTERY");
		const house = rows.find((row) => row.key === "BATTERY[0]");
		const start = rows.find((row) => row.key === "BATTERY[1]");
		expect(parent).toMatchObject({
			emitCount: 1,
			inputCount: 1,
			emptyOutputCount: 1,
			lastErrorMessage: "start battery failed",
		});
		expect(house).toMatchObject({
			parentKey: "BATTERY",
			mappingIndex: 0,
			emitCount: 1,
			inputCount: 1,
			emptyOutputCount: 0,
		});
		expect(house?.inputPaths).toContain("electrical.batteries.house.voltage");
		expect(
			house?.inputPathLastSeenMs?.["electrical.batteries.house.voltage"],
		).toBeGreaterThanOrEqual(0);
		expect(start).toMatchObject({
			parentKey: "BATTERY",
			mappingIndex: 1,
			emitCount: 0,
			inputCount: 0,
			emptyOutputCount: 1,
			lastErrorMessage: "start battery failed",
		});
		pm.stop();
	});

	it("flags a previously active child input after its conversion timeout", () => {
		vi.useFakeTimers();
		const startedAt = new Date("2026-07-22T12:00:00Z");
		vi.setSystemTime(startedAt);
		const pm = new PluginManager(makeMockApp(), mockPlugin);
		try {
			pm.start({
				globalResendInterval: 5,
				conversions: {
					BATTERY: {
						enabled: true,
						resend: 0,
						sources: {},
						extras: { batteries: [{ signalkId: "start", instanceId: 1 }] },
					},
				},
			});
			const internal = pm as unknown as {
				recordEmit: (key: string) => void;
				recordInput: (key: string, path?: string) => void;
			};
			const voltagePath = "electrical.batteries.start.voltage";
			internal.recordInput("BATTERY[0]", voltagePath);
			vi.setSystemTime(startedAt.getTime() + SLOW_DATA_TIMEOUT_MS + 1);
			// A cached resend must not make the dead source look healthy.
			internal.recordEmit("BATTERY[0]");

			const rows = pm.getStatusSnapshot().perConversion;
			const child = rows.find((row) => row.key === "BATTERY[0]");
			const parent = rows.find((row) => row.key === "BATTERY");
			expect(child?.staleInputPaths).toEqual([voltagePath]);
			expect(child?.activityStale).toBe(true);
			expect(child?.staleInputPaths).not.toContain("electrical.batteries.start.current");
			expect(parent).toMatchObject({
				activityStale: true,
				staleChildCount: 1,
				staleInputPaths: [voltagePath],
			});
		} finally {
			pm.stop();
			vi.useRealTimers();
		}
	});

	it("detects an overdue timer child without treating timer ticks as input", () => {
		vi.useFakeTimers();
		const startedAt = new Date("2026-07-22T12:00:00Z");
		vi.setSystemTime(startedAt);
		const pm = new PluginManager(makeMockApp(), mockPlugin);
		try {
			pm.start({
				globalResendInterval: 0,
				conversions: {
					ENGINE_STATIC: {
						enabled: true,
						resend: 0,
						sources: {},
						extras: {
							engines: [{ signalkId: "main", instanceId: 0, VIN: "ABC123" }],
						},
					},
				},
			});
			let child = pm
				.getStatusSnapshot()
				.perConversion.find((row) => row.key === "ENGINE_STATIC[0]");
			expect(child?.inputCount).toBe(0);
			const cadence = child?.expectedActivityMs;
			expect(cadence).toBeGreaterThan(0);
			vi.setSystemTime(startedAt.getTime() + (cadence ?? 0) * 3 + 1);
			child = pm.getStatusSnapshot().perConversion.find((row) => row.key === "ENGINE_STATIC[0]");
			expect(child).toMatchObject({ activityStale: true, inputCount: 0 });
			const parent = pm
				.getStatusSnapshot()
				.perConversion.find((row) => row.key === "ENGINE_STATIC");
			expect(parent).toMatchObject({ activityStale: true, staleChildCount: 1 });
		} finally {
			pm.stop();
			vi.useRealTimers();
		}
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

	it("marks factory timers as ineligible for resend", () => {
		const app = makeMockApp();
		const pm = new PluginManager(app, mockPlugin);
		const engineStatic = pm
			.getConversionMetadata()
			.find((conversion) => conversion.key === "ENGINE_STATIC");
		expect(engineStatic?.canResend).toBe(false);
	});

	it("marks freshness-refresh conversions as ineligible for resend", () => {
		const app = makeMockApp();
		const pm = new PluginManager(app, mockPlugin);
		const vesselTrip = pm
			.getConversionMetadata()
			.find((conversion) => conversion.key === "VESSEL_TRIP");
		expect(vesselTrip?.canResend).toBe(false);
		expect(vesselTrip?.extras).toEqual({ type: "vesselTripMapping", minRows: 0 });
	});

	it("exposes configured factory input paths after start", () => {
		const pm = new PluginManager(makeMockApp(), mockPlugin);
		pm.start({
			globalResendInterval: 0,
			conversions: {
				BATTERY: {
					enabled: true,
					resend: 0,
					sources: {},
					extras: { batteries: [{ signalkId: "258-second", instanceId: 1 }] },
				},
			},
		});

		const battery = pm.getConversionMetadata().find((conversion) => conversion.key === "BATTERY");
		expect(battery?.paths).toContain("electrical.batteries.258-second.voltage");
		pm.stop();
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
			expect(errors[1]).toBe("boom (1 similar errors suppressed in the last 60s)");
		} finally {
			vi.useRealTimers();
		}
	});
});
