/**
 * Lifecycle tests for PluginManager: assert that start() wires up the expected
 * subscriptions / listeners, that the resend interval fires output, and that
 * stop() tears every one of them down, even when a conversion callback throws.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RootConfig } from "../config/schema.js";
import createPlugin from "../index.js";
import { PluginManager } from "../plugin-manager.js";
import type { N2KMessage, PluginOptions, SignalKApp, SignalKPlugin } from "../types/index.js";

/* ------------------------------------------------------------------ *
 * Mock SignalKApp
 *
 * The real SignalKApp surface is huge (it extends ServerAPI which itself
 * extends ~10 other registries). The plugin only touches a small slice of it,
 * so we build a typed test double that records the slice we care about and
 * casts to SignalKApp for the constructor signature. The recorded shape is
 * exposed on `MockSignalKApp` so tests can drive it.
 * ------------------------------------------------------------------ */

type EventListener = (data: unknown) => void;

interface BaconLikeBus {
	filter(predicate: (value: unknown) => boolean): BaconLikeBus;
	onValue(callback: (value: unknown) => void): () => void;
	/** Test helper: push a value through every active listener. */
	push(value: unknown): void;
}

interface MockSignalKApp {
	app: SignalKApp;
	/** Push a value into a stream-bus subscription created via getSelfBus. */
	pushStream: (path: string, value: unknown) => void;
	/** Fire any event registered via app.on(event, ...). */
	fireEvent: (event: string, data?: unknown) => void;
	/** Number of currently-active stream listeners. */
	streamListenerCount: () => number;
	/** Number of currently-active event listeners (across all events). */
	eventListenerCount: () => number;
	/** Number of subscriptionmanager.subscribe calls observed. */
	subscriptionCallCount: () => number;
	/** Captured subscription args (first call), or undefined if none. */
	firstSubscription: () => unknown;
	/** Captured nmea2000JsonOut emissions. */
	emittedMessages: N2KMessage[];
	/** Captured plugin status strings. */
	statusUpdates: string[];
	/** Captured plugin error strings. */
	errorUpdates: string[];
	/** Captured app.error() messages. */
	loggedErrors: string[];
}

function createMockSignalKApp(): MockSignalKApp {
	// path -> active onValue callbacks (returned by the bus)
	const streamListeners = new Map<string, Set<(value: unknown) => void>>();
	// event -> registered listeners
	const eventListeners = new Map<string, Set<EventListener>>();
	// Calls captured by subscriptionmanager.subscribe
	const subscriptionCalls: Array<{ subscription: unknown }> = [];

	const emittedMessages: N2KMessage[] = [];
	const statusUpdates: string[] = [];
	const errorUpdates: string[] = [];
	const loggedErrors: string[] = [];

	const makeBus = (path: string): BaconLikeBus => {
		// Predicate stack so .filter().filter() composes correctly.
		const predicates: Array<(value: unknown) => boolean> = [];
		const bus: BaconLikeBus = {
			filter(predicate) {
				predicates.push(predicate);
				return bus;
			},
			onValue(callback) {
				const wrapped = (value: unknown) => {
					if (predicates.every((p) => p(value))) {
						callback(value);
					}
				};
				let set = streamListeners.get(path);
				if (!set) {
					set = new Set();
					streamListeners.set(path, set);
				}
				set.add(wrapped);
				return () => {
					set?.delete(wrapped);
				};
			},
			push(value) {
				const set = streamListeners.get(path);
				if (!set) return;
				for (const cb of set) cb(value);
			},
		};
		return bus;
	};

	// Per-path bus cache so repeated getSelfBus(path) returns same bus surface.
	// (We still create new wrapped listeners per onValue call; the cache only
	// dedupes the stream identity to mirror the real streambundle behaviour.)
	const buses = new Map<string, BaconLikeBus>();
	const getOrCreateBus = (path: string): BaconLikeBus => {
		let bus = buses.get(path);
		if (!bus) {
			bus = makeBus(path);
			buses.set(path, bus);
		}
		return bus;
	};

	const app = {
		// ServerAPI surface used by PluginManager
		debug: Object.assign(() => {}, { enabled: false }) as SignalKApp["debug"],
		error: ((msg: string) => {
			loggedErrors.push(msg);
		}) as SignalKApp["error"],
		setPluginStatus: (msg: string) => {
			statusUpdates.push(msg);
		},
		setPluginError: (msg: string) => {
			errorUpdates.push(msg);
		},
		getSelfPath: (_path: string) => undefined,
		getPath: (_path: string) => undefined,

		// Stream bundle
		streambundle: {
			getSelfBus: (path: string) => getOrCreateBus(String(path)),
		},

		// Subscription manager
		subscriptionmanager: {
			subscribe: (subscription: unknown) => {
				subscriptionCalls.push({ subscription });
			},
		},

		// Event bus
		on: (event: string, callback: EventListener) => {
			let set = eventListeners.get(event);
			if (!set) {
				set = new Set();
				eventListeners.set(event, set);
			}
			set.add(callback);
		},
		removeListener: (event: string, callback: EventListener) => {
			eventListeners.get(event)?.delete(callback);
		},
		emit: (event: string, data: unknown) => {
			if (event === "nmea2000JsonOut") {
				emittedMessages.push(data as N2KMessage);
			}
		},

		// Required ServerAPI methods exercised by PluginManager.
		reportOutputMessages: (_count?: number) => {},
		registerDeltaInputHandler: (_handler: unknown) => {},
	} as unknown as SignalKApp;

	return {
		app,
		pushStream: (path, value) => {
			const set = streamListeners.get(path);
			if (!set) return;
			for (const cb of set) cb(value);
		},
		fireEvent: (event, data) => {
			const set = eventListeners.get(event);
			if (!set) return;
			for (const cb of set) cb(data);
		},
		streamListenerCount: () => Array.from(streamListeners.values()).reduce((n, s) => n + s.size, 0),
		eventListenerCount: () => Array.from(eventListeners.values()).reduce((n, s) => n + s.size, 0),
		subscriptionCallCount: () => subscriptionCalls.length,
		firstSubscription: () => subscriptionCalls[0]?.subscription,
		emittedMessages,
		statusUpdates,
		errorUpdates,
		loggedErrors,
	};
}

