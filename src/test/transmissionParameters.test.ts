import { describe, expect, it } from "vitest";
import createTransmissionParametersConversion from "../conversions/transmissionParameters.js";

describe("transmission parameters", () => {
	it("represents an empty discrete status bit lookup as an array", async () => {
		const conversion = createTransmissionParametersConversion();
		const messages = await conversion.callback?.("forward", 345000, 353.15);

		expect(messages?.[0]?.fields.discreteStatus1).toEqual([]);
	});
});
