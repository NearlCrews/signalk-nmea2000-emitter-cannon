import { describe, expect, it } from "vitest";
import { resolveSaveStatus } from "../panel/saveStatusState";

describe("resolveSaveStatus", () => {
	it("treats an epoch-zero timestamp as a completed save request", () => {
		expect(resolveSaveStatus(false, false, 0)).toEqual({
			kind: "requested",
			message: "Save requested",
		});
	});

	it("does not claim persistence completed", () => {
		expect(resolveSaveStatus(false, false, Date.now()).message).not.toBe("Saved");
	});
});
