import { describe, expect, it } from "vitest";
import { buildConversionMetadata, resolveConfiguredPaths } from "../api/conversion-metadata.js";
import type { ConversionModule, ConversionOptions } from "../types/index.js";

const configured: ConversionOptions = {
	enabled: true,
	devices: [{ id: "house" }, { id: "start" }],
};

const dynamicConversion: ConversionModule = {
	title: "Dynamic test (PGN 1)",
	optionKey: "DYNAMIC",
	category: "electrical",
	keys: (options) => [
		`electrical.summary.${String((options.devices as Array<{ id: string }>)[0]?.id)}`,
	],
	conversions: (options) =>
		(options.devices as Array<{ id: string }>).map((device) => ({
			keys: [`electrical.devices.${device.id}.voltage`, `electrical.devices.${device.id}.current`],
		})),
};

describe("resolveConfiguredPaths", () => {
	it("expands configured factory paths without invoking conversion callbacks", () => {
		expect(resolveConfiguredPaths(dynamicConversion, configured)).toEqual([
			"electrical.summary.house",
			"electrical.devices.house.voltage",
			"electrical.devices.house.current",
			"electrical.devices.start.voltage",
			"electrical.devices.start.current",
		]);
	});

	it("does not invent paths when a dynamic conversion has no options", () => {
		expect(resolveConfiguredPaths(dynamicConversion)).toEqual([]);
	});

	it("deduplicates parent and child declarations in stable order", () => {
		const conversion: ConversionModule = {
			title: "Static test (PGN 2)",
			optionKey: "STATIC",
			category: "system",
			keys: ["navigation.speedOverGround"],
			conversions: [{ keys: ["navigation.speedOverGround", "navigation.courseOverGroundTrue"] }],
		};

		expect(resolveConfiguredPaths(conversion)).toEqual([
			"navigation.speedOverGround",
			"navigation.courseOverGroundTrue",
		]);
	});
});

describe("buildConversionMetadata configured paths", () => {
	it("uses the matching option set to expose dynamic Signal K inputs", () => {
		const [metadata] = buildConversionMetadata([dynamicConversion], {
			DYNAMIC: configured,
		});

		expect(metadata?.paths).toContain("electrical.devices.house.voltage");
		expect(metadata?.paths).toContain("electrical.devices.start.current");
	});

	it("retains the safe empty-path fallback without configured options", () => {
		const [metadata] = buildConversionMetadata([dynamicConversion]);
		expect(metadata?.paths).toEqual([]);
	});
});
