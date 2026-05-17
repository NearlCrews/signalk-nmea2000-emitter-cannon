import { describe, expect, it } from "vitest";
import { Advisor, type AdvisorDeps } from "../advisor/advisor.js";
import { BudgetTracker } from "../advisor/budget.js";
import { isN2KSource } from "../advisor/busSource.js";
import { buildLiveInventory, mergeHistoric } from "../advisor/inventory.js";
import {
	enrichRationales,
	fetchOpenRouterModels,
	OpenRouterClient,
} from "../advisor/openrouter.js";
import { fetchHistoricPaths, QuestDBClient } from "../advisor/questdb.js";
import { recommend } from "../advisor/recommender.js";
import type { ConversionMetadata } from "../api/types.js";
import { DEFAULT_ADVISOR_CONFIG } from "../config/enums.js";
import type { SignalKApp } from "../types/index.js";

describe("isN2KSource", () => {
	it("flags canboatjs-style N2K source labels", () => {
		expect(isN2KSource("can0.123")).toBe(true);
		expect(isN2KSource("n2k-on-ve.can-socket.45")).toBe(true);
	});
	it("flags N2K sources whose connection id does not contain 'can'", () => {
		expect(isN2KSource("ttyUSB0.115")).toBe(true);
		expect(isN2KSource("actisense.15")).toBe(true);
		expect(isN2KSource("n2k-1.42")).toBe(true);
	});
	it("flags the plugin's own echo guard label", () => {
		expect(isN2KSource("NMEA2000")).toBe(true);
	});
	it("treats non-N2K sources as native", () => {
		expect(isN2KSource("gps1")).toBe(false);
		expect(isN2KSource("signalk-virtual-weather-sensors")).toBe(false);
		expect(isN2KSource("ttyUSB0.GP")).toBe(false);
		expect(isN2KSource("")).toBe(false);
	});
});

function inventoryApp(): SignalKApp {
	return {
		streambundle: {
			getAvailablePaths: () => [
				"navigation.depth.belowTransducer",
				"environment.wind.speedApparent",
			],
		},
		getSelfPath: (p: string) =>
			p === "navigation.depth.belowTransducer"
				? { $source: "depth.0" }
				: { $source: "can0.35" },
	} as unknown as SignalKApp;
}

describe("buildLiveInventory", () => {
	it("returns one entry per active path with its live sources", () => {
		const inv = buildLiveInventory(inventoryApp());
		expect(inv).toHaveLength(2);
		const depth = inv.find(
			(e) => e.path === "navigation.depth.belowTransducer",
		);
		expect(depth?.live).toBe(true);
		expect(depth?.liveSources).toEqual(["depth.0"]);
	});
	it("returns an empty inventory when no paths are active", () => {
		const empty = {
			streambundle: { getAvailablePaths: () => [] },
		} as unknown as SignalKApp;
		expect(buildLiveInventory(empty)).toEqual([]);
	});
});

function meta(key: string, paths: string[]): ConversionMetadata {
	return {
		key,
		title: key,
		pgns: [],
		category: "navigation",
		presets: [],
		paths,
		extras: { type: "none" },
	};
}

describe("recommend", () => {
	it("recommends enabling a disabled conversion fed by a native source", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.depth.belowTransducer",
					live: true,
					liveSources: ["depthSounder"],
				},
			],
			metadata: [meta("DEPTH", ["navigation.depth.belowTransducer"])],
			currentConfig: {},
		});
		const depth = recs.find((r) => r.optionKey === "DEPTH");
		expect(depth?.action).toBe("enable");
		expect(depth?.confidence).toBe("high");
		expect(depth?.matchedPaths).toEqual(["navigation.depth.belowTransducer"]);
	});

	it("recommends disabling an enabled conversion whose data is already on the bus", () => {
		const recs = recommend({
			inventory: [
				{ path: "navigation.position", live: true, liveSources: ["can0.35"] },
			],
			metadata: [meta("GPS", ["navigation.position"])],
			currentConfig: {
				GPS: { enabled: true, resend: 0, sources: {}, extras: {} },
			},
		});
		expect(recs.find((r) => r.optionKey === "GPS")?.action).toBe("disable");
	});

	it("keeps an already-enabled conversion fed by a native source", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.depth.belowTransducer",
					live: true,
					liveSources: ["depthSounder"],
				},
			],
			metadata: [meta("DEPTH", ["navigation.depth.belowTransducer"])],
			currentConfig: {
				DEPTH: { enabled: true, resend: 0, sources: {}, extras: {} },
			},
		});
		expect(recs.find((r) => r.optionKey === "DEPTH")?.action).toBe("keep");
	});

	it("skips conversions with no declared paths and unmatched conversions", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.depth.belowTransducer",
					live: true,
					liveSources: ["depthSounder"],
				},
			],
			metadata: [
				meta("BATTERY", []),
				meta("WIND", ["environment.wind.speedApparent"]),
			],
			currentConfig: {},
		});
		expect(recs).toEqual([]);
	});
});

