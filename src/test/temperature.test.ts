import { describe, expect, it } from "vitest";
import { temperatures } from "../conversions/temperature.js";

describe("Temperature sources", () => {
	it("assigns a unique default instance to each source", () => {
		const instances = temperatures.map((t) => t.instance);
		const duplicates = instances.filter(
			(inst, idx) => instances.indexOf(inst) !== idx,
		);
		expect(duplicates).toEqual([]);
	});
});
