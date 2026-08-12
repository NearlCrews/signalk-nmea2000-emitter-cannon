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

	it("preserves unknown keys in current nested configurations", () => {
		const futureEntry = { enabled: true, resend: 0, sources: {}, extras: {}, futureMode: "eco" };
		const out = migrateLegacyConfig({
			globalResendInterval: 30,
			futurePluginSetting: { enabled: true },
			conversions: { WIND: futureEntry },
		}) as unknown as {
			futurePluginSetting: unknown;
			conversions: Record<string, Record<string, unknown>>;
		};

		expect(out.futurePluginSetting).toEqual({ enabled: true });
		expect(out.conversions.WIND?.futureMode).toBe("eco");
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

		it("recovers conversions buried under multiple pure-envelope layers", () => {
			// The corruption that stranded the advisor: outer layers carry only
			// the `configuration` envelope, so a single `.configuration` unwrap
			// still leaves `conversions` buried. The advisor then read an empty
			// config and the recommender rebuilt it from scratch, dropping every
			// factory-module conversion (BATTERY, NOTIFICATIONS, ENGINE_*, ...).
			const corrupt = {
				configuration: {
					configuration: {
						configuration: {
							globalResendInterval: 2,
							conversions: {
								BATTERY: {
									enabled: true,
									resend: 0,
									sources: {},
									extras: {},
								},
							},
						},
					},
				},
			};
			const out = migrateLegacyConfig(corrupt);
			expect(Object.keys(out.conversions)).toEqual(["BATTERY"]);
			expect(out.conversions.BATTERY?.enabled).toBe(true);
		});
	});

	describe("nested-shape entry normalization", () => {
		it("backfills sources and extras for a nested entry that omits them", () => {
			// A config saved while sources/extras were Type.Optional: the nested
			// shape is present, but a conversion entry lacks both. Without the
			// backfill the panel would dereference cfg.sources/cfg.extras and throw.
			const out = migrateLegacyConfig({
				globalResendInterval: 5,
				conversions: { DEPTH: { enabled: true, resend: 0 } },
			});
			expect(out.conversions.DEPTH).toEqual({
				enabled: true,
				resend: 0,
				sources: {},
				extras: {},
			});
		});

		it("backfills enabled and resend for a bare nested entry", () => {
			const out = migrateLegacyConfig({
				conversions: { DEPTH: {} },
			});
			expect(out.conversions.DEPTH).toEqual({
				enabled: false,
				resend: 0,
				sources: {},
				extras: {},
			});
		});

		it("drops non-string source values when normalizing a nested entry", () => {
			const out = migrateLegacyConfig({
				conversions: {
					WIND: {
						enabled: true,
						resend: 0,
						sources: { angle: "gps1", speed: 5 },
						extras: {},
					},
				},
			});
			expect(out.conversions.WIND?.sources).toEqual({ angle: "gps1" });
		});

		it("preserves the advisor block when normalizing a nested config", () => {
			const out = migrateLegacyConfig({
				conversions: { DEPTH: { enabled: true, resend: 0 } },
				advisor: { enabled: true, autoApply: false },
			});
			expect(out.advisor).toEqual({ enabled: true, autoApply: false });
		});

		it("drops a removed advisor.openRouter block and its stored key", () => {
			const out = migrateLegacyConfig({
				conversions: {},
				advisor: {
					enabled: true,
					autoApply: false,
					openRouter: { enabled: true, apiKey: "sk-secret", model: "m" },
					questdb: { enabled: false, url: "http://h:9000", lookbackDays: 7 },
				},
			});
			expect(out.advisor).toBeDefined();
			expect((out.advisor as Record<string, unknown>).openRouter).toBeUndefined();
			// The surviving advisor settings are untouched.
			expect(out.advisor?.enabled).toBe(true);
			expect(out.advisor?.autoApply).toBe(false);
		});

		it("leaves an advisor block that has no openRouter key untouched", () => {
			const out = migrateLegacyConfig({
				conversions: {},
				advisor: {
					enabled: true,
					autoApply: true,
					questdb: { enabled: false, url: "http://h:9000", lookbackDays: 7 },
				},
			});
			expect(out.advisor).toEqual({
				enabled: true,
				autoApply: true,
				questdb: { enabled: false, url: "http://h:9000", lookbackDays: 7 },
			});
		});

		it("is idempotent on a partial nested entry", () => {
			const input = {
				globalResendInterval: 5,
				conversions: { DEPTH: { enabled: true, resend: 0 } },
			};
			const once = migrateLegacyConfig(input);
			const twice = migrateLegacyConfig(once);
			expect(twice).toEqual(once);
		});

		it("does not misclassify a top-level advisor block as a conversion (legacy-flat)", () => {
			const out = migrateLegacyConfig({
				advisor: { enabled: true },
				WIND: { enabled: true, resend: 0 },
			});
			expect(Object.keys(out.conversions)).toEqual(["WIND"]);
			expect(out.advisor).toEqual({ enabled: true });
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
