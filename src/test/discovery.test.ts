import { describe, expect, it } from "vitest";
import {
	enumerateActivePaths,
	enumerateSourcesForPath,
} from "../api/discovery.js";
import type { SignalKApp } from "../types/index.js";

function mockApp(
	paths: string[],
	sourcesTree: Record<string, unknown> | undefined,
): SignalKApp {
	return {
		streambundle: { getAvailablePaths: () => paths },
		getPath: (p: string) =>
			p === "/sources" ? (sourcesTree as unknown) : undefined,
	} as unknown as SignalKApp;
}

describe("enumerateActivePaths", () => {
	it("returns sorted unique paths", () => {
		const app = mockApp(["b", "a", "a"], {});
		expect(enumerateActivePaths(app)).toEqual(["a", "b"]);
	});
	it("returns empty when no paths published", () => {
		const app = mockApp([], {});
		expect(enumerateActivePaths(app)).toEqual([]);
	});
});

describe("enumerateSourcesForPath", () => {
	it("walks the /sources tree and collects source labels that have the target path", () => {
		const tree = {
			nmea0183: {
				II: { navigation: { position: {} } },
			},
			"derived-data": { navigation: { position: {} } },
			gps1: { navigation: { headingTrue: {} } },
		};
		const app = mockApp([], tree);
		const sources = enumerateSourcesForPath(app, "navigation.position");
		expect(sources).toContain("nmea0183.II");
		expect(sources).toContain("derived-data");
		expect(sources).not.toContain("gps1");
	});
	it("returns empty when /sources is missing", () => {
		const app = mockApp([], undefined);
		expect(enumerateSourcesForPath(app, "x")).toEqual([]);
	});
});
