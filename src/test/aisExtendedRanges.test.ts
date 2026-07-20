import { describe, expect, it } from "vitest";
import createAisExtendedConversions from "../conversions/aisExtended.js";
import type { SignalKApp, SignalKPlugin } from "../types/index.js";

const app = {
	getSelfPath: (path: string) =>
		path === "mmsi" ? "367301250" : path === "name" ? "MY VESSEL" : undefined,
} as unknown as SignalKApp;

const conversions = createAisExtendedConversions(app, {} as SignalKPlugin);

async function fieldsFor(key: string, input: unknown[]): Promise<Record<string, unknown>> {
	const conversion = conversions.find((candidate) => candidate.optionKey === key);
	if (!conversion?.callback) throw new Error(`Missing conversion ${key}`);
	const messages = await Promise.resolve(conversion.callback(...input));
	const fields = messages[0]?.fields;
	if (!fields) throw new Error(`Conversion ${key} did not emit`);
	return fields;
}

describe("own-vessel AIS wire ranges", () => {
	it("omits an invalid Class B speed instead of allowing unsigned wrap", async () => {
		const fields = await fieldsFor("AIS_CLASS_B_POSITION", [
			"B",
			{ latitude: 39.1, longitude: -76.4 },
			1,
			-1,
			1,
		]);
		expect(fields.sog).toBeUndefined();
	});

	it("omits invalid Class B lookup and dimension values", async () => {
		const fields = await fieldsFor("AIS_CLASS_B_EXTENDED", [
			"B",
			{ latitude: 39.1, longitude: -76.4 },
			1,
			700,
			1,
			{ id: 36.5, name: "invalid" },
			0,
			-1,
			7000,
			-1,
		]);
		expect(fields).toMatchObject({ sog: undefined, typeOfShip: undefined });
		expect(fields.length).toBeUndefined();
		expect(fields.beam).toBeUndefined();
		expect(fields.positionReferenceFromBow).toBeUndefined();
		expect(fields.positionReferenceFromStarboard).toBeUndefined();
	});

	it("omits invalid SAR speed and altitude", async () => {
		const fields = await fieldsFor("AIS_SAR_AIRCRAFT", [
			"SAR",
			{ latitude: 39.1, longitude: -76.4, altitude: 21_474_837 },
			1,
			-1,
		]);
		expect(fields.sog).toBeUndefined();
		expect(fields.altitude).toBeUndefined();
	});
});
