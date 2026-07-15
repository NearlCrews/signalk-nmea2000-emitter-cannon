import { describe, expect, it } from "vitest";
import createTemperatureConversions, { temperatures } from "../conversions/temperature.js";
import type { N2KMessage } from "../types/index.js";

// Emit one PGN from a temperature conversion, driving it with the FLAT option
// shape the plugin-manager produces (extras spread directly onto the options
// object), so these assertions exercise the real production read path.
type SubFactory = (o: unknown) => Array<{
	callback?: (v: number) => N2KMessage[];
}> | null;

function emit(optionKey: string, options: unknown): N2KMessage {
	const mod = createTemperatureConversions().find((m) => m.optionKey === optionKey);
	if (!mod || typeof mod.conversions !== "function") {
		throw new Error(`no factory conversion for ${optionKey}`);
	}
	// The factory's option param is typed ConversionOptions; the test drives it
	// with raw shapes (including the legacy nested form) to prove the read path.
	const sub = (mod.conversions as unknown as SubFactory)(options)?.[0];
	const out = sub?.callback?.(290.15) ?? [];
	expect(out).toHaveLength(1);
	return out[0] as N2KMessage;
}

describe("Temperature sources", () => {
	it("assigns a unique default instance to each source", () => {
		const instances = temperatures.map((t) => t.instance);
		const duplicates = instances.filter((inst, idx) => instances.indexOf(inst) !== idx);
		expect(duplicates).toEqual([]);
	});

	it("uses the per-source default instance and source when no extras are set", () => {
		const msg = emit("TEMPERATURE2_INSIDE", {});
		expect(msg.fields.instance).toBe(102);
		expect(msg.fields.source).toBe("Inside Temperature");
	});

	it("reads the instance override from the flattened (production) option shape", () => {
		const msg = emit("TEMPERATURE2_INSIDE", { instance: 7 });
		expect(msg.fields.instance).toBe(7);
	});

	it("reads the source-type override, so any sensor can emit as Inside Temperature", () => {
		const msg = emit("TEMPERATURE2_REFRIGERATOR", {
			instance: 2,
			n2kSource: "Inside Temperature",
		});
		expect(msg.fields.instance).toBe(2);
		expect(msg.fields.source).toBe("Inside Temperature");
	});

	it("clamps an out-of-range instance into the encodable uint8 data range", () => {
		expect(emit("TEMPERATURE2_INSIDE", { instance: 300 }).fields.instance).toBe(252);
		expect(emit("TEMPERATURE2_INSIDE", { instance: -5 }).fields.instance).toBe(0);
	});

	it("ignores the legacy nested option shape (regression: instance was silently dropped)", () => {
		// Pre-fix the factory read options[optionKey]?.instance, so the nested
		// shape leaked through in tests while production passed the flat shape and
		// the override never took effect. The flat read makes the nested form a
		// no-op: the default instance is used.
		const msg = emit("TEMPERATURE2_INSIDE", {
			TEMPERATURE2_INSIDE: { instance: 7 },
		});
		expect(msg.fields.instance).toBe(102);
	});
});
