import { describe, expect, it } from "vitest";
import { raymarinePresetsFor } from "../config/raymarinePreset.js";
import createEnvironmentParametersConversion from "../conversions/environmentParameters.js";
import createSeaTempConversion from "../conversions/seaTemp.js";
import type { SignalKApp } from "../types/index.js";

describe("environmental temperature preset", () => {
	it("selects modern PGN 130316 temperature conversions", () => {
		expect(raymarinePresetsFor("TEMPERATURE2_SEA")).toContain("environmental");
		expect(raymarinePresetsFor("TEMPERATURE2_OUTSIDE")).toContain("environmental");
	});

	it("leaves PGN 130312 temperature conversions available for manual compatibility", () => {
		expect(raymarinePresetsFor("TEMPERATURE_SEA")).toEqual([]);
		expect(raymarinePresetsFor("TEMPERATURE_OUTSIDE")).toEqual([]);
	});

	it("keeps humidity in the environmental preset", () => {
		expect(raymarinePresetsFor("HUMIDITY_OUTSIDE")).toEqual(["environmental"]);
		expect(raymarinePresetsFor("HUMIDITY_INSIDE")).toEqual(["environmental", "raymarine"]);
	});

	it("leaves obsolete PGN 130310 available only by explicit selection", () => {
		const conversion = createSeaTempConversion({} as SignalKApp);
		expect(conversion.optionKey).toBe("SEA_TEMP");
		expect(conversion.presets).toBeUndefined();
	});

	it("leaves deprecated PGN 130311 available only by explicit selection", () => {
		const conversion = createEnvironmentParametersConversion({} as SignalKApp);
		expect(conversion.optionKey).toBe("ENVIRONMENT_PARAMETERS");
		expect(conversion.presets).toBeUndefined();
	});
});
