import { describe, expect, it } from "vitest";
import createAcStatusConversion from "../conversions/acStatus.js";
import createBatteryConversion from "../conversions/battery.js";
import createChargerStatusConversion from "../conversions/chargerStatus.js";
import createEngineParametersConversions from "../conversions/engineParameters.js";
import createEngineStaticConversion from "../conversions/engineStatic.js";
import createEngineTripConversion from "../conversions/engineTrip.js";
import createInverterStatusConversion from "../conversions/inverterStatus.js";
import createSolarConversion from "../conversions/solar.js";
import createTanksConversion from "../conversions/tanks.js";
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
	});

	it("ignores malformed established factory rows", () => {
		const app = {} as SignalKApp;
		const plugin = {} as SignalKPlugin;
		const cases: Array<[ConversionModule, string]> = [
			[createBatteryConversion(app, plugin), "batteries"],
			[createSolarConversion(app), "chargers"],
			[createEngineStaticConversion(app), "engines"],
			[createEngineTripConversion(app), "engines"],
			...createEngineParametersConversions(app).map((conversion): [ConversionModule, string] => [
				conversion,
				"engines",
			]),
		];
		for (const [conversion, key] of cases) {
			expectMalformedRowsIgnored(conversion, key);
		}
	});
});
