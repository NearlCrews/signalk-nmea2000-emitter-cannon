import { describe, expect, it } from "vitest";
import createTemperatureConversions, { temperatures } from "../conversions/temperature.js";
import type { N2KMessage } from "../types/index.js";

// Emit one PGN from a temperature conversion, driving it with the FLAT option
// shape the plugin-manager produces (extras spread directly onto the options
// object), so these assertions exercise the real production read path.
type SubFactory = (o: unknown) => Array<{
	callback?: (v: unknown) => N2KMessage[];
}> | null;

function callbackFor(optionKey: string, options: unknown): (value: unknown) => N2KMessage[] {
	const mod = createTemperatureConversions().find((m) => m.optionKey === optionKey);
	if (!mod || typeof mod.conversions !== "function") {
		throw new Error(`no factory conversion for ${optionKey}`);
	}
	// The factory's option param is typed ConversionOptions; the test drives it
	// with raw shapes (including the legacy nested form) to prove the read path.
	const sub = (mod.conversions as unknown as SubFactory)(options)?.[0];
	if (!sub?.callback) {
		throw new Error(`no callback for ${optionKey}`);
	}
	return sub.callback;
}

function emit(optionKey: string, options: unknown, value = 290.15): N2KMessage {
	const out = callbackFor(optionKey, options)(value);
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

	it("emits canonical water temperature as Sea Temperature on both modern PGNs", () => {
		const legacy = emit("TEMPERATURE_SEA", {}, 281.2);
		expect(legacy).toMatchObject({
			pgn: 130312,
			fields: {
				instance: 100,
				source: "Sea Temperature",
				actualTemperature: 281.2,
			},
		});
		expect(legacy.fields).not.toHaveProperty("temperature");

		const extended = emit("TEMPERATURE2_SEA", {}, 281.2);
		expect(extended).toMatchObject({
			pgn: 130316,
			fields: {
				instance: 100,
				source: "Sea Temperature",
				temperature: 281.2,
			},
		});
		expect(extended.fields).not.toHaveProperty("actualTemperature");
	});

	it("uses the canonical water path and honors a sea-temperature instance override", () => {
		const conversions = createTemperatureConversions();
		for (const optionKey of ["TEMPERATURE_SEA", "TEMPERATURE2_SEA"]) {
			const conversion = conversions.find((candidate) => candidate.optionKey === optionKey);
			expect(conversion?.keys).toEqual(["environment.water.temperature"]);
			expect(emit(optionKey, { instance: 7 }).fields.instance).toBe(7);
		}
	});

	it("rejects non-numeric and non-finite sea temperatures", () => {
		for (const optionKey of ["TEMPERATURE_SEA", "TEMPERATURE2_SEA"]) {
			const callback = callbackFor(optionKey, {});
			for (const invalid of [null, undefined, "281.2", Number.NaN, Infinity, -Infinity]) {
				expect(callback(invalid)).toEqual([]);
			}
		}
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

	it("falls back to the default source for an unknown stored enum", () => {
		const msg = emit("TEMPERATURE2_REFRIGERATOR", { n2kSource: "Sea-ish" });
		expect(msg.fields.source).toBe("Refrigeration Temperature");
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