interface TestDeps extends AdvisorDeps {
	getSaved: () => Record<string, unknown> | null;
}

function advisorDeps(overrides: Partial<AdvisorDeps> = {}): TestDeps {
	let saved: Record<string, unknown> | null = null;
	const base: AdvisorDeps = {
		buildInventory: () => [
			{
				path: "navigation.depth.belowTransducer",
				live: true,
				liveSources: ["depthSounder"],
			},
		],
		getMetadata: () => [meta("DEPTH", ["navigation.depth.belowTransducer"])],
		readConfig: () => ({ conversions: {} }),
		writeConfig: (cfg) => {
			saved = cfg;
		},
		now: () => new Date("2026-05-16T10:00:00Z"),
		...overrides,
	};
	return { ...base, getSaved: () => saved };
}

describe("Advisor.runReview", () => {
	it("auto-applies a confident enable and writes config", async () => {
		const deps = advisorDeps();
		const result = await new Advisor(deps).runReview();
		expect(result.autoApplied.map((r) => r.optionKey)).toEqual(["DEPTH"]);
		expect(result.pending).toEqual([]);
		const saved = deps.getSaved() as {
			conversions: Record<string, { enabled: boolean }>;
		};
		expect(saved.conversions.DEPTH?.enabled).toBe(true);
	});

	it("parks a disable as pending and does not write it", async () => {
		const deps = advisorDeps({
			buildInventory: () => [
				{ path: "navigation.position", live: true, liveSources: ["can0.9"] },
			],
			getMetadata: () => [meta("GPS", ["navigation.position"])],
			readConfig: () => ({
				conversions: {
					GPS: { enabled: true, resend: 0, sources: {}, extras: {} },
				},
			}),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.pending.map((r) => r.optionKey)).toEqual(["GPS"]);
		expect(result.autoApplied).toEqual([]);
	});

	it("parks enables as pending and writes nothing when autoApply is off", async () => {
		const deps = advisorDeps({
			readConfig: () => ({ advisor: { autoApply: false }, conversions: {} }),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.autoApplied).toEqual([]);
		expect(result.pending.map((r) => r.optionKey)).toEqual(["DEPTH"]);
		expect(deps.getSaved()).toBeNull();
	});
});

describe("Advisor.applyReview", () => {
	it("applies approved disables and ignores rejected ones", async () => {
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {
					GPS: { enabled: true, resend: 0, sources: {}, extras: {} },
					AIS: { enabled: true, resend: 0, sources: {}, extras: {} },
				},
			}),
		});
		await new Advisor(deps).applyReview([
			{ optionKey: "GPS", approved: true },
			{ optionKey: "AIS", approved: false },
		]);
		const saved = deps.getSaved() as {
			conversions: Record<string, { enabled: boolean }>;
		};
		expect(saved.conversions.GPS?.enabled).toBe(false);
		expect(saved.conversions.AIS?.enabled).toBe(true);
	});

	it("applies an approved enable when the decision carries action enable", async () => {
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {
					DEPTH: { enabled: false, resend: 0, sources: {}, extras: {} },
				},
			}),
		});
		await new Advisor(deps).applyReview([
			{ optionKey: "DEPTH", approved: true, action: "enable" },
		]);
		const saved = deps.getSaved() as {
			conversions: Record<string, { enabled: boolean }>;
		};
		expect(saved.conversions.DEPTH?.enabled).toBe(true);
	});
});

