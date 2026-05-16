import { describe, expect, it } from "vitest";
import { migrateLegacyConfig } from "../config/migrate.js";
import type { Config } from "../config/schema.js";
import { DEFAULT_GLOBAL_RESEND_SECONDS } from "../constants.js";

describe("migrateLegacyConfig", () => {
	it("returns input unchanged when already in new shape", () => {
		const already: Config = {
			globalResendInterval: 30,
			conversions: {
				WIND: { enabled: true, resend: 0, sources: {}, extras: {} },
			},
		};
		expect(migrateLegacyConfig(already)).toEqual(already);
	});

	it("preserves globalResendInterval at the root", () => {
		const legacy = {
			globalResendInterval: 45,
			WIND: { enabled: true, resend: 0 },
		};
		const out = migrateLegacyConfig(legacy);
		expect(out.globalResendInterval).toBe(45);
	});

	it("defaults globalResendInterval to DEFAULT_GLOBAL_RESEND_SECONDS when missing", () => {
		const legacy = { WIND: { enabled: true, resend: 0 } };
		const out = migrateLegacyConfig(legacy);
		expect(out.globalResendInterval).toBe(DEFAULT_GLOBAL_RESEND_SECONDS);
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

	describe("nested configuration envelope recovery", () => {
		it("recovers globalResendInterval stranded inside a nested envelope", () => {
			const corrupt = {
				enabled: true,
				conversions: {
					WIND: { enabled: true, resend: 0, sources: {}, extras: {} },
				},
				configuration: {
					enabled: true,
					conversions: {
						WIND: { enabled: true, resend: 0, sources: {}, extras: {} },
					},
					configuration: {
						globalResendInterval: 2,
						conversions: {
							GPS: { enabled: true, resend: 0, sources: {}, extras: {} },
						},
					},
				},
			};
			const out = migrateLegacyConfig(corrupt);
			expect(out.globalResendInterval).toBe(2);
		});

		it("keeps the outermost (newest) conversions when a layer is nested", () => {
			const corrupt = {
				conversions: {
					WIND: { enabled: true, resend: 0, sources: {}, extras: {} },
				},
				configuration: {
					globalResendInterval: 2,
					conversions: {
						GPS: { enabled: true, resend: 0, sources: {}, extras: {} },
					},
				},
			};
			const out = migrateLegacyConfig(corrupt);
			expect(Object.keys(out.conversions)).toEqual(["WIND"]);
		});

		it("drops the envelope-only configuration and enabled keys", () => {
			const corrupt = {
				enabled: true,
				conversions: {
					WIND: { enabled: true, resend: 0, sources: {}, extras: {} },
				},
				configuration: {
					globalResendInterval: 2,
					conversions: {},
				},
			};
			const out = migrateLegacyConfig(corrupt) as Record<string, unknown>;
			expect("configuration" in out).toBe(false);
			expect("enabled" in out).toBe(false);
		});
	});

	describe("ENGINE_STATIC v1.5.4 -> v1.5.5 extras migration", () => {
		it("upgrades flat-scalar extras to a single-engine table", () => {
			const legacy: Config = {
				globalResendInterval: DEFAULT_GLOBAL_RESEND_SECONDS,
				conversions: {
					ENGINE_STATIC: {
						enabled: true,
						resend: 0,
						sources: {},
						extras: {
							ratedEngineSpeed: 3600,
							VIN: "ABC123456789",
							softwareVersion: "v2.1.3",
						},
					},
				},
			};
			const out = migrateLegacyConfig(legacy);
			expect(out.conversions.ENGINE_STATIC?.extras).toEqual({
				engines: [
					{
						signalkId: "0",
						instanceId: 0,
						ratedEngineSpeed: 3600,
						VIN: "ABC123456789",
						softwareVersion: "v2.1.3",
					},
				],
			});
		});

		it("upgrades partial legacy extras without inventing missing fields", () => {
			const out = migrateLegacyConfig({
				globalResendInterval: DEFAULT_GLOBAL_RESEND_SECONDS,
				conversions: {
					ENGINE_STATIC: {
						enabled: true,
						resend: 0,
						sources: {},
						extras: { ratedEngineSpeed: 2800 },
					},
				},
			});
			expect(out.conversions.ENGINE_STATIC?.extras).toEqual({
				engines: [
					{
						signalkId: "0",
						instanceId: 0,
						ratedEngineSpeed: 2800,
					},
				],
			});
		});

		it("leaves an already-migrated engines table untouched", () => {
			const next = {
				engines: [
					{
						signalkId: "starboard",
						instanceId: 1,
						ratedEngineSpeed: 3600,
					},
				],
			};
			const out = migrateLegacyConfig({
				globalResendInterval: DEFAULT_GLOBAL_RESEND_SECONDS,
				conversions: {
					ENGINE_STATIC: {
						enabled: true,
						resend: 0,
						sources: {},
						extras: next,
					},
				},
			});
			expect(out.conversions.ENGINE_STATIC?.extras).toEqual(next);
		});

		it("leaves empty extras untouched (no engine identity configured)", () => {
			const out = migrateLegacyConfig({
				globalResendInterval: DEFAULT_GLOBAL_RESEND_SECONDS,
				conversions: {
					ENGINE_STATIC: {
						enabled: true,
						resend: 0,
						sources: {},
						extras: {},
					},
				},
			});
			expect(out.conversions.ENGINE_STATIC?.extras).toEqual({});
		});
	});
});
