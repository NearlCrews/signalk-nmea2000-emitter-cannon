import { describe, expect, it } from "vitest";
import createAcStatusConversion from "../conversions/acStatus.js";
import createBatteryConversion from "../conversions/battery.js";
import createChargerStatusConversion from "../conversions/chargerStatus.js";
import createDcVoltageCurrentConversion from "../conversions/dcVoltageCurrent.js";
import createEngineParametersConversions from "../conversions/engineParameters.js";
import createEngineStaticConversion from "../conversions/engineStatic.js";
import createEngineTripConversion from "../conversions/engineTrip.js";
import createInverterStatusConversion from "../conversions/inverterStatus.js";
import createSolarConversion from "../conversions/solar.js";
import createSwitchBankConversion from "../conversions/switchBank.js";
import createTanksConversion from "../conversions/tanks.js";
import createVesselTripConversion from "../conversions/vesselTrip.js";
import type { ConversionModule, SignalKApp, SignalKPlugin } from "../types/index.js";

const MALFORMED_ROWS = [null, undefined, 42, "shore", [], {}];

function expectMalformedRowsIgnored(conversion: ConversionModule, key: string): void {
	const conversions = conversion.conversions;
	expect(typeof conversions).toBe("function");
	if (typeof conversions !== "function") return;
	expect(() => conversions({ enabled: true, [key]: MALFORMED_ROWS })).not.toThrow();
	expect(conversions({ enabled: true, [key]: MALFORMED_ROWS })).toBeNull();
}

