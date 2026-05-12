import { describe, expect, it } from "vitest";
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
		signalk: { on: () => {} },
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
});
