import { describe, expect, it } from "vitest";
import { encodeDscMmsi, parseMmsi } from "../utils/aisUtils.js";

describe("AIS and DSC address parsing", () => {
	it("accepts only complete AIS User IDs in the encodable range", () => {
		expect(parseMmsi("367301250")).toBe(367301250);
		expect(parseMmsi("123abc")).toBeUndefined();
		expect(parseMmsi("36730125")).toBeUndefined();
		expect(parseMmsi("1999999")).toBeUndefined();
		expect(parseMmsi("1000000000")).toBeUndefined();
		expect(parseMmsi(367301250)).toBeUndefined();
	});

	it("appends the required trailing DSC address digit to a valid MMSI", () => {
		expect(encodeDscMmsi("367301250")).toEqual(Buffer.from([36, 73, 1, 25, 0]));
		expect(encodeDscMmsi("36730125")).toBeUndefined();
		expect(encodeDscMmsi("123abc")).toBeUndefined();
	});
});
