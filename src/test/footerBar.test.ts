import { describe, expect, it } from "vitest";
import { isSaveDisabled } from "../panel/saveDisabled.js";

describe("isSaveDisabled", () => {
	it("is enabled (not disabled) when unconfigured and not dirty", () => {
		// Fresh install: configuration prop is null/undefined, no edits yet.
		// Save must be enabled so the user can commit defaults and start the plugin.
		expect(isSaveDisabled(false, true)).toBe(false);
	});

	it("is enabled when unconfigured and dirty", () => {
		expect(isSaveDisabled(true, true)).toBe(false);
	});

	it("is disabled when configured and not dirty", () => {
		// Plugin has been configured before, no pending edits.
		expect(isSaveDisabled(false, false)).toBe(true);
	});

	it("is enabled when configured and dirty", () => {
		// User has made edits to an already-configured plugin.
		expect(isSaveDisabled(true, false)).toBe(false);
	});
});
