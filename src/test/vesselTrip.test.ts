import { describe, expect, it } from "vitest";
import createVesselTripConversion from "../conversions/vesselTrip.js";
import type { ConversionOptions, SignalKApp } from "../types/index.js";

function build(options: ConversionOptions) {
	const module = createVesselTripConversion({} as SignalKApp);
	const conversions = module.conversions;
	if (typeof conversions !== "function") throw new Error("Vessel trip factory is missing");
	return conversions(options);
}

describe("Vessel Trip Parameters", () => {
	it("deduplicates configured tanks and engines before aggregating", async () => {
		const conversions = build({
			enabled: true,
			fuelTanks: [
				{ signalkPath: "tanks.fuel.0" },
				{ signalkPath: "tanks.fuel.0" },
				{ signalkPath: "tanks.fuel.1" },
			],
			engines: [{ signalkId: "main" }, { signalkId: "main" }, { signalkId: "aux" }],
		});
		expect(conversions).toHaveLength(1);
		const conversion = conversions?.[0];
		expect(conversion?.keys).toEqual([
			"tanks.fuel.0.currentVolume",
			"tanks.fuel.0.currentLevel",
			"tanks.fuel.0.capacity",
			"tanks.fuel.1.currentVolume",
			"tanks.fuel.1.currentLevel",
			"tanks.fuel.1.capacity",
			"propulsion.main.fuel.rate",
			"propulsion.aux.fuel.rate",
			"navigation.speedOverGround",
		]);

		const result = await conversion?.callback?.(
			0.02,
			null,
			null,
			null,
			0.5,
			0.032,
			0.000006,
			0.000004,
			4,
		);
		expect(result).toEqual([
			{
				prio: 2,
				pgn: 127496,
				dst: 255,
				fields: {
					estimatedFuelRemaining: 36,
					timeToEmpty: 3600,
					distanceToEmpty: 14400,
				},
			},
		]);
	});

	it("supports remaining-fuel-only output when no engines are configured", async () => {
		const conversions = build({
			enabled: true,
			fuelTanks: [{ signalkPath: "tanks.fuel.0" }],
			engines: [],
		});
		const conversion = conversions?.[0];
		expect(conversion?.keys).toEqual([
			"tanks.fuel.0.currentVolume",
			"tanks.fuel.0.currentLevel",
			"tanks.fuel.0.capacity",
		]);
		expect(await conversion?.callback?.(null, 0.25, 0.2)).toEqual([
			{
				prio: 2,
				pgn: 127496,
				dst: 255,
				fields: { estimatedFuelRemaining: 50 },
			},
		]);
	});

	it("omits distance when speed over ground is unavailable", async () => {
		const conversions = build({
			enabled: true,
			fuelTanks: [{ signalkPath: "tanks.fuel.0" }],
			engines: [{ signalkId: "main" }],
		});
		const result = await conversions?.[0]?.callback?.(0.036, null, null, 0.00001, null);
		expect(result?.[0]?.fields).toEqual({
			estimatedFuelRemaining: 36,
			timeToEmpty: 3600,
		});
	});

	it("rounds derived fields to their PGN wire resolutions", async () => {
		const remainingCubicMeters = 0.0012344;
		const rawTimeToEmpty = 1.23456;
		const rawDistanceToEmpty = 12.3456;
		const conversions = build({
			enabled: true,
			fuelTanks: [{ signalkPath: "tanks.fuel.reserve_1" }],
			engines: [{ signalkId: "main" }],
		});
		const result = await conversions?.[0]?.callback?.(
			remainingCubicMeters,
			null,
			null,
			remainingCubicMeters / rawTimeToEmpty,
			rawDistanceToEmpty / rawTimeToEmpty,
		);
		expect(result?.[0]?.fields).toEqual({
			estimatedFuelRemaining: 1,
			timeToEmpty: 1.235,
			distanceToEmpty: 12.35,
		});
	});

	it("accepts the exact maximum for every populated wire field", async () => {
		const maxTimeToEmpty = 4_294_967.292;
		const remainingCubicMeters = 65.532;
		const conversions = build({
			enabled: true,
			fuelTanks: [{ signalkPath: "tanks.fuel.day-tank" }],
			engines: [{ signalkId: "main" }],
		});
		const result = await conversions?.[0]?.callback?.(
			remainingCubicMeters,
			null,
			null,
			remainingCubicMeters / maxTimeToEmpty,
			10,
		);
		expect(result?.[0]?.fields).toEqual({
			estimatedFuelRemaining: 65_532,
			timeToEmpty: maxTimeToEmpty,
			distanceToEmpty: 42_949_672.92,
		});
	});

	it("omits fields that exceed their wire ranges", async () => {
		const maxTimeToEmpty = 4_294_967.292;
		const maxDistanceToEmpty = 42_949_672.92;
		const conversions = build({
			enabled: true,
			fuelTanks: [{ signalkPath: "tanks.fuel.0" }],
			engines: [{ signalkId: "main" }],
		});
		const rawTimeToEmpty = maxTimeToEmpty + 0.001;
		const result = await conversions?.[0]?.callback?.(
			1,
			null,
			null,
			1 / rawTimeToEmpty,
			(maxDistanceToEmpty + 0.01) / rawTimeToEmpty,
		);
		expect(result?.[0]?.fields).toEqual({ estimatedFuelRemaining: 1000 });
		expect(await conversions?.[0]?.callback?.(65.533, null, null, 1, 1)).toEqual([]);
	});

	it("rejects negative and non-finite inputs without unsafe derived fields", async () => {
		const singleEngine = build({
			enabled: true,
			fuelTanks: [{ signalkPath: "tanks.fuel.0" }],
			engines: [{ signalkId: "main" }],
		});
		const callback = singleEngine?.[0]?.callback;
		expect(await callback?.(-0.1, null, null, 0.00001, 2)).toEqual([]);
		expect(await callback?.(Number.NaN, null, null, 0.00001, 2)).toEqual([]);
		expect(await callback?.(Number.POSITIVE_INFINITY, null, null, 0.00001, 2)).toEqual([]);
		expect((await callback?.(0.05, null, null, -0.00001, 2))?.[0]?.fields).toEqual({
			estimatedFuelRemaining: 50,
		});
		expect((await callback?.(0.05, null, null, Number.POSITIVE_INFINITY, 2))?.[0]?.fields).toEqual({
			estimatedFuelRemaining: 50,
		});
		expect(
			(await callback?.(0.05, null, null, 0.00001, Number.POSITIVE_INFINITY))?.[0]?.fields,
		).toEqual({ estimatedFuelRemaining: 50, timeToEmpty: 5000 });

		const twoEngines = build({
			enabled: true,
			fuelTanks: [{ signalkPath: "tanks.fuel.0" }],
			engines: [{ signalkId: "main" }, { signalkId: "aux" }],
		});
		expect(
			(
				await twoEngines?.[0]?.callback?.(0.05, null, null, Number.MAX_VALUE, Number.MAX_VALUE, 2)
			)?.[0]?.fields,
		).toEqual({ estimatedFuelRemaining: 50 });
	});

	it.each([
		["negative level", -0.1, 0.1],
		["level above one", 1.1, 0.1],
		["non-finite level", Number.NaN, 0.1],
		["negative capacity", 0.5, -0.1],
		["non-finite capacity", 0.5, Number.POSITIVE_INFINITY],
	] as const)(
		"rejects %s in the level-times-capacity fallback",
		async (_label, level, capacity) => {
			const conversions = build({
				enabled: true,
				fuelTanks: [{ signalkPath: "tanks.fuel.0" }],
				engines: [],
			});
			expect(await conversions?.[0]?.callback?.(null, level, capacity)).toEqual([]);
		},
	);
});
