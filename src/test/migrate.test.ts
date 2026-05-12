import { describe, expect, it } from "vitest";
import { migrateLegacyConfig } from "../config/migrate.js";
import type { Config } from "../config/schema.js";

describe("migrateLegacyConfig", () => {
	it("returns input unchanged when already in new shape", () => {
		const already: Config = {
			globalResendInterval: 30,
			conversions: {
				WIND: { enabled: true, resend: 0, sources: {}, extras: {} },
			},
		};
		expect(migrateLegacyConfig(already)).toBe(already);
	});

	it("preserves globalResendInterval at the root", () => {
		const legacy = {
			globalResendInterval: 45,
			WIND: { enabled: true, resend: 0 },
		};
		const out = migrateLegacyConfig(legacy);
		expect(out.globalResendInterval).toBe(45);
	});

	it("defaults globalResendInterval to 30 when missing", () => {
		const legacy = { WIND: { enabled: true, resend: 0 } };
		const out = migrateLegacyConfig(legacy);
		expect(out.globalResendInterval).toBe(30);
	});

	it("moves enabled and resend into conversions[KEY]", () => {
		const legacy = { WIND: { enabled: true, resend: 5 } };
		const out = migrateLegacyConfig(legacy);
		expect(out.conversions.WIND).toEqual({
			enabled: true,
			resend: 5,
			sources: {},
			extras: {},
		});
	});

	it("routes string-valued legacy fields into sources", () => {
		const legacy = {
			WIND: {
				enabled: true,
				resend: 0,
				environment_wind_angleApparent: "gps1",
				environment_wind_speedApparent: "",
			},
		};
		const out = migrateLegacyConfig(legacy);
		expect(out.conversions.WIND?.sources).toEqual({
			environment_wind_angleApparent: "gps1",
			environment_wind_speedApparent: "",
		});
	});

	it("routes non-string non-common fields into extras (battery example)", () => {
		const legacy = {
			BATTERY: {
				enabled: true,
				resend: 0,
				batteries: [{ signalkId: "house", instanceId: 0 }],
			},
		};
		const out = migrateLegacyConfig(legacy);
		expect(out.conversions.BATTERY?.extras).toEqual({
			batteries: [{ signalkId: "house", instanceId: 0 }],
		});
	});

	it("ignores top-level non-object values that are not globalResendInterval", () => {
		const legacy = {
			globalResendInterval: 30,
			junk: "ignored",
			WIND: { enabled: true, resend: 0 },
		};
		const out = migrateLegacyConfig(legacy);
		expect(Object.keys(out.conversions)).toEqual(["WIND"]);
	});

	it("returns an empty Config for null/undefined input", () => {
		expect(migrateLegacyConfig(null).conversions).toEqual({});
		expect(migrateLegacyConfig(undefined).conversions).toEqual({});
	});
});