describe("malformed mapped extras", () => {
	it("accepts safe provider-generated instance ids without accepting full paths", () => {
		const app = {} as SignalKApp;
		const plugin = {} as SignalKPlugin;
		const conversions = createBatteryConversion(app, plugin).conversions;
		expect(typeof conversions).toBe("function");
		if (typeof conversions !== "function") return;

		const compatible = conversions({
			enabled: true,
			batteries: [
				{ signalkId: "fomleMonitor-second", instanceId: 0 },
				{ signalkId: "house_bank", instanceId: 1 },
			],
		});
		expect(compatible).toHaveLength(2);
		expect(compatible?.[0]?.keys).toContain("electrical.batteries.fomleMonitor-second.voltage");
		expect(compatible?.[1]?.keys).toContain("electrical.batteries.house_bank.voltage");

		for (const signalkId of [
			"fomleMonitor-second.voltage",
			"electrical/batteries/house",
			"house bank",
			"",
		]) {
			expect(conversions({ enabled: true, batteries: [{ signalkId, instanceId: 0 }] })).toBeNull();
		}
	});

	it("ignores invalid AC source rows", () => {
		const conversion = createAcStatusConversion();
		const conversions = conversion.conversions;
		expect(typeof conversions).toBe("function");
		if (typeof conversions !== "function") return;
		const options = { enabled: true, acSources: MALFORMED_ROWS };

		expect(() => conversions(options)).not.toThrow();
		expect(conversions(options)).toBeNull();
		expect(
			conversions({
				enabled: true,
				acSources: [
					{
						signalkId: "shore.power",
						instanceId: 1,
						direction: "input",
						phaseMode: "single",
						acceptability: "Good",
					},
				],
			}),
		).toBeNull();
		expect(
			conversions({
				enabled: true,
				acSources: [
					{
						signalkId: "shore",
						direction: "input",
						phaseMode: "single",
						acceptability: "Good",
					},
				],
			}),
		).toBeNull();
		expect(
			conversions({
				enabled: true,
				acSources: [
					{
						signalkId: "shore",
						instanceId: 1,
						direction: "invalid",
						phaseMode: "single",
						acceptability: "Good",
					},
				],
			}),
		).toBeNull();
		expect(
			conversions({
				enabled: true,
				acSources: [
					{
						signalkId: "shore",
						instanceId: 1,
						direction: "input",
						phaseMode: "single",
					},
				],
			}),
		).toBeNull();
	});

	it("ignores invalid charger rows", () => {
		const conversion = createChargerStatusConversion();
		const conversions = conversion.conversions;
		expect(typeof conversions).toBe("function");
		if (typeof conversions !== "function") return;
		const options = { enabled: true, chargers: MALFORMED_ROWS };

		expect(() => conversions(options)).not.toThrow();
		expect(conversions(options)).toBeNull();
		expect(
			conversions({
				enabled: true,
				chargers: [{ signalkId: "shore power", instanceId: 1, batteryInstanceId: 1 }],
			}),
		).toBeNull();
		expect(
			conversions({ enabled: true, chargers: [{ signalkId: "shore", batteryInstanceId: 1 }] }),
		).toBeNull();
	});

	it("ignores invalid inverter rows", () => {
		const conversion = createInverterStatusConversion();
		const conversions = conversion.conversions;
		expect(typeof conversions).toBe("function");
		if (typeof conversions !== "function") return;

		expect(conversions({ enabled: true, inverters: MALFORMED_ROWS })).toBeNull();
		expect(
			conversions({
				enabled: true,
				inverters: [
					{ signalkId: "main inverter", instanceId: 1, acInstanceId: 2, dcInstanceId: 3 },
				],
			}),
		).toBeNull();
		expect(
			conversions({
				enabled: true,
				inverters: [{ signalkId: "main", instanceId: 1, acInstanceId: 2 }],
			}),
		).toBeNull();
	});

	it("ignores malformed tank rows and paths", () => {
		const app = { error: () => {} } as unknown as SignalKApp;
		const conversion = createTanksConversion(app);
		const conversions = conversion.conversions;
		expect(typeof conversions).toBe("function");
		if (typeof conversions !== "function") return;

		expect(() => conversions({ enabled: true, tanks: MALFORMED_ROWS })).not.toThrow();
		expect(conversions({ enabled: true, tanks: MALFORMED_ROWS })).toBeNull();
		expect(conversions({ enabled: true, tanks: [{ signalkPath: 1, instanceId: 1 }] })).toBeNull();
		expect(
			conversions({ enabled: true, tanks: [{ signalkPath: "tanks.unknown.0", instanceId: 1 }] }),
		).toBeNull();
		// A gas tank has no PGN 127505 fluid type, and an inherited object key
		// must not resolve to a prototype member.
		expect(
			conversions({ enabled: true, tanks: [{ signalkPath: "tanks.gas.0", instanceId: 1 }] }),
		).toBeNull();
		expect(
			conversions({
				enabled: true,
				tanks: [{ signalkPath: "tanks.constructor.0", instanceId: 1 }],
			}),
		).toBeNull();
		expect(
			conversions({ enabled: true, tanks: [{ signalkPath: "tanks.baitWell.0", instanceId: 1 }] }),
		).toHaveLength(1);
		// A skipped row keeps the rows after it on their own table row numbers.
		expect(
			conversions({
				enabled: true,
				tanks: [
					{ signalkPath: "tanks.gas.0", instanceId: 1 },
					{ signalkPath: "tanks.fuel.0", instanceId: 2 },
				],
			})?.map((tank) => tank.mappingRow),
		).toEqual([1]);
		expect(
			conversions({
				enabled: true,
				tanks: [{ signalkPath: "tanks.fuel.day-tank_1", instanceId: 1 }],
			}),
		).toHaveLength(1);
	});

	it("ignores switch rows outside electrical.switches or off the channel range", () => {
		const conversions = createSwitchBankConversion({} as SignalKApp).conversions;
		expect(typeof conversions).toBe("function");
		if (typeof conversions !== "function") return;

		const row = { signalkPath: "electrical.switches.anchorLight", instanceId: 7, channel: 1 };
		for (const bad of [
			{ ...row, signalkPath: "electrical.switches" },
			{ ...row, signalkPath: "electrical.batteries.house" },
			{ ...row, signalkPath: "electrical.switches.anchor light" },
			{ ...row, channel: 0 },
			{ ...row, channel: 29 },
			{ ...row, channel: 1.5 },
			{ ...row, instanceId: "seven" },
			// An out-of-range bank is dropped, not clamped onto bank 252.
			{ ...row, instanceId: 300 },
			{ ...row, instanceId: -1 },
		]) {
			expect(conversions({ enabled: true, switches: [bad] }), JSON.stringify(bad)).toBeNull();
		}

		// Rows group into one bank per instance, and a repeated channel keeps
		// the first row rather than reporting two switches on one indicator.
		const banks = conversions({
			enabled: true,
			switches: [
				row,
				{ ...row, signalkPath: "electrical.switches.cabinLight" },
				{ ...row, signalkPath: "electrical.switches.deckLight", channel: 2 },
				{ ...row, signalkPath: "electrical.switches.bank.0.4", instanceId: 8 },
			],
		});
		expect(banks?.map((bank) => bank.keys)).toEqual([
			["electrical.switches.anchorLight.state", "electrical.switches.deckLight.state"],
			["electrical.switches.bank.0.4.state"],
		]);
		// Each bank is numbered by its first table row and named by its bank.
		expect(banks?.map((bank) => [bank.mappingRow, bank.title])).toEqual([
			[0, "Switch Bank Status (PGN 127501), bank 7"],
			[3, "Switch Bank Status (PGN 127501), bank 8"],
		]);
	});

	it("ignores DC source rows that do not name an electrical asset", () => {
		const conversions = createDcVoltageCurrentConversion({} as SignalKApp).conversions;
		expect(typeof conversions).toBe("function");
		if (typeof conversions !== "function") return;

		expect(
			conversions({
				enabled: true,
				dcSources: [{ signalkPath: "electrical.alternators.main", instanceId: 300 }],
			}),
		).toBeNull();
		for (const signalkPath of ["electrical", "electrical.alternators", "propulsion.main.x", 3]) {
			expect(
				conversions({ enabled: true, dcSources: [{ signalkPath, instanceId: 1 }] }),
				String(signalkPath),
			).toBeNull();
		}
		expect(
			conversions({
				enabled: true,
				dcSources: [{ signalkPath: "electrical.alternators.main", instanceId: 1 }],
			})?.[0]?.keys,
		).toEqual(["electrical.alternators.main.voltage", "electrical.alternators.main.current"]);
	});

	it("ignores malformed established factory rows", () => {
		const app = {} as SignalKApp;
		const plugin = {} as SignalKPlugin;
		const cases: Array<[ConversionModule, string]> = [
			[createBatteryConversion(app, plugin), "batteries"],
			[createSolarConversion(app), "chargers"],
			[createEngineStaticConversion(app), "engines"],
			[createEngineTripConversion(app), "engines"],
			[createSwitchBankConversion(app), "switches"],
			[createDcVoltageCurrentConversion(app), "dcSources"],
			...createEngineParametersConversions(app).map((conversion): [ConversionModule, string] => [
				conversion,
				"engines",
			]),
		];
		for (const [conversion, key] of cases) {
			expectMalformedRowsIgnored(conversion, key);
		}
	});

	it("fails closed on malformed vessel-trip rows and requires a valid fuel tank", async () => {
		const app = {} as SignalKApp;
		const conversion = createVesselTripConversion(app);
		const conversions = conversion.conversions;
		expect(typeof conversions).toBe("function");
		if (typeof conversions !== "function") return;

		expect(() =>
			conversions({ enabled: true, fuelTanks: MALFORMED_ROWS, engines: MALFORMED_ROWS }),
		).not.toThrow();
		expect(
			conversions({ enabled: true, fuelTanks: MALFORMED_ROWS, engines: MALFORMED_ROWS }),
		).toBeNull();
		expect(
			conversions({ enabled: true, fuelTanks: [{ signalkPath: "tanks.water.0" }] }),
		).toBeNull();
		expect(
			conversions({ enabled: true, fuelTanks: [{ signalkPath: "tanks.fuel.port.tank" }] }),
		).toBeNull();

		expect(
			conversions({
				enabled: true,
				fuelTanks: [{ signalkPath: "tanks.fuel.day tank" }],
				engines: MALFORMED_ROWS,
			}),
		).toBeNull();

		const remainingOnly = conversions({
			enabled: true,
			fuelTanks: [{ signalkPath: "tanks.fuel.day tank" }],
			engines: [null, undefined],
		});
		expect(remainingOnly?.[0]?.keys).toEqual([
			"tanks.fuel.day tank.currentVolume",
			"tanks.fuel.day tank.currentLevel",
			"tanks.fuel.day tank.capacity",
		]);
		expect(await remainingOnly?.[0]?.callback?.(0.05, null, null)).toEqual([
			{
				prio: 2,
				pgn: 127496,
				dst: 255,
				fields: { estimatedFuelRemaining: 50 },
			},
		]);

		expect(
			conversions({
				enabled: true,
				fuelTanks: [{ signalkPath: "tanks.fuel.0" }, { signalkPath: "tanks.water.0" }],
				engines: [{ signalkId: "main" }],
			}),
		).toBeNull();
		expect(
			conversions({
				enabled: true,
				fuelTanks: [{ signalkPath: "tanks.fuel.0" }],
				engines: [{ signalkId: "main" }, { signalkId: "port.main" }],
			}),
		).toBeNull();
	});
});
