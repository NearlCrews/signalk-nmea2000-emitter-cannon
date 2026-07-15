import { describe, expect, it } from "vitest";
import createHumidityConversions from "../conversions/humidity.js";
import type { N2KMessage, SignalKApp } from "../types/index.js";

type SubFactory = (o: unknown) => Array<{
	callback?: (...args: number[]) => N2KMessage[];
}> | null;

// Emit one PGN 130313 frame from a humidity conversion, driving the factory
// with the FLAT option shape the plugin-manager produces, so these assertions
// exercise the real production read path (not a tautology against the same
// resolver the embedded tests use).
function emit(optionKey: string, options: unknown, input: number[]): N2KMessage {
	const mod = createHumidityConversions(null as unknown as SignalKApp).find(
		(m) => m.optionKey === optionKey,
	);
	if (!mod || typeof mod.conversions !== "function") {
		throw new Error(`no factory conversion for ${optionKey}`);
	}
	const sub = (mod.conversions as unknown as SubFactory)(options)?.[0];
	const out = sub?.callback?.(...input) ?? [];
	expect(out).toHaveLength(1);
	return out[0] as N2KMessage;
}

describe("Humidity overrides", () => {
	it("uses the default instance and source when no extras are set", () => {
		const msg = emit("HUMIDITY_INSIDE", {}, [0.5]);
		expect(msg.fields.instance).toBe(100);
		expect(msg.fields.source).toBe("Inside");
		expect(msg.fields.actualHumidity).toBe(50);
	});

	it("reads the instance override from the flattened option shape", () => {
		const msg = emit("HUMIDITY_INSIDE", { instance: 4 }, [0.42]);
		expect(msg.fields.instance).toBe(4);
	});

	it("reads the source-type override on the outside conversion", () => {
		const msg = emit("HUMIDITY_OUTSIDE", { n2kSource: "Inside" }, [0.6]);
		expect(msg.fields.source).toBe("Inside");
		expect(msg.fields.instance).toBe(100);
	});

	it("clamps an out-of-range instance into the encodable uint8 data range", () => {
		expect(emit("HUMIDITY_INSIDE", { instance: 300 }, [0.5]).fields.instance).toBe(252);
		expect(emit("HUMIDITY_INSIDE", { instance: -5 }, [0.5]).fields.instance).toBe(0);
	});
});