describe("QuestDBClient", () => {
	function fakeFetch(status: number, body: unknown): typeof fetch {
		return (async () =>
			({
				ok: status >= 200 && status < 300,
				status,
				json: async () => body,
			}) as Response) as typeof fetch;
	}

	it("probe returns true on a well-formed response", async () => {
		const c = new QuestDBClient(
			{ url: "http://h:9000" },
			fakeFetch(200, { dataset: [[1]] }),
		);
		expect(await c.probe()).toBe(true);
	});

	it("probe returns false on a non-OK response", async () => {
		const c = new QuestDBClient({ url: "http://h:9000" }, fakeFetch(503, {}));
		expect(await c.probe()).toBe(false);
	});

	it("probe returns false when fetch throws", async () => {
		const throwing = (async () => {
			throw new Error("ECONNREFUSED");
		}) as typeof fetch;
		const c = new QuestDBClient({ url: "http://h:9000" }, throwing);
		expect(await c.probe()).toBe(false);
	});

	it("query returns columns and dataset", async () => {
		const c = new QuestDBClient(
			{ url: "http://h:9000" },
			fakeFetch(200, {
				columns: [{ name: "path", type: "SYMBOL" }],
				dataset: [["navigation.speedThroughWater"]],
			}),
		);
		const r = await c.query("SELECT 1");
		expect(r.dataset).toEqual([["navigation.speedThroughWater"]]);
	});

	it("query throws on a non-OK response", async () => {
		const c = new QuestDBClient({ url: "http://h:9000" }, fakeFetch(400, {}));
		await expect(c.query("bad")).rejects.toThrow("HTTP 400");
	});
});

describe("fetchHistoricPaths", () => {
	it("merges signalk, signalk_str, and signalk_position rows", async () => {
		const responses: Record<string, unknown> = {
			signalk: {
				columns: [],
				dataset: [
					["navigation.speedThroughWater", 1200, "2026-05-16T09:00:00.000000Z"],
				],
			},
			signalk_str: {
				columns: [],
				dataset: [
					["navigation.gnss.methodQuality", 30, "2026-05-16T08:00:00.000000Z"],
				],
			},
			signalk_position: {
				columns: [],
				dataset: [[900, "2026-05-16T09:30:00.000000Z"]],
			},
		};
		const fetchImpl = (async (url: string) => {
			const table = url.includes("signalk_position")
				? "signalk_position"
				: url.includes("signalk_str")
					? "signalk_str"
					: "signalk";
			return {
				ok: true,
				status: 200,
				json: async () => responses[table],
			} as Response;
		}) as typeof fetch;

		const client = new QuestDBClient({ url: "http://h:9000" }, fetchImpl);
		const paths = await fetchHistoricPaths(client, 7);
		expect(paths.get("navigation.speedThroughWater")?.samples).toBe(1200);
		expect(paths.get("navigation.gnss.methodQuality")?.samples).toBe(30);
		expect(paths.get("navigation.position")?.samples).toBe(900);
	});

	it("omits navigation.position when signalk_position has no rows", async () => {
		const fetchImpl = (async (url: string) => ({
			ok: true,
			status: 200,
			json: async () =>
				url.includes("signalk_position")
					? { dataset: [[0, null]] }
					: { dataset: [] },
		})) as typeof fetch;
		const client = new QuestDBClient({ url: "http://h:9000" }, fetchImpl);
		const paths = await fetchHistoricPaths(client, 7);
		expect(paths.has("navigation.position")).toBe(false);
	});
});

