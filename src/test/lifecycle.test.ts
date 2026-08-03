/**
 * Lifecycle tests for PluginManager: assert that start() wires up the expected
 * subscriptions / listeners, that the resend interval fires output, and that
 * stop() tears every one of them down, even when a conversion callback throws.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RootConfig } from "../config/schema.js";
import { SOURCE_TYPE, WEATHER_DATA_TIMEOUT_MS } from "../constants.js";
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
type DeltaInputHandler = (delta: unknown, next: (delta: unknown) => void) => void;

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
	/** Number of callbacks retained by Signal K's plugin-bound listener tracker. */
	trackedEventListenerCount: () => number;
	/** Number of subscriptionmanager.subscribe calls observed. */
	subscriptionCallCount: () => number;
	/** Deliver one raw delta to every active subscription callback. */
	pushSubscription: (delta: unknown) => void;
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
	/** Number of host-owned delta input handlers currently installed. */
	deltaInputHandlerCount: () => number;
	/** Deliver a raw delta through every installed input handler. */
	pushDeltaInput: (delta: unknown, next?: (delta: unknown) => void) => void;
	/** Simulate Signal K running its onStop handler unregistrations. */
	clearDeltaInputHandlers: () => void;
}

function createMockSignalKApp(): MockSignalKApp {
	// path -> active onValue callbacks (returned by the bus)
	const streamListeners = new Map<string, Set<(value: unknown) => void>>();
	// event -> registered listeners
	const eventListeners = new Map<string, Set<EventListener>>();
	// Signal K's wrapped emitter records every plugin-bound app.on callback by
	// actor id. A direct removeListener removes the active callback but does not
	// delete this bookkeeping entry.
	const trackedEventListeners: Array<{ event: string; callback: EventListener }> = [];
	// Calls captured by subscriptionmanager.subscribe
	const subscriptionCalls: Array<{ subscription: unknown }> = [];
	const subscriptionCallbacks = new Set<(delta: unknown) => void>();
	const deltaInputHandlers = new Set<DeltaInputHandler>();

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
	// dedupes the stream identity to mirror the real streambundle behavior.)
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
			subscribe: (
				subscription: unknown,
				unsubscribes: Array<() => void>,
				_error: (error: unknown) => void,
				callback: (delta: unknown) => void,
			) => {
				subscriptionCalls.push({ subscription });
				subscriptionCallbacks.add(callback);
				unsubscribes.push(() => subscriptionCallbacks.delete(callback));
			},
		},

		// Event bus
		on: (event: string, callback: EventListener) => {
			trackedEventListeners.push({ event, callback });
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
		registerDeltaInputHandler: (handler: DeltaInputHandler) => {
			deltaInputHandlers.add(handler);
		},
		handleMessage: () => {},
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
		trackedEventListenerCount: () => trackedEventListeners.length,
		subscriptionCallCount: () => subscriptionCalls.length,
		pushSubscription: (delta) => {
			for (const callback of subscriptionCallbacks) callback(delta);
		},
		firstSubscription: () => subscriptionCalls[0]?.subscription,
		emittedMessages,
		statusUpdates,
		errorUpdates,
		loggedErrors,
		deltaInputHandlerCount: () => deltaInputHandlers.size,
		pushDeltaInput: (delta, next = () => {}) => {
			for (const handler of deltaInputHandlers) handler(delta, next);
		},
		clearDeltaInputHandlers: () => deltaInputHandlers.clear(),
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

function validDepthMessage(): N2KMessage {
	return {
		prio: 3,
		pgn: 128267,
		dst: 255,
		fields: { sid: 87, depth: 4.5 },
	};
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

	it("start() uses the factory readiness flag without registering an event listener", () => {
		// The plugin factory owns the sole Signal K event listener. A standalone
		// manager only reads its readiness getter and never touches app.on.
		expect(mock.eventListenerCount()).toBe(0);

		manager.start({
			globalResendInterval: 5,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		expect(mock.eventListenerCount()).toBe(0);
		expect(mock.trackedEventListenerCount()).toBe(0);
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
		readyManager.notifyNmea2000Ready();
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

		// Sanity: streams and resend timers are active.
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

	it("stop() has no manager-owned nmea2000OutAvailable listener to remove", () => {
		expect(mock.eventListenerCount()).toBe(0);

		manager.start({
			globalResendInterval: 5,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);
		expect(mock.eventListenerCount()).toBe(0);

		manager.stop();

		expect(mock.eventListenerCount()).toBe(0);
		expect(mock.trackedEventListenerCount()).toBe(0);
	});

	it("replacement managers do not register wrapped-emitter callbacks", () => {
		expect(mock.eventListenerCount()).toBe(0);

		const opts = {
			globalResendInterval: 5,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions;

		// Signal K's callback tracker intentionally does not forget direct
		// removeListener calls. This stays zero only if managers never call app.on.
		for (let i = 0; i < 3; i++) {
			const replacement = new PluginManager(mock.app, mockPlugin, () => true);
			replacement.start(opts);
			expect(mock.eventListenerCount()).toBe(0);
			expect(mock.trackedEventListenerCount()).toBe(0);
			replacement.stop();
			expect(mock.eventListenerCount()).toBe(0);
		}
	});

	it("forwards a delta before processing and forwards it once when processing throws", () => {
		manager.start({
			globalResendInterval: 0,
			AIS: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);
		const order: string[] = [];
		vi.spyOn(manager, "handleDeltaInput").mockImplementation(() => {
			order.push("process");
			throw new Error("forced delta failure");
		});

		mock.pushDeltaInput({ updates: [] }, () => order.push("next"));

		expect(order).toEqual(["next", "process"]);
		expect(mock.loggedErrors).toContainEqual(
			expect.stringContaining("Unable to process delta input: forced delta failure"),
		);
	});

	it("drops deferred ON_DELTA output that resolves after stop", async () => {
		let resolveOutput = (_messages: N2KMessage[]): void => {};
		const output = new Promise<N2KMessage[]>((resolve) => {
			resolveOutput = resolve;
		});
		const callback = vi.fn(() => output);
		(
			manager as unknown as {
				conversions: Array<Record<string, unknown>>;
			}
		).conversions = [
			{
				title: "Deferred delta",
				optionKey: "DEFERRED_DELTA",
				category: "system",
				sourceType: SOURCE_TYPE.ON_DELTA,
				keys: ["test.value"],
				callback,
			},
		];
		manager.start({
			globalResendInterval: 1,
			DEFERRED_DELTA: { enabled: true, resend: 1 },
		} as unknown as PluginOptions);

		mock.pushDeltaInput({ updates: [{ values: [{ path: "test.value", value: 1 }] }] });
		expect(callback).toHaveBeenCalledTimes(1);
		manager.stop();
		resolveOutput([validDepthMessage()]);
		await Promise.resolve();
		await Promise.resolve();

		expect(mock.emittedMessages).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("drops deferred stream output without arming resend after stop", async () => {
		let resolveOutput = (_messages: N2KMessage[]): void => {};
		const output = new Promise<N2KMessage[]>((resolve) => {
			resolveOutput = resolve;
		});
		const callback = vi.fn(() => output);
		(
			manager as unknown as {
				conversions: Array<Record<string, unknown>>;
			}
		).conversions = [
			{
				title: "Deferred stream",
				optionKey: "DEFERRED_STREAM",
				category: "system",
				sourceType: SOURCE_TYPE.ON_VALUE_CHANGE,
				keys: ["test.value"],
				callback,
			},
		];
		manager.start({
			globalResendInterval: 1,
			DEFERRED_STREAM: { enabled: true, resend: 1 },
		} as unknown as PluginOptions);

		mock.pushStream("test.value", { value: 1 });
		await flush();
		expect(callback).toHaveBeenCalledTimes(1);
		manager.stop();
		resolveOutput([validDepthMessage()]);
		await Promise.resolve();
		await Promise.resolve();

		expect(mock.emittedMessages).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stops a multi-PGN emission without recreating retired runtime state", async () => {
		const callback = vi.fn(() => [validDepthMessage(), validDepthMessage()]);
		(
			manager as unknown as {
				conversions: Array<Record<string, unknown>>;
			}
		).conversions = [
			{
				title: "Stop during emit",
				optionKey: "STOP_DURING_EMIT",
				category: "system",
				sourceType: SOURCE_TYPE.ON_DELTA,
				keys: ["test.value"],
				callback,
			},
		];
		manager.start({
			globalResendInterval: 0,
			STOP_DURING_EMIT: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);
		const originalEmit = mock.app.emit.bind(mock.app) as unknown as (
			event: string,
			data: unknown,
		) => void;
		(mock.app as unknown as { emit: (event: string, data: unknown) => void }).emit = (
			event,
			data,
		) => {
			originalEmit(event, data);
			manager.stop();
		};

		mock.pushDeltaInput({ updates: [{ values: [{ path: "test.value", value: 1 }] }] });
		await Promise.resolve();
		await Promise.resolve();

		expect(callback).toHaveBeenCalledTimes(1);
		expect(mock.emittedMessages).toHaveLength(1);
		expect((manager as unknown as { perConversion: Map<string, unknown> }).perConversion.size).toBe(
			0,
		);
	});

	it("matches source-less deltas against Signal K's no_source identifier", () => {
		const callback = vi.fn(() => []);
		(
			manager as unknown as {
				conversions: Array<Record<string, unknown>>;
			}
		).conversions = [
			{
				title: "Source-less delta",
				optionKey: "SOURCELESS",
				category: "system",
				sourceType: SOURCE_TYPE.ON_DELTA,
				keys: ["test.value"],
				callback,
			},
		];
		manager.start({
			conversions: {
				SOURCELESS: {
					enabled: true,
					resend: 0,
					sources: { "test.value": "no_source" },
					extras: {},
				},
			},
		} as unknown as PluginOptions);

		mock.pushDeltaInput({ updates: [{ values: [{ path: "test.value", value: 1 }] }] });
		mock.pushDeltaInput({
			updates: [{ $source: "other", values: [{ path: "test.value", value: 2 }] }],
		});

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("uses an update's $source ahead of structured source identity", () => {
		const callback = vi.fn(() => []);
		(
			manager as unknown as {
				conversions: Array<Record<string, unknown>>;
			}
		).conversions = [
			{
				title: "$source precedence",
				optionKey: "SOURCE_PRECEDENCE",
				category: "system",
				sourceType: SOURCE_TYPE.ON_DELTA,
				keys: ["test.value"],
				callback,
			},
		];
		manager.start({
			conversions: {
				SOURCE_PRECEDENCE: {
					enabled: true,
					resend: 0,
					sources: { "test.value": "preferred" },
					extras: {},
				},
			},
		} as unknown as PluginOptions);

		mock.pushDeltaInput({
			updates: [
				{
					$source: "preferred",
					source: { label: "other", type: "plugin" },
					values: [{ path: "test.value", value: 1 }],
				},
			],
		});
		mock.pushDeltaInput({
			updates: [
				{
					$source: "other",
					source: { label: "preferred", type: "plugin" },
					values: [{ path: "test.value", value: 2 }],
				},
			],
		});

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("notifications subscribe with policy:instant so bursts are not throttled", () => {
		manager.start({
			globalResendInterval: 0,
			NOTIFICATIONS: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		// A subscription should have been registered for notifications.
		expect(mock.subscriptionCallCount()).toBeGreaterThan(0);
		const sub = mock.firstSubscription() as {
			sourcePolicy?: string;
			subscribe: Array<{ policy?: string; period?: number }>;
		};
		expect(sub.sourcePolicy).toBe("all");
		expect(sub.subscribe.length).toBeGreaterThan(0);
		// Default Signal K subscribe period is 1000ms, which throttles alarm
		// bursts and can drop an alert. Events should subscribe with
		// policy:"instant" or period:0.
		const first = sub.subscribe[0];
		const instant = first?.policy === "instant" || first?.period === 0;
		expect(instant).toBe(true);
	});

	it("keeps accepted notification input for resend after self feedback", async () => {
		manager.start({
			globalResendInterval: 1,
			NOTIFICATIONS: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		const path = "notifications.navigation.anchor";
		mock.pushSubscription({
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					source: { label: "monitor", type: "plugin" },
					values: [{ path, value: { state: "alert", message: "Anchor alarm" } }],
				},
			],
		});
		await flush();
		expect(mock.emittedMessages).toHaveLength(2);

		mock.pushSubscription({
			context: "vessels.self",
			updates: [
				{
					$source: mockPlugin.id,
					source: { label: mockPlugin.id, type: "plugin" },
					values: [
						{
							path,
							value: { state: "alert", message: "Anchor alarm", alertId: 1 },
						},
					],
				},
			],
		});
		await flush();
		expect(mock.emittedMessages).toHaveLength(2);

		const storedInputs = [
			...(manager as unknown as { lastInputs: Map<unknown, unknown[]> }).lastInputs.values(),
		];
		expect(storedInputs).toHaveLength(1);
		expect(storedInputs[0]?.[0]).toMatchObject({ updates: [{ $source: "monitor" }] });

		vi.advanceTimersByTime(1000);
		await Promise.resolve();
		await Promise.resolve();
		expect(mock.emittedMessages).toHaveLength(4);
		expect(mock.emittedMessages.slice(-2).map((message) => message.pgn)).toEqual([126985, 126983]);
	});

	it("subscribes to Raymarine alarm base paths and their child wildcards", () => {
		manager.start({
			globalResendInterval: 0,
			RAYMARINE_ALARMS: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		const sub = mock.firstSubscription() as {
			sourcePolicy?: string;
			subscribe: Array<{ path?: string; policy?: string }>;
		};
		const paths = sub.subscribe.map(({ path }) => path);
		expect(sub.sourcePolicy).toBe("all");
		expect(paths).toContain("notifications.navigation.anchor");
		expect(paths).toContain("notifications.navigation.anchor.*");
		expect(paths).toContain("notifications.navigation.course.arrivalCircleEntered");
		expect(paths).toContain("notifications.navigation.arrivalCircleEntered");
		expect(paths).toContain("notifications.steering.autopilot.watchAlarm");
		expect(paths).toContain("notifications.steering.autopilot.watchAlarm.*");
		expect(sub.subscribe.every(({ policy }) => policy === "instant")).toBe(true);
	});

	it("keeps the last accepted Raymarine alarm available for resend after self feedback", async () => {
		manager.start({
			globalResendInterval: 1,
			RAYMARINE_ALARMS: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);
		const path = "notifications.navigation.anchor";
		const activeValue = { path, value: { state: "alarm", method: ["sound"] } };

		mock.pushSubscription({
			context: "vessels.self",
			updates: [{ $source: "monitor", values: [activeValue] }],
		});
		await flush();
		expect(mock.emittedMessages).toHaveLength(1);

		mock.pushSubscription({
			context: "vessels.self",
			updates: [
				{
					$source: mockPlugin.id,
					source: { label: mockPlugin.id, type: "plugin" },
					values: [{ ...activeValue, value: { state: "normal" } }],
				},
			],
		});
		await flush();
		expect(mock.emittedMessages).toHaveLength(1);

		const storedInputs = [
			...(manager as unknown as { lastInputs: Map<unknown, unknown[]> }).lastInputs.values(),
		];
		expect(storedInputs).toHaveLength(1);
		expect(storedInputs[0]?.[0]).toMatchObject({ updates: [{ $source: "monitor" }] });

		vi.advanceTimersByTime(1000);
		await Promise.resolve();
		await Promise.resolve();
		expect(mock.emittedMessages).toHaveLength(2);
		expect(mock.emittedMessages[1]).toMatchObject({
			pgn: 65288,
			fields: {
				alarmId: "Deep Anchor",
				alarmStatus: "Alarm condition met and not silenced",
			},
		});
	});

	it("enforces subscription publisher pins and preserves other values in the update", async () => {
		manager.start({
			globalResendInterval: 0,
			NOTIFICATIONS: {
				enabled: true,
				resend: 0,
				"notifications.navigation.anchor": "monitor-a",
			},
		} as unknown as PluginOptions);

		mock.pushSubscription({
			context: "vessels.self",
			updates: [
				{
					source: { label: "monitor-b", type: "plugin" },
					values: [
						{
							path: "notifications.navigation.anchor",
							value: { state: "alert", message: "Wrong publisher" },
						},
						{
							path: "notifications.mob",
							value: { state: "alert", message: "Unpinned publisher" },
						},
					],
				},
			],
		});
		await flush();

		expect(mock.emittedMessages).toHaveLength(2);
		expect(
			mock.emittedMessages.every(
				(message) => message.fields.alertTextDescription !== "Wrong publisher",
			),
		).toBe(true);

		const beforeMatching = mock.emittedMessages.length;
		mock.pushSubscription({
			context: "vessels.self",
			updates: [
				{
					source: { label: "monitor-a", type: "plugin" },
					values: [
						{
							path: "notifications.navigation.anchor",
							value: { state: "alert", message: "Matching publisher" },
						},
					],
				},
			],
		});
		await flush();
		expect(mock.emittedMessages.length).toBeGreaterThan(beforeMatching);
		expect(
			mock.emittedMessages.some(
				(message) => message.fields.alertTextDescription === "Matching publisher",
			),
		).toBe(true);
	});

	it("matches a pinned CAN source by its canonical canName identity", () => {
		const callback = vi.fn(() => []);
		(
			manager as unknown as {
				conversions: Array<Record<string, unknown>>;
			}
		).conversions = [
			{
				title: "CAN name subscription",
				optionKey: "CAN_NAME_TEST",
				category: "system",
				sourceType: SOURCE_TYPE.SUBSCRIPTION,
				keys: ["test.value"],
				allowNmea2000InputPaths: ["test.value"],
				callback,
			},
		];

		manager.start({
			globalResendInterval: 0,
			CAN_NAME_TEST: {
				enabled: true,
				resend: 0,
				"test.value": "gps24xd.0123456789abcdef",
			},
		} as unknown as PluginOptions);
		mock.pushSubscription({
			context: "vessels.self",
			updates: [
				{
					source: {
						label: "gps24xd",
						type: "NMEA2000",
						canName: "0123456789abcdef",
					},
					values: [{ path: "test.value", value: 1 }],
				},
			],
		});

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("runs the PGN list timer immediately at startup", async () => {
		manager.start({
			globalResendInterval: 0,
			PGN_LIST: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);
		await Promise.resolve();
		await Promise.resolve();

		expect(mock.emittedMessages.map((message) => message.pgn)).toEqual([126464]);
		expect(vi.getTimerCount()).toBe(1);
	});

	it("defers the initial PGN list until NMEA 2000 output becomes ready", async () => {
		const waitingManager = new PluginManager(mock.app, mockPlugin, () => false);
		waitingManager.start({
			globalResendInterval: 0,
			PGN_LIST: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);
		await Promise.resolve();
		expect(mock.emittedMessages).toEqual([]);

		expect(mock.trackedEventListenerCount()).toBe(0);
		waitingManager.notifyNmea2000Ready();
		await Promise.resolve();
		await Promise.resolve();
		expect(mock.emittedMessages.map((message) => message.pgn)).toEqual([126464]);
		waitingManager.stop();
	});

	it("reports an enabled factory conversion that produces no runnable mappings", () => {
		manager.start({
			globalResendInterval: 0,
			VESSEL_TRIP: { enabled: true, resend: 0, fuelTanks: [], engines: [] },
		} as unknown as PluginOptions);

		expect(mock.errorUpdates).toContainEqual(
			expect.stringContaining("1 enabled conversion could not be safely wired"),
		);
		expect(manager.getStatusSnapshot().enabledCount).toBe(0);
	});

	it("does not count an empty subscription as a runnable mapping", () => {
		(
			manager as unknown as {
				conversions: Array<{
					title: string;
					optionKey: string;
					sourceType: string;
					keys: string[];
					callback: () => N2KMessage[];
				}>;
			}
		).conversions = [
			{
				title: "Empty subscription",
				optionKey: "EMPTY_SUBSCRIPTION",
				sourceType: SOURCE_TYPE.SUBSCRIPTION,
				keys: [],
				callback: () => [],
			},
		];

		manager.start({
			globalResendInterval: 0,
			EMPTY_SUBSCRIPTION: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		expect(mock.subscriptionCallCount()).toBe(0);
		expect(manager.getStatusSnapshot().enabledCount).toBe(0);
		expect(mock.loggedErrors).toContainEqual(expect.stringContaining("has no input paths"));
	});

	it("reports a partially invalid factory while retaining its runnable child", () => {
		(
			manager as unknown as {
				conversions: Array<Record<string, unknown>>;
			}
		).conversions = [
			{
				title: "Partial factory",
				optionKey: "PARTIAL_FACTORY",
				category: "system",
				sourceType: SOURCE_TYPE.ON_DELTA,
				conversions: [{ callback: () => [] }, undefined],
			},
		];

		manager.start({
			globalResendInterval: 0,
			PARTIAL_FACTORY: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		const internal = manager as unknown as {
			deltaConversions: Array<{ conversion: { sourceType?: string } }>;
		};
		expect(internal.deltaConversions).toHaveLength(1);
		expect(internal.deltaConversions[0]?.conversion.sourceType).toBe(SOURCE_TYPE.ON_DELTA);
		expect(manager.getStatusSnapshot().enabledCount).toBe(1);
		expect(mock.errorUpdates).toContainEqual(
			expect.stringContaining("1 enabled conversion could not be safely wired"),
		);
	});

	it("keeps the real wind producer when a conflicting weather producer is configured", () => {
		manager.start({
			globalResendInterval: 0,
			WIND: { enabled: true, resend: 0 },
			WIND_WEATHER_APPARENT: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		expect(mock.streamListenerCount()).toBe(2);
		expect(manager.getStatusSnapshot().enabledCount).toBe(1);
		expect(mock.errorUpdates).toContainEqual(
			expect.stringContaining("1 enabled conversion could not be safely wired"),
		);
		expect(mock.loggedErrors).toContainEqual(
			expect.stringContaining("Not enabling WIND_WEATHER_APPARENT"),
		);
	});

	it("blocks forecast true wind when real apparent wind is configured", () => {
		manager.start({
			globalResendInterval: 0,
			WIND: { enabled: true, resend: 0 },
			WIND_WEATHER_TRUE: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		expect(mock.streamListenerCount()).toBe(2);
		expect(manager.getStatusSnapshot().enabledCount).toBe(1);
		expect(mock.errorUpdates).toContainEqual(
			expect.stringContaining("1 enabled conversion could not be safely wired"),
		);
		expect(mock.loggedErrors).toContainEqual(
			expect.stringContaining("Not enabling WIND_WEATHER_TRUE"),
		);
	});

	it("rethrows startup failures after cleanup", () => {
		(mock.app.streambundle as unknown as { getSelfBus: (path: string) => unknown }).getSelfBus =
			() => {
				throw new Error("stream unavailable");
			};

		expect(() =>
			manager.start({
				globalResendInterval: 0,
				WIND: { enabled: true, resend: 0 },
			} as unknown as PluginOptions),
		).toThrow("stream unavailable");
		expect(mock.errorUpdates).toContainEqual(expect.stringContaining("Startup failed"));
		expect(mock.streamListenerCount()).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stops resending wind after its paired inputs expire", async () => {
		manager.start({
			globalResendInterval: 1,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);
		mock.pushStream("environment.wind.angleApparent", { value: 1.5 });
		mock.pushStream("environment.wind.speedApparent", { value: 2 });
		await flush();
		expect(mock.emittedMessages).toHaveLength(1);

		vi.advanceTimersByTime(9000);
		await Promise.resolve();
		await Promise.resolve();
		const beforeExpiry = mock.emittedMessages.length;
		expect(beforeExpiry).toBeGreaterThan(1);

		vi.advanceTimersByTime(2000);
		await Promise.resolve();
		await Promise.resolve();
		expect(mock.emittedMessages).toHaveLength(beforeExpiry);
	});

	it("does not recombine expired forecast wind with a fresh NMEA heading", async () => {
		manager.start({
			globalResendInterval: 0,
			WIND_WEATHER_TRUE: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);

		mock.pushStream("environment.wind.directionTrue", {
			value: 2.1,
			$source: "signalk-virtual-weather-sensors",
			source: { label: "signalk-virtual-weather-sensors", type: "plugin" },
		});
		mock.pushStream("environment.wind.speedOverGround", {
			value: 3.2,
			$source: "signalk-virtual-weather-sensors",
			source: { label: "signalk-virtual-weather-sensors", type: "plugin" },
		});
		mock.pushStream("navigation.headingTrue", {
			value: 0.4,
			$source: "can0.23",
			source: { label: "can0", type: "NMEA2000", pgn: 127250, src: 23 },
		});
		await flush();
		expect(mock.emittedMessages).toHaveLength(1);

		vi.setSystemTime(new Date(Date.now() + WEATHER_DATA_TIMEOUT_MS + 1));
		mock.pushStream("navigation.headingTrue", {
			value: 0.5,
			$source: "can0.23",
			source: { label: "can0", type: "NMEA2000", pgn: 127250, src: 23 },
		});
		await flush();

		expect(mock.emittedMessages).toHaveLength(1);
	});

	it("keeps forecast ground wind fresh across a sixty-second source cadence", async () => {
		manager.start({
			globalResendInterval: 5,
			WIND_TRUE_GROUND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);
		mock.pushStream("environment.wind.directionTrue", {
			value: 2.1,
			$source: "signalk-virtual-weather-sensors",
			source: { label: "signalk-virtual-weather-sensors", type: "plugin" },
		});
		mock.pushStream("environment.wind.speedOverGround", {
			value: 3.2,
			$source: "signalk-virtual-weather-sensors",
			source: { label: "signalk-virtual-weather-sensors", type: "plugin" },
		});
		await flush();
		const initialEmits = mock.emittedMessages.length;

		vi.advanceTimersByTime(60_000);
		await Promise.resolve();
		await Promise.resolve();

		expect(mock.emittedMessages.length).toBeGreaterThan(initialEmits);
		expect(mock.emittedMessages.at(-1)).toMatchObject({
			pgn: 130306,
			fields: {
				windSpeed: 3.2,
				reference: "True (ground referenced to North)",
			},
		});
		expect(mock.emittedMessages.at(-1)?.fields.windAngle).toBeCloseTo(2.1);
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

		mock.pushStream("tanks.fuel.reserve_1.currentLevel", {
			value: 0.5,
			$source: "can0.12",
			source: { type: "NMEA2000", pgn: 127505, src: 12 },
		});
		mock.pushStream("tanks.fuel.reserve_1.capacity", {
			value: 0.1,
			$source: "can0.12",
			source: { type: "NMEA2000", pgn: 127505, src: 12 },
		});
		mock.pushStream("propulsion.main.fuel.rate", {
			value: 0.00001,
			$source: "can0.13",
			source: { type: "NMEA2000", pgn: 127489, src: 13 },
		});
		mock.pushStream("navigation.speedOverGround", {
			value: 2,
			$source: "can0.14",
			source: { type: "NMEA2000", pgn: 129026, src: 14 },
		});
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
		mock.pushStream("tanks.fuel.reserve_1.currentLevel", {
			value: 0.4,
			$source: "can0.12",
			source: { type: "NMEA2000", pgn: 127505, src: 12 },
		});
		mock.pushStream("propulsion.main.fuel.rate", {
			value: 0.00001,
			$source: "can0.13",
			source: { type: "NMEA2000", pgn: 127489, src: 13 },
		});
		mock.pushStream("navigation.speedOverGround", {
			value: 2,
			$source: "can0.14",
			source: { type: "NMEA2000", pgn: 129026, src: 14 },
		});
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

		// A value arriving after stop() must not produce any new emit, even if
		// an upstream stream did not unsubscribe cleanly. The stopped flag also
		// neutralizes callbacks already in flight during teardown.
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

	it("retains exactly one wrapped-emitter callback across manager replacements", () => {
		const mock = createMockSignalKApp();
		(mock.app as { isNmea2000OutAvailable?: boolean }).isNmea2000OutAvailable = true;
		const plugin = createPlugin(mock.app);
		const options = {
			globalResendInterval: 0,
			WIND: { enabled: true, resend: 0 },
		} as unknown as PluginOptions;

		// createPlugin owns one readiness listener for the plugin object lifetime.
		// Replacing the manager must not add callbacks to Signal K's actor-id tracker.
		expect(mock.eventListenerCount()).toBe(1);
		expect(mock.trackedEventListenerCount()).toBe(1);
		for (let index = 0; index < 3; index++) {
			plugin.start(options, () => {});
			expect(mock.eventListenerCount()).toBe(1);
			expect(mock.trackedEventListenerCount()).toBe(1);
		}

		plugin.stop();
	});

	it("retains the sole readiness listener across a host stop and restart", async () => {
		const mock = createMockSignalKApp();
		const plugin = createPlugin(mock.app);
		const options = {
			globalResendInterval: 0,
			PGN_LIST: { enabled: true, resend: 0 },
		} as unknown as PluginOptions;

		plugin.start(options, () => {});
		await Promise.resolve();
		expect(mock.emittedMessages).toEqual([]);
		expect(mock.eventListenerCount()).toBe(1);
		expect(mock.trackedEventListenerCount()).toBe(1);

		// Signal K unregisters resources returned through its plugin
		// onStopHandlers. Plugin-bound app.on callbacks are not in that list, so
		// the same factory listener remains when this plugin object is restarted.
		plugin.stop();

		plugin.start(options, () => {});
		expect(mock.eventListenerCount()).toBe(1);
		expect(mock.trackedEventListenerCount()).toBe(1);

		mock.fireEvent("nmea2000OutAvailable");
		await Promise.resolve();
		await Promise.resolve();
		expect(mock.emittedMessages.map((message) => message.pgn)).toEqual([126464]);

		plugin.stop();
	});

	it("routes the host readiness event to the active manager and flushes immediate timers", async () => {
		const mock = createMockSignalKApp();
		const plugin = createPlugin(mock.app);
		plugin.start(
			{
				globalResendInterval: 0,
				PGN_LIST: { enabled: true, resend: 0 },
			} as unknown as PluginOptions,
			() => {},
		);
		await Promise.resolve();
		expect(mock.emittedMessages).toEqual([]);

		mock.fireEvent("nmea2000OutAvailable");
		await Promise.resolve();
		await Promise.resolve();

		expect(mock.emittedMessages.map((message) => message.pgn)).toEqual([126464]);
		expect(mock.trackedEventListenerCount()).toBe(1);
		plugin.stop();
	});

	it("re-registers the delta input handler after a Signal K host restart", async () => {
		const mock = createMockSignalKApp();
		(mock.app as { isNmea2000OutAvailable?: boolean }).isNmea2000OutAvailable = true;
		(mock.app as { selfId?: string }).selfId = "urn:mrn:imo:mmsi:111222333";
		const plugin = createPlugin(mock.app);
		const options = {
			globalResendInterval: 0,
			AIS: { enabled: true, resend: 0 },
		} as unknown as PluginOptions;

		const pushTarget = (mmsi: string, longitude: number): void => {
			mock.pushDeltaInput({
				context: `vessels.urn:mrn:imo:mmsi:${mmsi}`,
				updates: [
					{
						$source: "ais-provider",
						source: { label: "ais-provider", type: "plugin" },
						values: [
							{ path: "mmsi", value: mmsi },
							{ path: "sensors.ais.class", value: "A" },
							{
								path: "navigation.position",
								value: { longitude, latitude: 39.12 },
							},
						],
					},
				],
			});
		};

		plugin.start(options, () => {});
		expect(mock.deltaInputHandlerCount()).toBe(1);
		pushTarget("367301250", -76.39);
		await Promise.resolve();
		await Promise.resolve();
		expect(mock.emittedMessages).toHaveLength(1);

		// Signal K unregisters delta handlers before calling plugin.stop().
		mock.clearDeltaInputHandlers();
		plugin.stop();
		plugin.start(options, () => {});
		expect(mock.deltaInputHandlerCount()).toBe(1);
		pushTarget("367301251", -76.38);
		await Promise.resolve();
		await Promise.resolve();
		expect(mock.emittedMessages).toHaveLength(2);

		mock.clearDeltaInputHandlers();
		plugin.stop();
	});

	it("factory delta handler forwards before processing and forwards once on failure", () => {
		const mock = createMockSignalKApp();
		(mock.app as { isNmea2000OutAvailable?: boolean }).isNmea2000OutAvailable = true;
		const plugin = createPlugin(mock.app);
		plugin.start(
			{
				globalResendInterval: 0,
				AIS: { enabled: true, resend: 0 },
			} as unknown as PluginOptions,
			() => {},
		);

		const order: string[] = [];
		(mock.app as unknown as { getPath: () => unknown }).getPath = () => {
			order.push("process");
			throw new Error("forced source lookup failure");
		};
		mock.pushDeltaInput(
			{
				updates: [{ values: [{ path: "navigation.position", value: {} }] }],
			},
			() => order.push("next"),
		);

		expect(order).toEqual(["next", "process"]);
		expect(mock.loggedErrors).toContainEqual(
			expect.stringContaining("Unable to process delta input: forced source lookup failure"),
		);
		plugin.stop();
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
