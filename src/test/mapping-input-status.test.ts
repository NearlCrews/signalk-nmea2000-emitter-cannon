import { describe, expect, it } from "vitest";
import { mappingInputStatus } from "../panel/components/extras/mappingInputStatus.js";

describe("mappingInputStatus", () => {
	it("reports asset presence without calling a prefix match live data", () => {
		expect(
			mappingInputStatus("electrical.batteries.house", [
				"electrical.batteries.house.capacity.stateOfCharge",
			]),
		).toEqual({ assetFound: true });
		expect(
			mappingInputStatus("electrical.batteries.start", ["electrical.batteries.house.voltage"]),
		).toEqual({ assetFound: false });
	});

	it("accepts any complete required-input alternative", () => {
		const requirement = {
			label: "currentVolume, or currentLevel plus capacity",
			alternatives: [["currentVolume"], ["currentLevel", "capacity"]],
		};
		const asset = "tanks.fuel.main";

		expect(
			mappingInputStatus(asset, [`${asset}.currentVolume`], requirement).requiredInputFound,
		).toBe(true);
		expect(
			mappingInputStatus(asset, [`${asset}.currentLevel`, `${asset}.capacity`], requirement)
				.requiredInputFound,
		).toBe(true);
		expect(mappingInputStatus(asset, [`${asset}.currentLevel`], requirement)).toEqual({
			assetFound: true,
			requiredInputFound: false,
		});
	});

	it("requires exact leaves instead of another descendant with a shared prefix", () => {
		const asset = "electrical.inverters.main";
		expect(
			mappingInputStatus(asset, [`${asset}.inverterModeLabel`], {
				label: "inverterMode",
				alternatives: [["inverterMode"]],
			}),
		).toEqual({ assetFound: true, requiredInputFound: false });
	});
});
