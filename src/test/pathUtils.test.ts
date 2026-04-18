/**
 * pathUtils tests.
 *
 * Implements plan item L2: pathToPropName() collapses dots and could
 * theoretically collide for two distinct Signal K paths. Walk every key
 * across every conversion module and assert no collisions exist today.
 *
 * If two paths *do* collide in the future, the implementation needs to
 * change (e.g. switch the separator to `_` or hash) — this test guards
 * the registry against silently regressing into that state.
 */

import { describe, expect, it } from "vitest";
import { createConversionModules } from "../conversions/index.js";
import { schema } from "../schema.js";
import type { SignalKApp, SignalKPlugin } from "../types/index.js";
import { pathToPropName } from "../utils/pathUtils.js";

/* Minimal mock app — pathUtils only needs the conversion factories to run.
 * They're called purely to harvest the `keys` arrays; no streams fire. */
const mockApp: SignalKApp = {
	getSelfPath: () => undefined,
	getPath: () => undefined,
	debug: () => {},
	error: () => {},
	emit: () => {},
	on: () => {},
	removeListener: () => {},
	streambundle: {
		getSelfBus: () => ({
			value: null,
			map: () => ({}) as unknown,
			filter: () => ({}) as unknown,
			onValue: () => () => {},
		}),
	},
	subscriptionmanager: { subscribe: () => {} },
	signalk: { on: () => {} },
} as unknown as SignalKApp;

const mockPlugin: SignalKPlugin = {
	id: "signalk-nmea2000-emitter-cannon",
	name: "Test Plugin",
	description: "Test plugin",
	schema: () => schema,
	start: () => {},
	stop: () => {},
};

describe("pathToPropName", () => {
	it("collapses dots in a Signal K path", () => {
		expect(pathToPropName("environment.wind.angleApparent")).toBe(
			"environmentwindangleApparent",
		);
		expect(pathToPropName("a.b.c")).toBe("abc");
		expect(pathToPropName("noDots")).toBe("noDots");
	});

	it("does not produce duplicate propnames for any registered Signal K path", () => {
		// See plan item L2: collisions would cause two distinct Signal K paths
		// to map onto the same per-conversion source-filter option key, silently
		// crossing source-filter configuration between paths.
		const conversions = createConversionModules(mockApp, mockPlugin);

		const allPaths = new Set<string>();
		for (const conversion of conversions) {
			const conversionArray = Array.isArray(conversion)
				? conversion
				: [conversion];
			for (const conv of conversionArray) {
				if (Array.isArray(conv.keys)) {
					for (const key of conv.keys) allPaths.add(key);
				}

				// Also walk subconversions — a conversion can override or extend
				// keys via its `conversions` array. We can't safely call the
				// function form here without realistic options, so we only walk
				// the static array form (which is the common case).
				const subs = conv.conversions;
				if (Array.isArray(subs)) {
					for (const sub of subs) {
						if (Array.isArray(sub.keys)) {
							for (const key of sub.keys) allPaths.add(key);
						}
					}
				}
			}
		}

		// Map every distinct path through pathToPropName and look for collisions.
		const propToPaths = new Map<string, string[]>();
		for (const path of allPaths) {
			const prop = pathToPropName(path);
			const existing = propToPaths.get(prop) ?? [];
			existing.push(path);
			propToPaths.set(prop, existing);
		}

		const collisions = Array.from(propToPaths.entries())
			.filter(([, paths]) => paths.length > 1)
			.map(([prop, paths]) => ({ prop, paths }));

		expect(
			collisions,
			`pathToPropName collisions detected: ${JSON.stringify(collisions, null, 2)}`,
		).toEqual([]);
	});
});