describe("mergeHistoric", () => {
	it("annotates a live path and adds a historic-only path", () => {
		const live = [
			{
				path: "environment.wind.speedApparent",
				live: true,
				liveSources: ["wind.5"],
			},
		];
		const historic = new Map([
			["environment.wind.speedApparent", { samples: 100, lastSeen: "t1" }],
			["navigation.speedThroughWater", { samples: 50, lastSeen: "t2" }],
		]);
		const merged = mergeHistoric(live, historic);
		const wind = merged.find(
			(e) => e.path === "environment.wind.speedApparent",
		);
		expect(wind?.historic?.samples).toBe(100);
		const stw = merged.find((e) => e.path === "navigation.speedThroughWater");
		expect(stw?.live).toBe(false);
		expect(stw?.liveSources).toEqual([]);
		expect(stw?.historic?.samples).toBe(50);
	});
});

describe("recommend with historic paths", () => {
	it("marks a historic-only match as low-confidence historic origin", () => {
		const recs = recommend({
			inventory: [
				{
					path: "navigation.speedThroughWater",
					live: false,
					liveSources: [],
					historic: { samples: 50, lastSeen: "t" },
				},
			],
			metadata: [meta("SPEED", ["navigation.speedThroughWater"])],
			currentConfig: {},
		});
		const speed = recs.find((r) => r.optionKey === "SPEED");
		expect(speed?.action).toBe("enable");
		expect(speed?.origin).toBe("historic");
		expect(speed?.confidence).toBe("low");
	});
});

