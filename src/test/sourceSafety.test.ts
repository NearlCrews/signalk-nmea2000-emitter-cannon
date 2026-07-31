import type { NormalizedDelta } from "@signalk/server-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RootConfig } from "../config/schema.js";
import { PluginManager } from "../plugin-manager.js";
import type { N2KMessage, PluginOptions, SignalKApp, SignalKPlugin } from "../types/index.js";

interface TestBus {
	filter(predicate: (value: NormalizedDelta) => boolean): TestBus;
	onValue(callback: (value: NormalizedDelta) => void): () => void;
	push(value: NormalizedDelta): void;
}

function createBus(): TestBus {
	const predicates: Array<(value: NormalizedDelta) => boolean> = [];
	const listeners = new Set<(value: NormalizedDelta) => void>();
	const bus: TestBus = {
		filter(predicate) {
			predicates.push(predicate);
			return bus;
		},
		onValue(callback) {
			const wrapped = (value: NormalizedDelta) => {
				if (predicates.every((predicate) => predicate(value))) callback(value);
			};
			listeners.add(wrapped);
			return () => listeners.delete(wrapped);
		},
		push(value) {
			for (const listener of listeners) listener(value);
		},
	};
	return bus;
}

function normalizedDepth(value: number, $source: string, type?: string): NormalizedDelta {
	return normalizedValue("environment.depth.belowTransducer", value, $source, type);
}

function normalizedValue(
	path: string,
	value: number,
	$source: string,
	type?: string,
): NormalizedDelta {
	return {
		context: "vessels.self",
		path,
		value,
		$source,
		source: type === undefined ? undefined : { label: $source, type },
		timestamp: "2026-07-22T12:00:00.000Z",
		isMeta: false,
	} as NormalizedDelta;
}

function structuredN2kDepth(value: number): NormalizedDelta {
	return {
		...normalizedDepth(value, "unlisted-can-source.42"),
		source: { label: "unlisted-can-source", src: "42", pgn: 128267 },
	} as NormalizedDelta;
}

async function flushStream(): Promise<void> {
	vi.advanceTimersByTime(11);
	await Promise.resolve();
	await Promise.resolve();
}

describe("PluginManager stream source safety", () => {
	let manager: PluginManager;
	let depthBus: TestBus;
	let windDirectionBus: TestBus;
	let headingBus: TestBus;
	let windSpeedBus: TestBus;
	let emitted: N2KMessage[];

	beforeEach(() => {
		vi.useFakeTimers();
		depthBus = createBus();
		windDirectionBus = createBus();
		headingBus = createBus();
		windSpeedBus = createBus();
		emitted = [];
		const debug = Object.assign(() => {}, { enabled: false });
		const app = {
			debug,
			error: () => {},
			setPluginStatus: () => {},
			setPluginError: () => {},
			getSelfPath: () => undefined,
			getPath: (path: string) =>
				path === "sources"
					? {
							can0: { type: "NMEA2000" },
							"venus.com.victronenergy.temperature": { type: "plugin" },
						}
					: undefined,
			streambundle: {
				getSelfBus: (path: string) => {
					if (path === "environment.depth.belowTransducer") return depthBus;
					if (path === "environment.wind.directionTrue") return windDirectionBus;
					if (path === "navigation.headingTrue") return headingBus;
					if (path === "environment.wind.speedOverGround") return windSpeedBus;
					return createBus();
				},
			},
			subscriptionmanager: { subscribe: () => {} },
			on: () => app,
			removeListener: () => app,
			emit: (event: string, message: N2KMessage) => {
				if (event === "nmea2000JsonOut") emitted.push(message);
				return true;
			},
			reportOutputMessages: () => {},
			registerDeltaInputHandler: () => {},
		} as unknown as SignalKApp;
		const plugin: SignalKPlugin = {
			id: "signalk-nmea2000-emitter-cannon",
			name: "Test Plugin",
			description: "Test plugin",
			schema: () => RootConfig,
			start: () => {},
			stop: () => {},
		};
		manager = new PluginManager(app, plugin, () => true);
		manager.start({
			globalResendInterval: 0,
			DEPTH: { enabled: true, resend: 0 },
			WIND_WEATHER_TRUE: { enabled: true, resend: 0 },
		} as unknown as PluginOptions);
	});

	afterEach(() => {
		manager.stop();
		vi.useRealTimers();
	});

	it("drops known NMEA 2000 input but accepts a numeric-suffix plugin source", async () => {
		depthBus.push(normalizedDepth(4.2, "can0.42", "NMEA2000"));
		await flushStream();
		expect(emitted).toEqual([]);

		// The structured source may be absent on some stream producers. The
		// authoritative server sources tree still identifies this as NMEA 2000.
		depthBus.push(normalizedDepth(4.3, "can0.0123456789abcdef"));
		await flushStream();
		expect(emitted).toEqual([]);

		depthBus.push(normalizedDepth(4.4, "venus.com.victronenergy.temperature.24", "plugin"));
		await flushStream();
		expect(emitted).toHaveLength(1);
		expect(emitted[0]?.pgn).toBe(128267);
	});

	it("drops structured NMEA 2000 input when the source type is omitted", async () => {
		depthBus.push(structuredN2kDepth(5.1));
		await flushStream();
		expect(emitted).toEqual([]);
	});

	it("allows NMEA 2000 heading as a declared supporting input for derived true wind", async () => {
		windDirectionBus.push(
			normalizedValue("environment.wind.directionTrue", 2.1, "vws-merged", "plugin"),
		);
		windSpeedBus.push(
			normalizedValue("environment.wind.speedOverGround", 3.2, "vws-merged", "plugin"),
		);
		headingBus.push(
			normalizedValue("navigation.headingTrue", 0.4, "nmea2000_feed.c07891031cb845c6", "NMEA2000"),
		);
		await flushStream();

		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({
			pgn: 130306,
			fields: {
				windSpeed: 3.2,
				reference: "True (boat referenced)",
			},
		});
		expect(emitted[0]?.fields.windAngle).toBeCloseTo(1.7);
	});
});