const mockPlugin: SignalKPlugin = {
	id: "signalk-nmea2000-emitter-cannon",
	name: "Test Plugin",
	description: "Test plugin",
	schema: () => RootConfig,
	start: () => {},
	stop: () => {},
};

/**
 * Drive the debounceTime(10) inside PluginManager.mapRxJS by advancing 11ms.
 * We use real microtasks so the RxJS scheduler resolves any awaited promises.
 */
async function flush(): Promise<void> {
	vi.advanceTimersByTime(11);
	// Allow processOutput's await Promise.resolve(...) to settle.
	await Promise.resolve();
	await Promise.resolve();
}

describe("PluginManager lifecycle", () => {
	let mock: MockSignalKApp;
	let manager: PluginManager;

	beforeEach(() => {
		vi.useFakeTimers();
		mock = createMockSignalKApp();
		// Pass a factory readiness getter that returns true so start() detects
		// readiness synchronously. The factory flag in index.ts is itself the OR
		// of the registration-time isNmea2000OutAvailable snapshot and the
		// latched one-shot event, so a true getter models either the
		// re-enabled-after-boot-event case or the enabled-after-output-available
		// case. PluginManager only reads this getter, never the appCopy snapshot
		// directly (see index.ts).
		manager = new PluginManager(mock.app, mockPlugin, () => true);
	});

	afterEach(() => {
		try {
			manager.stop();
		} catch {
			// stop() is the system-under-test elsewhere; swallow if already torn down.
		}
		vi.useRealTimers();
	});

	it("start() registers the nmea2000OutAvailable listener and flips ready via the factory flag", () => {
		// Constructor binds the callback but does NOT attach it; start() owns
		// the lifecycle. With the factory readiness getter returning true (set
		// in beforeEach), start() flips ready via its sync-detect path.
		expect(mock.eventListenerCount()).toBe(0);

		manager.start({
			globalResendInterval: 5,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		expect(mock.eventListenerCount()).toBeGreaterThanOrEqual(1);
		expect(mock.loggedErrors).toEqual([]);
		// Sync mirror was true at start(); status should be the running form,
		// not "Waiting for NMEA 2000 output".
		expect(mock.statusUpdates).toContain("Running with 1 conversions enabled");
	});

	it("flips readiness and starts emitting when nmea2000OutAvailable fires after start()", async () => {
		// Construct a manager whose factory readiness getter returns false, so
		// start() cannot sync-detect readiness. This models a plugin enabled
		// before signalk-server has brought NMEA 2000 output up: output must be
		// gated until the one-shot nmea2000OutAvailable event arrives, then
		// latch ready. This is the event half of the v1.7.0 readiness fix; the
		// snapshot-seed half is covered by the createPlugin describe block below.
		const readyManager = new PluginManager(mock.app, mockPlugin, () => false);

		readyManager.start({
			globalResendInterval: 0,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		// Not ready yet: status is the waiting form, not the running form.
		expect(mock.statusUpdates).toContain("Waiting for NMEA 2000 output (1 conversions enabled)");
		expect(mock.statusUpdates).not.toContain("Running with 1 conversions enabled");

		// A delta arriving before readiness is dropped, not emitted onto a bus
		// that is not up.
		mock.pushStream("environment.wind.angleApparent", { value: 1.5 });
		mock.pushStream("environment.wind.speedApparent", { value: 2.0 });
		await flush();
		expect(mock.emittedMessages).toEqual([]);

		// The one-shot event arrives: readiness latches and the status refreshes
		// to the running form.
		mock.fireEvent("nmea2000OutAvailable");
		expect(mock.statusUpdates).toContain("Running with 1 conversions enabled");

		// A delta arriving after the event now emits.
		mock.pushStream("environment.wind.angleApparent", { value: 1.6 });
		mock.pushStream("environment.wind.speedApparent", { value: 2.1 });
		await flush();
		expect(mock.emittedMessages.length).toBeGreaterThanOrEqual(1);
		expect(mock.emittedMessages[mock.emittedMessages.length - 1]?.pgn).toBe(130306);

		readyManager.stop();
	});

	it("start() wires up stream subscriptions for enabled conversions", () => {
		const options = {
			globalResendInterval: 5,
			WIND: { enabled: true, resend: 0 },
			DEPTH: { enabled: true, resend: 0 },
		} as unknown as PluginOptions;

		manager.start(options);

		// WIND subscribes to angleApparent + speedApparent; DEPTH to belowTransducer.
		expect(mock.streamListenerCount()).toBe(3);
		// Plugin status updated with enabled count.
		expect(mock.statusUpdates).toContain("Running with 2 conversions enabled");
		expect(mock.errorUpdates).toEqual([]);
	});

	it("emits N2K output when a stream value arrives", async () => {
		manager.start({
			globalResendInterval: 5,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		// Send an apparent-angle update, then an apparent-speed update.
		mock.pushStream("environment.wind.angleApparent", { value: 1.5 });
		mock.pushStream("environment.wind.speedApparent", { value: 2.0 });

		await flush();

		expect(mock.emittedMessages.length).toBeGreaterThanOrEqual(1);
		const latest = mock.emittedMessages[mock.emittedMessages.length - 1];
		expect(latest?.pgn).toBe(130306);
	});

	it("resend interval re-emits cached output until stop()", async () => {
		manager.start({
			globalResendInterval: 1, // 1s resend
			DEPTH: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		mock.pushStream("environment.depth.belowTransducer", { value: 4.5 });
		await flush();

		const baseline = mock.emittedMessages.length;
		expect(baseline).toBeGreaterThanOrEqual(1);

		// Advance past one resend tick.
		vi.advanceTimersByTime(1000);
		await Promise.resolve();
		await Promise.resolve();

		expect(mock.emittedMessages.length).toBeGreaterThan(baseline);

		// And another tick fires again.
		const afterFirstTick = mock.emittedMessages.length;
		vi.advanceTimersByTime(1000);
		await Promise.resolve();
		await Promise.resolve();
		expect(mock.emittedMessages.length).toBeGreaterThan(afterFirstTick);
	});

	it("stop() unsubscribes streams, clears resend timers, and removes listeners", async () => {
		manager.start({
			globalResendInterval: 1,
			WIND: { enabled: true, resend: 0 },
			DEPTH: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		// Drive at least one output to install resend timers.
		mock.pushStream("environment.wind.angleApparent", { value: 0.5 });
		mock.pushStream("environment.wind.speedApparent", { value: 3.0 });
		mock.pushStream("environment.depth.belowTransducer", { value: 2.5 });
		await flush();

		// Sanity: streams + resend timers + nmea2000OutAvailable listener.
		expect(mock.streamListenerCount()).toBeGreaterThan(0);
		// Vitest tracks active timers (resend intervals).
		expect(vi.getTimerCount()).toBeGreaterThan(0);

		const emittedBefore = mock.emittedMessages.length;

		manager.stop();

		// Streams are torn down.
		expect(mock.streamListenerCount()).toBe(0);
		// All scheduled timers (resend intervals) cleared.
		expect(vi.getTimerCount()).toBe(0);

		// Advancing time should not produce any more emissions.
		vi.advanceTimersByTime(5000);
		await Promise.resolve();
		await Promise.resolve();
		expect(mock.emittedMessages.length).toBe(emittedBefore);
	});

	it("stop() removes the nmea2000OutAvailable listener registered by start()", () => {
		// Before start(): no listener attached (constructor only captures the
		// callback; start() owns the registration).
		expect(mock.eventListenerCount()).toBe(0);

		manager.start({
			globalResendInterval: 5,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);
		expect(mock.eventListenerCount()).toBeGreaterThanOrEqual(1);

		manager.stop();

		// After stop(), no event listeners should remain. Otherwise each
		// plugin restart leaks a listener and a zombie PluginManager.
		expect(mock.eventListenerCount()).toBe(0);
	});

	it("repeated start/stop cycles do not accumulate nmea2000OutAvailable listeners", () => {
		// Baseline: no listener until start() runs.
		expect(mock.eventListenerCount()).toBe(0);

		const opts = {
			globalResendInterval: 5,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions;

		// Exact Issue #5 scenario: disable then re-enable from the admin UI
		// triggers stop() then start() on the same PluginManager instance. The
		// nmea2000OutAvailable event is one-shot at server boot, so start()'s
		// idempotent removeListener+addListener (plus the sync-detect check via
		// the factory readiness getter) is what keeps the listener count at 1.
		for (let i = 0; i < 3; i++) {
			manager.start(opts);
			expect(mock.eventListenerCount()).toBe(1);
			manager.stop();
			expect(mock.eventListenerCount()).toBe(0);
		}
	});

	it("notifications subscribe with policy:instant so bursts are not throttled", () => {
		manager.start({
			globalResendInterval: 0,
			NOTIFICATIONS: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		// A subscription should have been registered for notifications.
		expect(mock.subscriptionCallCount()).toBeGreaterThan(0);
		const sub = mock.firstSubscription() as {
			subscribe: Array<{ policy?: string; period?: number }>;
		};
		expect(sub.subscribe.length).toBeGreaterThan(0);
		// Default Signal K subscribe period is 1000ms, which throttles alarm
		// bursts and can drop an alert. Events should subscribe with
		// policy:"instant" or period:0.
		const first = sub.subscribe[0];
		const instant = first?.policy === "instant" || first?.period === 0;
		expect(instant).toBe(true);
	});

	it("does not arm resend timers before any stream data has arrived", async () => {
		// `BehaviorSubject<unknown[]>([])` emits its empty-array seed through
		// debounceTime(10), causing processOutput to run and arm a resend timer
		// before any real Signal K value has arrived. Using Subject instead of
		// BehaviorSubject keeps the pipeline idle until a value is pushed.
		manager.start({
			globalResendInterval: 1,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		await flush();

		// No stream data was pushed, so no resend timer should be armed.
		expect(vi.getTimerCount()).toBe(0);
		expect(mock.emittedMessages).toEqual([]);
	});

	it("timer-source conversions do not also arm a resend timer", async () => {
		// systemTime is a `timer` sourceType with its own 1s interval. A resend
		// timer on top of that would emit PGN 126992 twice per global-resend
		// window: once from the main timer, once from the resend.
		manager.start({
			globalResendInterval: 5,
			SYSTEM_TIME: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		// Tick the main 1s timer once.
		vi.advanceTimersByTime(1000);
		await Promise.resolve();
		await Promise.resolve();

		// Only one active timer should exist: the timer-source's own setInterval.
		// If a resend timer was also armed, the count would be 2.
		expect(vi.getTimerCount()).toBe(1);

		// Emissions across 6 seconds: exactly 6 (one per 1s main tick), not more.
		const initial = mock.emittedMessages.length;
		vi.advanceTimersByTime(5000);
		await Promise.resolve();
		await Promise.resolve();
		expect(mock.emittedMessages.length - initial).toBe(5);
	});

	it("refreshes vessel trip every second while rechecking input freshness", async () => {
		manager.start({
			globalResendInterval: 5,
			VESSEL_TRIP: {
				enabled: true,
				resend: 0,
				fuelTanks: [{ signalkPath: "tanks.fuel.reserve_1" }],
				engines: [{ signalkId: "main" }],
			},
		} as unknown as PluginOptions);
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(1000);
		await flush();
		expect(mock.emittedMessages).toEqual([]);
		expect((manager as unknown as { lastInputs: Map<unknown, unknown> }).lastInputs.size).toBe(0);

		mock.pushStream("tanks.fuel.reserve_1.currentLevel", { value: 0.5 });
		mock.pushStream("tanks.fuel.reserve_1.capacity", { value: 0.1 });
		mock.pushStream("propulsion.main.fuel.rate", { value: 0.00001 });
		mock.pushStream("navigation.speedOverGround", { value: 2 });
		await flush();
		expect(mock.emittedMessages).toEqual([]);

		vi.advanceTimersByTime(1000);
		await flush();
		expect((manager as unknown as { lastInputs: Map<unknown, unknown> }).lastInputs.size).toBe(1);
		expect(mock.emittedMessages.at(-1)).toMatchObject({
			pgn: 127496,
			prio: 5,
			fields: {
				estimatedFuelRemaining: 50,
				timeToEmpty: 5000,
				distanceToEmpty: 10000,
			},
		});
		const afterFirstTick = mock.emittedMessages.length;
		vi.advanceTimersByTime(1000);
		await flush();
		expect(mock.emittedMessages).toHaveLength(afterFirstTick + 1);

		// Fuel rate and SOG are stale after ten seconds. The next scheduled
		// recomputation retains the safe fuel estimate but removes stale range.
		vi.setSystemTime(new Date(Date.now() + 11_000));
		vi.advanceTimersByTime(1000);
		await flush();
		expect(mock.emittedMessages.at(-1)?.fields).toEqual({ estimatedFuelRemaining: 50 });

		// Capacity is static and must survive beyond the dynamic 60-second tank
		// timeout. Refresh the level, rate, and speed without republishing capacity.
		vi.setSystemTime(new Date(Date.now() + 61_000));
		mock.pushStream("tanks.fuel.reserve_1.currentLevel", { value: 0.4 });
		mock.pushStream("propulsion.main.fuel.rate", { value: 0.00001 });
		mock.pushStream("navigation.speedOverGround", { value: 2 });
		vi.advanceTimersByTime(1000);
		await flush();
		expect(mock.emittedMessages.at(-1)?.fields).toEqual({
			estimatedFuelRemaining: 40,
			timeToEmpty: 4000,
			distanceToEmpty: 8000,
		});

		const beforeStop = mock.emittedMessages.length;
		manager.stop();
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(5000);
		await Promise.resolve();
		expect(mock.emittedMessages).toHaveLength(beforeStop);
	});

	it("fixed timestamps do not arm a resend timer", async () => {
		manager.start({
			globalResendInterval: 1,
			TIME_DATE: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		mock.pushStream("navigation.datetime", { value: "2026-07-19T14:59:53.123Z" });
		await flush();

		expect(mock.emittedMessages).toHaveLength(1);
		expect(mock.emittedMessages[0]?.pgn).toBe(129033);
		expect(vi.getTimerCount()).toBe(0);

		vi.advanceTimersByTime(5000);
		await Promise.resolve();
		expect(mock.emittedMessages).toHaveLength(1);
	});

	it("stop() still completes cleanly when a conversion callback threw", async () => {
		// SystemTime is the only timer-source conversion; we'll use a stream
		// conversion (DEPTH) and inject a throw via the `value` shape so the
		// callback path raises inside the RxJS pipeline.
		manager.start({
			globalResendInterval: 1,
			DEPTH: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		// `getSelfPath` is set to return undefined, so depth callback runs fine
		// for valid numbers. Force a throw by pushing a value that the callback
		// will read but the inner try/catch will log, NOT rethrow, so we also
		// simulate an upstream error by pushing a Symbol value, which will be
		// coerced and the validation rejection will yield [].
		mock.pushStream("environment.depth.belowTransducer", { value: Number.NaN });
		await flush();

		// Replace getSelfPath with a thrower to force the callback's inner
		// try/catch into the catch branch on the next tick.
		(mock.app as unknown as { getSelfPath: (p: string) => unknown }).getSelfPath = () => {
			throw new Error("boom from getSelfPath");
		};

		mock.pushStream("environment.depth.belowTransducer", { value: 6.0 });
		await flush();

		// Conversion's try/catch inside depth.ts logs via app.error and returns [].
		expect(mock.loggedErrors.some((m) => m.includes("boom from getSelfPath"))).toBe(true);

		// stop() must still tear everything down without throwing.
		expect(() => manager.stop()).not.toThrow();
		expect(mock.streamListenerCount()).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stopped flag neutralises late deltas and resend timers after stop()", async () => {
		const options = {
			globalResendInterval: 5,
			DEPTH: { enabled: true, resend: 0 },
		} as unknown as PluginOptions;

		manager.start(options);
		(mock.app as unknown as { getSelfPath: (p: string) => unknown }).getSelfPath = () => 0;

		mock.pushStream("environment.depth.belowTransducer", { value: 5 });
		await flush();
		const emittedBeforeStop = mock.emittedMessages.length;
		expect(emittedBeforeStop).toBeGreaterThan(0);

		manager.stop();

		// A delta arriving after stop() must not produce any new emit, even if
		// the upstream stream did not unsubscribe cleanly. The stopped flag
		// also neutralises any zombie registerDeltaInputHandler closures that
		// signalk-server has no API to unregister.
		mock.pushStream("environment.depth.belowTransducer", { value: 6 });
		await flush();
		expect(mock.emittedMessages.length).toBe(emittedBeforeStop);
	});
});

describe("createPlugin NMEA 2000 readiness seeding", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("applies the canonical PGN priority at the emit boundary", async () => {
		const mock = createMockSignalKApp();
		(mock.app as { isNmea2000OutAvailable?: boolean }).isNmea2000OutAvailable = true;
		const plugin = createPlugin(mock.app);
		plugin.start(
			{
				globalResendInterval: 0,
				SEA_TEMP: { enabled: true, resend: 0 },
			} as unknown as PluginOptions,
			() => {},
		);

		mock.pushStream("environment.water.temperature", { value: 281.2 });
		await flush();

		const message = mock.emittedMessages.find((pgn) => pgn.pgn === 130310);
		expect(message?.prio).toBe(5);

		plugin.stop();
	});

	it("seeds readiness from app.isNmea2000OutAvailable so a plugin enabled after the one-shot event still emits", async () => {
		// Regression: when the plugin is enabled or installed after
		// signalk-server already fired the one-shot nmea2000OutAvailable event,
		// the listener attaches too late to ever catch it, so the
		// registration-time snapshot is the only readiness signal. createPlugin
		// must seed from it, otherwise processToN2K drops every PGN.
		const mock = createMockSignalKApp();
		(mock.app as { isNmea2000OutAvailable?: boolean }).isNmea2000OutAvailable = true;

		const plugin = createPlugin(mock.app);
		plugin.start(
			{
				globalResendInterval: 0,
				WIND: { enabled: true, resend: 0 },
			} as unknown as PluginOptions,
			() => {},
		);

		// Deliberately never fire nmea2000OutAvailable: the snapshot seed is the
		// only thing that can mark output ready in this scenario.
		mock.pushStream("environment.wind.angleApparent", { value: 1.5 });
		mock.pushStream("environment.wind.speedApparent", { value: 2.0 });
		await flush();

		expect(mock.emittedMessages.length).toBeGreaterThanOrEqual(1);

		plugin.stop();
	});

	it("drops output when neither the snapshot nor the event marks readiness", async () => {
		// Control for the test above: with isNmea2000OutAvailable unset and the
		// event never fired, readiness stays false and processToN2K drops the
		// message rather than emitting onto a bus that is not ready.
		const mock = createMockSignalKApp();

		const plugin = createPlugin(mock.app);
		plugin.start(
			{
				globalResendInterval: 0,
				WIND: { enabled: true, resend: 0 },
			} as unknown as PluginOptions,
			() => {},
		);

		mock.pushStream("environment.wind.angleApparent", { value: 1.5 });
		mock.pushStream("environment.wind.speedApparent", { value: 2.0 });
		await flush();

		expect(mock.emittedMessages).toEqual([]);

		plugin.stop();
	});
});
