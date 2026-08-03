import { describe, expect, it } from "vitest";
import type { ConversionConfig } from "../config/schema.js";
import { validateConfig } from "../config/validation.js";

function conversion(enabled: boolean, extras: Record<string, unknown>): ConversionConfig {
	return { enabled, resend: 0, sources: {}, extras };
}

describe("configuration validation", () => {
	it("blocks competing apparent and true-wind display producers", () => {
		const issues = validateConfig({
			conversions: {
				WIND: conversion(true, {}),
				WIND_WEATHER_APPARENT: conversion(true, {}),
				WIND_TRUE: conversion(true, {}),
				WIND_WEATHER_TRUE: conversion(true, {}),
			},
		});

		expect(issues).toEqual([
			expect.objectContaining({
				severity: "error",
				conversionKey: "WIND_WEATHER_APPARENT",
				field: "enabled",
			}),
			expect.objectContaining({
				severity: "error",
				conversionKey: "WIND_WEATHER_TRUE",
				field: "enabled",
			}),
		]);
	});

	it("accepts the two forecast compatibility producers together", () => {
		const issues = validateConfig({
			conversions: {
				WIND: conversion(false, {}),
				WIND_WEATHER_APPARENT: conversion(true, {}),
				WIND_TRUE: conversion(false, {}),
				WIND_WEATHER_TRUE: conversion(true, {}),
			},
		});

		expect(issues).toEqual([]);
	});

	it.each([
		["WIND", "WIND_WEATHER_TRUE"],
		["WIND_TRUE", "WIND_WEATHER_APPARENT"],
	])("blocks cross-reference real and forecast producers: %s with %s", (real, forecast) => {
		const issues = validateConfig({
			conversions: {
				[real]: conversion(true, {}),
				[forecast]: conversion(true, {}),
			},
		});

		expect(issues).toEqual([
			expect.objectContaining({
				severity: "error",
				conversionKey: forecast,
				field: "enabled",
			}),
		]);
	});

	it("blocks an enabled factory conversion without a mapping", () => {
		const issues = validateConfig({
			conversions: { BATTERY: conversion(true, {}) },
		});

		expect(issues).toEqual([
			expect.objectContaining({
				severity: "error",
				conversionKey: "BATTERY",
				field: "batteries",
			}),
		]);
	});

	it("keeps invalid draft rows on disabled conversions non-blocking", () => {
		const issues = validateConfig({
			conversions: {
				BATTERY: conversion(false, {
					batteries: [{ signalkId: "not.a.segment", instanceId: 0 }],
				}),
			},
		});

		expect(issues).toHaveLength(1);
		expect(issues[0]?.severity).toBe("warning");
	});

	it("accepts established numeric and hyphenated Signal K instance ids", () => {
		const issues = validateConfig({
			conversions: {
				BATTERY: conversion(true, {
					batteries: [
						{ signalkId: "258-second", instanceId: 1 },
						{ signalkId: 24, instanceId: 2 },
					],
				}),
			},
		});

		expect(issues).toEqual([]);
	});

	it("rejects duplicate ids, duplicate instances, and reserved instance bytes", () => {
		const issues = validateConfig({
			conversions: {
				BATTERY: conversion(true, {
					batteries: [
						{ signalkId: "house", instanceId: 253 },
						{ signalkId: "house", instanceId: 253 },
					],
				}),
			},
		});

		expect(issues.map((issue) => issue.field)).toEqual([
			"instanceId",
			"signalkId",
			"instanceId",
			"instanceId",
		]);
		expect(issues.every((issue) => issue.severity === "error")).toBe(true);
	});

	it("requires complete AC input mapping semantics", () => {
		const issues = validateConfig({
			conversions: {
				AC_STATUS: conversion(true, {
					acSources: [
						{
							signalkId: "shore",
							instanceId: 0,
							direction: "input",
							phaseMode: "single",
						},
					],
				}),
			},
		});

		expect(issues).toEqual([
			expect.objectContaining({ field: "acceptability", rowIndex: 0, severity: "error" }),
		]);
	});

	it("validates tank semantics for tank status and vessel range", () => {
		const issues = validateConfig({
			conversions: {
				TANKS: conversion(true, {
					tanks: [{ signalkPath: "tanks.unknown.0", instanceId: 14 }],
				}),
				VESSEL_TRIP: conversion(true, {
					fuelTanks: [{ signalkPath: "tanks.freshWater.0" }],
					engines: [],
				}),
			},
		});

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					conversionKey: "TANKS",
					collection: "tanks",
					field: "signalkPath",
				}),
				expect.objectContaining({ conversionKey: "TANKS", field: "instanceId" }),
				expect.objectContaining({
					conversionKey: "VESSEL_TRIP",
					collection: "fuelTanks",
					field: "signalkPath",
				}),
			]),
		);
	});

	it("validates environmental instances and source enums", () => {
		const issues = validateConfig({
			conversions: {
				TEMPERATURE2_SEA: conversion(true, { instance: 1.5, n2kSource: "Sea-ish" }),
				HUMIDITY_OUTSIDE: conversion(true, { n2kSource: "Damp" }),
			},
		});

		expect(issues.map((issue) => [issue.conversionKey, issue.field])).toEqual([
			["TEMPERATURE2_SEA", "instance"],
			["TEMPERATURE2_SEA", "n2kSource"],
			["HUMIDITY_OUTSIDE", "n2kSource"],
		]);
	});

	it("rejects a Signal K path entered as its own publisher filter", () => {
		const enabled = conversion(true, {});
		enabled.sources = {
			"environment.water.temperature": "environment.water.temperature",
		};
		const disabledLegacyKey = conversion(false, {});
		disabledLegacyKey.sources = {
			environmentwatertemperature: "environment.water.temperature",
		};

		const issues = validateConfig({
			conversions: {
				TEMPERATURE_SEA: enabled,
				TEMPERATURE2_SEA: disabledLegacyKey,
			},
		});

		expect(issues).toEqual([
			expect.objectContaining({
				severity: "error",
				conversionKey: "TEMPERATURE_SEA",
				field: "source",
				inputPath: "environment.water.temperature",
			}),
			expect.objectContaining({
				severity: "warning",
				conversionKey: "TEMPERATURE2_SEA",
				field: "source",
				inputPath: "environment.water.temperature",
			}),
		]);
	});

	it("rejects duplicate exhaust temperature and Solar PGN 127508 identities", () => {
		const issues = validateConfig({
			conversions: {
				EXHAUST_TEMPERATURE: conversion(true, {
					engines: [
						{ signalkId: "port", tempInstanceId: 7 },
						{ signalkId: "starboard", tempInstanceId: 7 },
					],
				}),
				SOLAR: conversion(true, {
					chargers: [
						{ signalkId: "roof", instanceId: 10, panelInstanceId: 10 },
						{ signalkId: "bimini", instanceId: 11, panelInstanceId: 12 },
						{ signalkId: "arch", instanceId: 13, panelInstanceId: 12 },
					],
				}),
			},
		});

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					conversionKey: "EXHAUST_TEMPERATURE",
					field: "tempInstanceId",
					rowIndex: 1,
					severity: "error",
				}),
				expect.objectContaining({
					conversionKey: "SOLAR",
					field: "panelInstanceId",
					rowIndex: 0,
					severity: "error",
				}),
				expect.objectContaining({
					conversionKey: "SOLAR",
					field: "panelInstanceId",
					rowIndex: 2,
					severity: "error",
				}),
			]),
		);
		expect(issues).toHaveLength(3);
	});

	it("checks the PGN 127508 identity namespace across battery and solar output", () => {
		const bothEnabled = validateConfig({
			conversions: {
				BATTERY: conversion(true, {
					batteries: [{ signalkId: "house", instanceId: 4 }],
				}),
				SOLAR: conversion(true, {
					chargers: [{ signalkId: "roof", instanceId: 4, panelInstanceId: 5 }],
				}),
			},
		});
		expect(bothEnabled).toEqual([
			expect.objectContaining({
				conversionKey: "SOLAR",
				field: "instanceId",
				severity: "error",
			}),
		]);

		const disabledBattery = validateConfig({
			conversions: {
				BATTERY: conversion(false, {
					batteries: [{ signalkId: "house", instanceId: 4 }],
				}),
				SOLAR: conversion(true, {
					chargers: [{ signalkId: "roof", instanceId: 4, panelInstanceId: 5 }],
				}),
			},
		});
		expect(disabledBattery).toEqual([
			expect.objectContaining({ severity: "warning", conversionKey: "SOLAR" }),
		]);
	});

	it("rejects duplicate Raymarine brightness output groups", () => {
		const issues = validateConfig({
			conversions: {
				RAYMARINE_BRIGHTNESS: conversion(true, {
					groups: [
						{ signalkId: "helm", groupLabel: "Helm 1" },
						{ signalkId: "flybridge", groupLabel: "Helm 1" },
					],
				}),
			},
		});

		expect(issues).toEqual([
			expect.objectContaining({
				conversionKey: "RAYMARINE_BRIGHTNESS",
				field: "groupLabel",
				rowIndex: 1,
				severity: "error",
			}),
		]);
	});

	it("uses source plus instance as the temperature and humidity wire identity", () => {
		const issues = validateConfig({
			conversions: {
				TEMPERATURE2_SEA: conversion(true, {}),
				TEMPERATURE2_OUTSIDE: conversion(true, {
					instance: 100,
					n2kSource: "Sea Temperature",
				}),
				// The legacy PGN is a separate identity namespace and may intentionally
				// carry the same sensor identity for old receivers.
				TEMPERATURE_SEA: conversion(true, {}),
				HUMIDITY_OUTSIDE: conversion(true, {}),
				HUMIDITY_INSIDE: conversion(true, { instance: 0, n2kSource: "Outside" }),
			},
		});

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					conversionKey: "TEMPERATURE2_OUTSIDE",
					field: "instance",
					severity: "error",
				}),
				expect.objectContaining({
					conversionKey: "HUMIDITY_INSIDE",
					field: "instance",
					severity: "error",
				}),
			]),
		);
		expect(issues).toHaveLength(2);
	});

	it("warns about unmatched linked instances when local registries exist", () => {
		const issues = validateConfig({
			conversions: {
				BATTERY: conversion(true, {
					batteries: [{ signalkId: "house", instanceId: 1 }],
				}),
				AC_STATUS: conversion(true, {
					acSources: [
						{
							signalkId: "shore",
							instanceId: 2,
							direction: "output",
							phaseMode: "single",
						},
					],
				}),
				SOLAR: conversion(true, {
					chargers: [{ signalkId: "roof", instanceId: 3, panelInstanceId: 4 }],
				}),
				CHARGER_STATUS: conversion(true, {
					chargers: [{ signalkId: "charger", instanceId: 5, batteryInstanceId: 9 }],
				}),
				INVERTER_STATUS: conversion(true, {
					inverters: [{ signalkId: "main", instanceId: 6, acInstanceId: 8, dcInstanceId: 7 }],
				}),
			},
		});

		expect(issues).toEqual([
			expect.objectContaining({
				severity: "warning",
				conversionKey: "CHARGER_STATUS",
				field: "batteryInstanceId",
			}),
			expect.objectContaining({
				severity: "warning",
				conversionKey: "INVERTER_STATUS",
				field: "acInstanceId",
			}),
			expect.objectContaining({
				severity: "warning",
				conversionKey: "INVERTER_STATUS",
				field: "dcInstanceId",
			}),
		]);
	});

	it("does not invent linked-instance warnings without a local target registry", () => {
		const issues = validateConfig({
			conversions: {
				CHARGER_STATUS: conversion(true, {
					chargers: [{ signalkId: "charger", instanceId: 5, batteryInstanceId: 9 }],
				}),
				INVERTER_STATUS: conversion(true, {
					inverters: [{ signalkId: "main", instanceId: 6, acInstanceId: 8, dcInstanceId: 7 }],
				}),
			},
		});

		expect(issues).toEqual([]);
	});

	it("requires engine conversions to share one NMEA 2000 instance registry", () => {
		const issues = validateConfig({
			conversions: {
				ENGINE_PARAMETERS: conversion(true, {
					engines: [{ signalkId: "main", instanceId: 0 }],
				}),
				ENGINE_TRIP: conversion(true, {
					engines: [{ signalkId: "main", instanceId: 1 }],
				}),
			},
		});

		expect(issues).toEqual([
			expect.objectContaining({
				severity: "error",
				conversionKey: "ENGINE_TRIP",
				field: "instanceId",
			}),
		]);
	});

	it("accepts a complete multi-conversion mapping", () => {
		const issues = validateConfig({
			conversions: {
				AC_STATUS: conversion(true, {
					acSources: [
						{
							signalkId: "shore",
							instanceId: 0,
							direction: "input",
							phaseMode: "single",
							acceptability: "Good",
						},
					],
				}),
				ENGINE_PARAMETERS: conversion(true, {
					engines: [{ signalkId: "main", instanceId: 0 }],
				}),
				ENGINE_STATIC: conversion(true, {
					engines: [{ signalkId: "main", instanceId: 0, ratedEngineSpeed: 3600 }],
				}),
				RAYMARINE_BRIGHTNESS: conversion(true, {
					groups: [{ signalkId: "helm", groupLabel: "Helm 1" }],
				}),
				TANKS: conversion(true, {
					tanks: [{ signalkPath: "tanks.fuel.0", instanceId: 0 }],
				}),
				VESSEL_TRIP: conversion(true, {
					fuelTanks: [{ signalkPath: "tanks.fuel.0" }],
					engines: [{ signalkId: "main" }],
				}),
			},
		});

		expect(issues).toEqual([]);
	});
});
