import { describe, expect, it } from "vitest";
import { enumerateActivePaths, enumerateSourcesForPath } from "../api/discovery.js";
import type { SignalKApp } from "../types/index.js";

function mockPathsApp(paths: string[]): SignalKApp {
	return {
		streambundle: { getAvailablePaths: () => paths },
		getSelfPath: () => undefined,
	} as unknown as SignalKApp;
}

function mockApp(pathToValue: Record<string, unknown>): SignalKApp {
	return {
		streambundle: { getAvailablePaths: () => [] },
		getSelfPath: (p: string) => pathToValue[p],
	} as unknown as SignalKApp;
}

describe("enumerateActivePaths", () => {
	it("returns sorted unique paths", () => {
		const app = mockPathsApp(["b", "a", "a"]);
		expect(enumerateActivePaths(app)).toEqual(["a", "b"]);
	});
	it("returns empty when no paths published", () => {
		const app = mockPathsApp([]);
		expect(enumerateActivePaths(app)).toEqual([]);
	});
});

describe("enumerateSourcesForPath", () => {
	it("returns sorted dedup of $source plus values keys (multi-source)", () => {
		const app = mockApp({
			"navigation.position": {
				$source: "sim7600x_feed.GP",
				values: {
					"nmea2000_feed.c078be001cb01cc9": { value: {} },
					"sim7600x_feed.GP": { value: {} },
				},
			},
		});
		expect(enumerateSourcesForPath(app, "navigation.position")).toEqual([
			"nmea2000_feed.c078be001cb01cc9",
			"sim7600x_feed.GP",
		]);
	});
	it("returns single $source when path has no values map", () => {
		const app = mockApp({
			"electrical.batteries.x.capacity.stateOfCharge": {
				$source: "ConsoleBattery",
				value: 0.63,
			},
		});
		expect(enumerateSourcesForPath(app, "electrical.batteries.x.capacity.stateOfCharge")).toEqual([
			"ConsoleBattery",
		]);
	});
	it("returns empty when path is missing from the model", () => {
		expect(enumerateSourcesForPath(mockApp({}), "nope.nope")).toEqual([]);
	});
	it("returns empty for empty path", () => {
		expect(enumerateSourcesForPath(mockApp({}), "")).toEqual([]);
	});
	it("ignores empty-string $source", () => {
		const app = mockApp({
			"foo.bar": {
				$source: "",
				values: { "real-source": { value: 1 } },
			},
		});
		expect(enumerateSourcesForPath(app, "foo.bar")).toEqual(["real-source"]);
	});
});
