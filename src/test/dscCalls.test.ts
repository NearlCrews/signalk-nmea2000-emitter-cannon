import { toPgn } from "@canboat/canboatjs";
import { describe, expect, it } from "vitest";
import createDscCallsConversion from "../conversions/dscCalls.js";
import type { SignalKApp } from "../types/index.js";
import { validateN2KMessageStrict } from "./strictValidation.js";

describe("DSC distress encoding", () => {
	it("writes the decimal-pair MMSI to Field 12 and leaves Field 3 unavailable", () => {
		const conversion = createDscCallsConversion({} as SignalKApp);
		const messages = conversion.callback?.("distress", "367123456", "fire");
		expect(messages).not.toBeInstanceOf(Promise);
		if (!Array.isArray(messages)) throw new Error("DSC callback did not return messages");
		expect(messages).toHaveLength(1);
		const message = messages[0];
		if (!message) throw new Error("DSC callback returned no message");
		expect(() => validateN2KMessageStrict(message)).not.toThrow();

		const data = toPgn(message as unknown as Parameters<typeof toPgn>[0]);
		if (!data) throw new Error("Canboat did not encode the DSC message");
		expect(data.subarray(2, 7)).toEqual(Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff]));
		expect(data.subarray(35, 40)).toEqual(Buffer.from([36, 71, 23, 45, 60]));
	});
});