describe("Advisor.runReview with QuestDB", () => {
	it("merges historic paths when questdb is enabled", async () => {
		const deps = advisorDeps({
			buildInventory: () => [],
			getMetadata: () => [meta("SPEED", ["navigation.speedThroughWater"])],
			readConfig: () => ({
				conversions: {},
				advisor: {
					...DEFAULT_ADVISOR_CONFIG,
					questdb: { enabled: true, url: "http://h:9000", lookbackDays: 7 },
				},
			}),
			fetchHistoric: async () =>
				new Map([
					["navigation.speedThroughWater", { samples: 9, lastSeen: "t" }],
				]),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.autoApplied.map((r) => r.optionKey)).toEqual(["SPEED"]);
	});

	it("notes a QuestDB failure and continues live-only", async () => {
		const deps = advisorDeps({
			readConfig: () => ({
				conversions: {},
				advisor: {
					...DEFAULT_ADVISOR_CONFIG,
					questdb: { enabled: true, url: "http://h:9000", lookbackDays: 7 },
				},
			}),
			fetchHistoric: async () => {
				throw new Error("ECONNREFUSED");
			},
		});
		const result = await new Advisor(deps).runReview();
		expect(result.notes.some((n) => n.includes("QuestDB"))).toBe(true);
	});
});

describe("BudgetTracker", () => {
	it("allows calls up to the daily cap", () => {
		const b = new BudgetTracker(2, () => new Date("2026-05-16T00:00:00Z"));
		expect(b.canSpend()).toBe(true);
		b.recordCall();
		b.recordCall();
		expect(b.canSpend()).toBe(false);
	});

	it("resets the count on a new UTC day", () => {
		let day = "2026-05-16";
		const b = new BudgetTracker(1, () => new Date(`${day}T12:00:00Z`));
		b.recordCall();
		expect(b.canSpend()).toBe(false);
		day = "2026-05-17";
		expect(b.canSpend()).toBe(true);
	});

	it("a zero cap blocks every call", () => {
		const b = new BudgetTracker(0, () => new Date("2026-05-16T00:00:00Z"));
		expect(b.canSpend()).toBe(false);
	});
});

describe("OpenRouterClient", () => {
	function fetchReturning(status: number, body: unknown): typeof fetch {
		return (async () =>
			({
				ok: status >= 200 && status < 300,
				status,
				headers: new Headers(),
				json: async () => body,
			}) as Response) as typeof fetch;
	}

	const cfg = {
		apiKey: "k",
		model: "m",
		baseUrl: "https://openrouter.ai/api/v1",
	};

	it("returns the message content on a 200", async () => {
		const client = new OpenRouterClient(
			cfg,
			fetchReturning(200, {
				choices: [{ message: { content: '{"ok":true}' } }],
			}),
		);
		const text = await client.complete({ system: "s", user: "u" });
		expect(text).toBe('{"ok":true}');
	});

	it("throws a terminal error on 401 without retrying", async () => {
		let calls = 0;
		const counting = (async () => {
			calls += 1;
			return {
				ok: false,
				status: 401,
				headers: new Headers(),
				json: async () => ({ error: { message: "bad key" } }),
			} as Response;
		}) as typeof fetch;
		const client = new OpenRouterClient(cfg, counting);
		await expect(client.complete({ system: "s", user: "u" })).rejects.toThrow();
		expect(calls).toBe(1);
	});
});

describe("enrichRationales", () => {
	const recs = [
		{
			optionKey: "DEPTH",
			action: "enable" as const,
			currentlyEnabled: false,
			matchedPaths: ["navigation.depth.belowTransducer"],
			confidence: "high" as const,
			origin: "live" as const,
			reason: "deterministic reason",
		},
	];

	it("maps a returned rationale onto its optionKey", async () => {
		const client = {
			complete: async () =>
				JSON.stringify({
					rationales: [{ optionKey: "DEPTH", reason: "clear reason" }],
				}),
		};
		const out = await enrichRationales(client, recs);
		expect(out.get("DEPTH")).toBe("clear reason");
	});

	it("drops an optionKey the model invented", async () => {
		const client = {
			complete: async () =>
				JSON.stringify({
					rationales: [{ optionKey: "MADE_UP", reason: "x" }],
				}),
		};
		const out = await enrichRationales(client, recs);
		expect(out.size).toBe(0);
	});

	it("returns an empty map on malformed JSON", async () => {
		const client = { complete: async () => "not json" };
		const out = await enrichRationales(client, recs);
		expect(out.size).toBe(0);
	});
});

describe("fetchOpenRouterModels", () => {
	it("returns sorted model ids from the /models response", async () => {
		const fetchImpl = (async () =>
			({
				ok: true,
				status: 200,
				json: async () => ({
					data: [{ id: "openai/gpt-4o" }, { id: "anthropic/claude-haiku-4.5" }],
				}),
			}) as Response) as typeof fetch;
		const models = await fetchOpenRouterModels(
			"https://openrouter.ai/api/v1",
			fetchImpl,
		);
		expect(models).toEqual(["anthropic/claude-haiku-4.5", "openai/gpt-4o"]);
	});

	it("throws on a non-OK response", async () => {
		const fetchImpl = (async () =>
			({
				ok: false,
				status: 502,
				json: async () => ({}),
			}) as Response) as typeof fetch;
		await expect(
			fetchOpenRouterModels("https://openrouter.ai/api/v1", fetchImpl),
		).rejects.toThrow("HTTP 502");
	});
});

describe("Advisor.runReview with OpenRouter", () => {
	function openRouterDeps(
		overrides: Partial<AdvisorDeps> = {},
	): ReturnType<typeof advisorDeps> {
		return advisorDeps({
			readConfig: () => ({
				conversions: {},
				advisor: {
					...DEFAULT_ADVISOR_CONFIG,
					openRouter: {
						...DEFAULT_ADVISOR_CONFIG.openRouter,
						enabled: true,
						apiKey: "k",
					},
				},
			}),
			...overrides,
		});
	}

	it("overwrites reasons with enriched text", async () => {
		const deps = openRouterDeps({
			enrichReasons: async () => ({
				reasons: new Map([["DEPTH", "enriched reason"]]),
			}),
		});
		const result = await new Advisor(deps).runReview();
		expect(result.autoApplied[0]?.reason).toBe("enriched reason");
	});

	it("notes an OpenRouter failure and keeps deterministic reasons", async () => {
		const deps = openRouterDeps({
			enrichReasons: async () => {
				throw new Error("HTTP 402");
			},
		});
		const result = await new Advisor(deps).runReview();
		expect(result.notes.some((n) => n.includes("OpenRouter"))).toBe(true);
		expect(result.autoApplied[0]?.reason).toContain("DEPTH");
	});

	it("skips OpenRouter when no key is set", async () => {
		let called = false;
		const deps = advisorDeps({
			enrichReasons: async () => {
				called = true;
				return { reasons: new Map() };
			},
		});
		await new Advisor(deps).runReview();
		expect(called).toBe(false);
	});
});
