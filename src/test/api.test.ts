import type { IRouter } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdvisorOperationError } from "../advisor/advisor.js";
import { createApiRouter } from "../api/router.js";
import createPlugin from "../index.js";
import type { PluginManager } from "../plugin-manager.js";
import type { SignalKApp } from "../types/index.js";

// Mock surface narrowed to the two methods createApiRouter calls on a
// PluginManager: getStatusSnapshot and getConversionMetadata. Tests cast
// the literal through this type instead of `as unknown as PluginManager`
// with embedded `as never` casts, so the structural shape is checked.
type MockPluginManager = Pick<PluginManager, "getStatusSnapshot" | "getConversionMetadata">;

// Mirrors index.ts: the catalog comes from the running manager when present,
// else from a manager-free source (an empty list stands in for the standalone
// catalog the real factory builds while the plugin is disabled).
const metadataFromPm =
	(getPm: () => PluginManager | null) => (): ReturnType<PluginManager["getConversionMetadata"]> =>
		getPm()?.getConversionMetadata() ?? [];

// Tests pass an explicit getMetadata to cover the disabled-plugin case where
// getPm() is null but the catalog must still come back.
function mountRouter(
	app: SignalKApp,
	getPm: () => PluginManager | null,
	getMetadata: () => ReturnType<PluginManager["getConversionMetadata"]> = metadataFromPm(getPm),
): express.Express {
	const expressApp = express();
	const router: IRouter = express.Router();
	createApiRouter(app, getPm, getMetadata, () => null)(router);
	expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);
	return expressApp;
}

function mountRouterWithAdvisor(
	app: SignalKApp,
	getPm: () => PluginManager | null,
	getAdvisor: () => unknown,
): express.Express {
	const expressApp = express();
	expressApp.use(express.json());
	const router: IRouter = express.Router();
	createApiRouter(app, getPm, metadataFromPm(getPm), getAdvisor as never)(router);
	expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);
	return expressApp;
}

// Built per-test in beforeEach so each case starts with fresh mock state.
function makeFakeApp(): SignalKApp {
	return {
		streambundle: { getAvailablePaths: () => ["a", "b"] },
		getSelfPath: (p: string) =>
			p === "navigation.position" ? { $source: "gps1", values: { gps1: {} } } : undefined,
		error: vi.fn(),
	} as unknown as SignalKApp;
}

function makeTransactionalAdvisorApp(rollbackSaveFails = false): {
	app: SignalKApp;
	getStored: () => Record<string, unknown>;
	saves: Record<string, unknown>[];
} {
	let stored: Record<string, unknown> = { conversions: {} };
	const saves: Record<string, unknown>[] = [];
	const app = {
		debug: Object.assign(vi.fn(), { enabled: false }),
		error: vi.fn(),
		on: vi.fn(),
		removeListener: vi.fn(),
		emit: vi.fn(),
		setPluginStatus: vi.fn(),
		setPluginError: vi.fn(),
		reportOutputMessages: vi.fn(),
		registerDeltaInputHandler: vi.fn(),
		subscriptionmanager: { subscribe: vi.fn() },
		streambundle: {
			getAvailablePaths: () => ["environment.depth.belowTransducer"],
			getSelfBus: () => {
				throw new Error("forced replacement startup failure");
			},
		},
		getSelfPath: () => ({ $source: "depth-sensor" }),
		getPath: (path: string) =>
			path === "sources" ? { "depth-sensor": { type: "plugin" } } : undefined,
		readPluginOptions: () => ({ configuration: stored }),
		savePluginOptions: (config: Record<string, unknown>, callback: (error?: Error) => void) => {
			saves.push(config);
			if (rollbackSaveFails && saves.length === 2) {
				callback(new Error("forced rollback save failure"));
				return;
			}
			stored = config;
			callback();
		},
	} as unknown as SignalKApp;
	return { app, getStored: () => stored, saves };
}

// Minimal advisor stub honoring every method createApiRouter may call.
function makeAdvisorStub(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		runReview: async () => ({
			ranAt: "",
			autoApplied: [],
			pending: [],
			notes: [],
		}),
		getPending: () => [],
		getPendingResult: () => ({ autoApplied: [], pending: [], notes: [] }),
		applyReview: async () => 0,
		...overrides,
	};
}

describe("API router", () => {
	let fakeApp: SignalKApp;

	beforeEach(() => {
		vi.clearAllMocks();
		fakeApp = makeFakeApp();
	});

	it("GET /api/status returns the canonical shape", async () => {
		const pm: MockPluginManager = {
			getStatusSnapshot: () => ({
				pluginRunning: true,
				nmea2000Ready: true,
				enabledCount: 3,
				totalConversions: 45,
				perConversion: [],
				startTime: 1000,
			}),
			getConversionMetadata: () => [],
		};
		const ex = mountRouter(fakeApp, () => pm as PluginManager);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/status");
		expect(res.status).toBe(200);
		expect(res.body.enabledCount).toBe(3);
	});

	it("GET /api/conversions returns an array under .conversions", async () => {
		// /api/conversions does not read the snapshot, only the metadata list,
		// but a sound mock honors both methods of the narrowed surface.
		const pm: MockPluginManager = {
			getStatusSnapshot: () => ({
				pluginRunning: true,
				nmea2000Ready: false,
				enabledCount: 0,
				totalConversions: 0,
				perConversion: [],
				startTime: 0,
			}),
			getConversionMetadata: () => [
				{
					key: "WIND",
					title: "Wind",
					canResend: true,
					pgns: [],
					category: "navigation",
					presets: [],
					paths: [],
					extras: { type: "none" },
				},
			],
		};
		const ex = mountRouter(fakeApp, () => pm as PluginManager);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/conversions");
		expect(res.body.conversions).toHaveLength(1);
		expect(res.body.conversions[0].key).toBe("WIND");
	});

	it("GET /api/conversions serves the catalog when the manager is null", async () => {
		// A disabled plugin mounts the router (registerWithRouter) but never runs
		// start(), so getManager() is null. The catalog must still come back, else
		// the panel shows every category at zero and nothing can be configured.
		const ex = mountRouter(
			fakeApp,
			() => null,
			() => [
				{
					key: "WIND",
					title: "Wind",
					canResend: true,
					pgns: [],
					category: "navigation",
					presets: [],
					paths: [],
					extras: { type: "none" },
				},
			],
		);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/conversions");
		expect(res.status).toBe(200);
		expect(res.body.conversions).toHaveLength(1);
		expect(res.body.conversions[0].key).toBe("WIND");
	});

	it("GET /api/status reports an inactive plugin with the catalog total", async () => {
		const ex = mountRouter(
			fakeApp,
			() => null,
			() => [
				{
					key: "WIND",
					title: "Wind",
					canResend: true,
					pgns: ["130306"],
					category: "navigation",
					presets: [],
					paths: [],
					extras: { type: "none" },
				},
			],
		);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/status");
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			pluginRunning: false,
			nmea2000Ready: false,
			enabledCount: 0,
			totalConversions: 1,
		});
	});

	it("keeps the standalone catalog available after manager startup fails", async () => {
		const app = {
			...makeFakeApp(),
			debug: vi.fn(),
			on: vi.fn(),
			removeListener: vi.fn(),
			setPluginStatus: vi.fn(() => {
				throw new Error("forced startup failure");
			}),
			setPluginError: vi.fn(),
		} as unknown as SignalKApp;
		const plugin = createPlugin(app);
		expect(() => plugin.start({}, vi.fn())).toThrow("forced startup failure");

		const expressApp = express();
		const router: IRouter = express.Router();
		expect(plugin.registerWithRouter).toBeDefined();
		plugin.registerWithRouter?.(router);
		expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);

		const conversions = await request(expressApp).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/conversions",
		);
		const status = await request(expressApp).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/status",
		);

		expect(conversions.status).toBe(200);
		expect(conversions.body.conversions.length).toBeGreaterThan(0);
		expect(status.body).toMatchObject({
			pluginRunning: false,
			totalConversions: conversions.body.conversions.length,
		});

		plugin.stop();
	});

	it("persists an Advisor review without starting a disabled plugin", async () => {
		let savedConfig: unknown;
		const getSelfBus = vi.fn();
		const setPluginStatus = vi.fn();
		const app = {
			debug: Object.assign(vi.fn(), { enabled: false }),
			error: vi.fn(),
			on: vi.fn(),
			removeListener: vi.fn(),
			setPluginStatus,
			setPluginError: vi.fn(),
			streambundle: {
				getAvailablePaths: () => ["environment.depth.belowTransducer"],
				getSelfBus,
			},
			getSelfPath: () => ({ $source: "depth-sensor" }),
			getPath: (path: string) =>
				path === "sources" ? { "depth-sensor": { type: "plugin" } } : undefined,
			readPluginOptions: () => ({ configuration: { conversions: {} } }),
			savePluginOptions: (config: unknown, callback: (error?: Error) => void) => {
				savedConfig = config;
				callback();
			},
		} as unknown as SignalKApp;
		const plugin = createPlugin(app);
		const expressApp = express();
		expressApp.use(express.json());
		const router: IRouter = express.Router();
		plugin.registerWithRouter?.(router);
		expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);

		const response = await request(expressApp).post(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/review",
		);

		expect(response.status).toBe(200);
		expect(response.body.result.autoApplied[0]?.optionKey).toBe("DEPTH");
		expect(savedConfig).toMatchObject({
			conversions: { DEPTH: { enabled: true } },
		});
		expect(getSelfBus).not.toHaveBeenCalled();
		expect(setPluginStatus).not.toHaveBeenCalled();
		plugin.stop();
	});

	it("does not restart runtime from an Advisor save after host startup failed", async () => {
		let stored: Record<string, unknown> = { conversions: {} };
		let failHostStart = true;
		const getSelfBus = vi.fn(() => {
			throw new Error("runtime must remain stopped");
		});
		const setPluginStatus = vi.fn(() => {
			if (failHostStart) throw new Error("forced host startup failure");
		});
		const app = {
			debug: Object.assign(vi.fn(), { enabled: false }),
			error: vi.fn(),
			on: vi.fn(),
			removeListener: vi.fn(),
			setPluginStatus,
			setPluginError: vi.fn(),
			reportOutputMessages: vi.fn(),
			registerDeltaInputHandler: vi.fn(),
			subscriptionmanager: { subscribe: vi.fn() },
			streambundle: {
				getAvailablePaths: () => ["environment.depth.belowTransducer"],
				getSelfBus,
			},
			getSelfPath: () => ({ $source: "depth-sensor" }),
			getPath: (path: string) =>
				path === "sources" ? { "depth-sensor": { type: "plugin" } } : undefined,
			readPluginOptions: () => ({ configuration: stored }),
			savePluginOptions: (config: Record<string, unknown>, callback: (error?: Error) => void) => {
				stored = config;
				callback();
			},
		} as unknown as SignalKApp;
		const plugin = createPlugin(app);
		expect(() => plugin.start(stored, vi.fn())).toThrow("forced host startup failure");
		failHostStart = false;
		const statusCallsAfterFailure = setPluginStatus.mock.calls.length;

		const expressApp = express();
		expressApp.use(express.json());
		const router: IRouter = express.Router();
		plugin.registerWithRouter?.(router);
		expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);
		const response = await request(expressApp).post(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/review",
		);

		expect(response.status).toBe(200);
		expect(stored).toMatchObject({ conversions: { DEPTH: { enabled: true } } });
		expect(getSelfBus).not.toHaveBeenCalled();
		expect(setPluginStatus).toHaveBeenCalledTimes(statusCallsAfterFailure);
		plugin.stop();
	});

	it("fails closed when the authoritative plugin configuration cannot be read", async () => {
		const savePluginOptions = vi.fn();
		const app = {
			...makeFakeApp(),
			debug: Object.assign(vi.fn(), { enabled: false }),
			on: vi.fn(),
			removeListener: vi.fn(),
			readPluginOptions: () => {
				throw new Error("configuration storage unavailable");
			},
			savePluginOptions,
		} as unknown as SignalKApp;
		const plugin = createPlugin(app);
		const expressApp = express();
		expressApp.use(express.json());
		const router: IRouter = express.Router();
		plugin.registerWithRouter?.(router);
		expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);

		const response = await request(expressApp).post(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/review",
		);

		expect(response.status).toBe(500);
		expect(response.body.error).toBe(
			"The saved plugin configuration could not be read. No changes were made.",
		);
		expect(savePluginOptions).not.toHaveBeenCalled();
	});

	it("restores persisted config and runtime when an Advisor restart fails", async () => {
		const transactional = makeTransactionalAdvisorApp();
		const plugin = createPlugin(transactional.app);
		plugin.start(transactional.getStored(), vi.fn());
		const expressApp = express();
		expressApp.use(express.json());
		const router: IRouter = express.Router();
		plugin.registerWithRouter?.(router);
		expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);

		const response = await request(expressApp).post(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/review",
		);

		expect(response.status).toBe(500);
		expect(response.body.error).toBe(
			"The proposed configuration could not be started, so the previous configuration was restored.",
		);
		expect(transactional.saves).toHaveLength(2);
		expect(transactional.saves[0]).toMatchObject({
			conversions: { DEPTH: { enabled: true } },
		});
		expect(transactional.getStored()).toMatchObject({ conversions: {} });
		expect(transactional.getStored().conversions).toEqual({});
		expect(transactional.app.setPluginStatus).toHaveBeenLastCalledWith(
			"No conversions enabled. Enable at least one in plugin settings.",
		);
		plugin.stop();
	});

	it("reports incomplete recovery when an Advisor rollback save fails", async () => {
		const transactional = makeTransactionalAdvisorApp(true);
		const plugin = createPlugin(transactional.app);
		plugin.start(transactional.getStored(), vi.fn());
		const expressApp = express();
		expressApp.use(express.json());
		const router: IRouter = express.Router();
		plugin.registerWithRouter?.(router);
		expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);

		const response = await request(expressApp).post(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/review",
		);

		expect(response.status).toBe(500);
		expect(response.body.error).toBe(
			"The proposed configuration could not be started, and the previous configuration could not be fully restored. Check the Signal K server log, then restart the plugin.",
		);
		expect(transactional.saves).toHaveLength(2);
		expect(transactional.getStored()).toMatchObject({
			conversions: { DEPTH: { enabled: true } },
		});
		expect(transactional.app.error).toHaveBeenCalledWith(
			expect.stringContaining("advisor config rollback failed"),
		);
		plugin.stop();
	});

	it("GET /api/paths returns sorted paths", async () => {
		const ex = mountRouter(fakeApp, () => null);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/paths");
		expect(res.body.paths).toEqual(["a", "b"]);
	});

	it("GET /api/sources?path=navigation.position returns the source", async () => {
		const ex = mountRouter(fakeApp, () => null);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/sources?path=navigation.position",
		);
		expect(res.body.sources).toContain("gps1");
	});

	it("GET /api/sources without path returns 400", async () => {
		const ex = mountRouter(fakeApp, () => null);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/sources");
		expect(res.status).toBe(400);
	});

	it("GET /api/sources with whitespace-only path returns 400", async () => {
		const ex = mountRouter(fakeApp, () => null);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/sources?path=%20%20",
		);
		expect(res.status).toBe(400);
	});

	it("GET /api/sources trims surrounding whitespace before lookup", async () => {
		const ex = mountRouter(fakeApp, () => null);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/sources?path=%20navigation.position%20",
		);
		expect(res.status).toBe(200);
		expect(res.body.sources).toContain("gps1");
	});

	it("GET /api/sources with repeated path params returns 400", async () => {
		// Express parses `?path=a&path=b` into a string[]; the previous
		// String(...) coercion silently collapsed it to "a,b" and 200'd
		// with an empty source list. Should be a 400.
		const ex = mountRouter(fakeApp, () => null);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/sources?path=a&path=b",
		);
		expect(res.status).toBe(400);
	});

	it("POST /api/advisor/review returns the review result", async () => {
		const advisor = {
			runReview: async () => ({
				ranAt: "2026-05-16T10:00:00Z",
				autoApplied: [
					{
						optionKey: "DEPTH",
						action: "enable",
						currentlyEnabled: false,
						matchedPaths: ["navigation.depth.belowTransducer"],
						confidence: "high",
						origin: "live",
						reason: "x",
					},
				],
				pending: [],
				notes: [],
			}),
			getPending: () => [],
			applyReview: async () => 0,
		};
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => advisor,
		);
		const res = await request(ex).post(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/review",
		);
		expect(res.status).toBe(200);
		expect(res.body.result.autoApplied[0].optionKey).toBe("DEPTH");
	});

	it("GET /api/advisor/pending preserves the prior review context", async () => {
		const parked = {
			ranAt: "2026-07-31T12:00:00.000Z",
			autoApplied: [],
			pending: [],
			notes: ["QuestDB history unavailable; reviewed live data only."],
		};
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => makeAdvisorStub({ getPendingResult: () => parked }),
		);

		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/pending",
		);

		expect(res.status).toBe(200);
		expect(res.body.result).toEqual(parked);
	});

	it("returns 500 with safe actionable wording when an Advisor operation fails", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() =>
				makeAdvisorStub({
					runReview: async () => {
						throw new AdvisorOperationError(
							"sensitive internal detail",
							"The configuration could not be saved. No changes were applied.",
						);
					},
				}),
		);

		const res = await request(ex).post(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/review",
		);

		expect(res.status).toBe(500);
		expect(res.body.error).toBe("The configuration could not be saved. No changes were applied.");
		expect(res.text).not.toContain("sensitive internal detail");
		expect(fakeApp.error).toHaveBeenCalledWith(
			expect.stringContaining("sensitive internal detail"),
		);
	});

	it("POST /api/advisor/apply returns the Advisor's actual applied count", async () => {
		const calls: unknown[] = [];
		const advisor = {
			runReview: async () => ({
				ranAt: "",
				autoApplied: [],
				pending: [],
				notes: [],
			}),
			getPending: () => [],
			applyReview: async (d: unknown[]) => {
				calls.push(d);
				return 0;
			},
		};
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => advisor,
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({ decisions: [{ optionKey: "GPS", approved: true }] });
		expect(res.status).toBe(200);
		expect(res.body.applied).toBe(0);
		expect(calls).toHaveLength(1);
	});

	it("GET /api/advisor/questdb-test reports reachability", async () => {
		const advisor = {
			runReview: async () => ({
				ranAt: "",
				autoApplied: [],
				pending: [],
				notes: [],
			}),
			getPending: () => [],
			applyReview: async () => 0,
			testQuestDB: async () => ({ ok: true }),
		};
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => advisor,
		);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/questdb-test",
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});

	it("advisor endpoints 503 when no advisor is wired", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => null,
		);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/advisor/pending",
		);
		expect(res.status).toBe(503);
	});

	it("POST /api/advisor/apply rejects a non-array decisions body with 400", async () => {
		const calls: unknown[] = [];
		const advisor = makeAdvisorStub({
			applyReview: async (d: unknown) => {
				calls.push(d);
			},
		});
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => advisor,
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({ decisions: "nope" });
		expect(res.status).toBe(400);
		expect(calls).toHaveLength(0);
	});

	it("POST /api/advisor/apply rejects a null decision element with 400", async () => {
		const calls: unknown[] = [];
		const advisor = makeAdvisorStub({
			applyReview: async (d: unknown) => {
				calls.push(d);
			},
		});
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => advisor,
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({ decisions: [null] });
		expect(res.status).toBe(400);
		expect(calls).toHaveLength(0);
	});

	it("POST /api/advisor/apply rejects a decision missing optionKey with 400", async () => {
		const advisor = makeAdvisorStub();
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => advisor,
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({ decisions: [{ approved: true }] });
		expect(res.status).toBe(400);
	});

	it("POST /api/advisor/apply rejects a decision missing the approved flag", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => makeAdvisorStub(),
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({ decisions: [{ optionKey: "GPS", action: "disable" }] });
		expect(res.status).toBe(400);
	});

	it("POST /api/advisor/apply rejects unsupported actions", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => makeAdvisorStub(),
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({ decisions: [{ optionKey: "GPS", approved: true, action: "keep" }] });
		expect(res.status).toBe(400);
	});

	it("POST /api/advisor/apply requires reviewed sources for clear-source actions", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => makeAdvisorStub(),
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({ decisions: [{ optionKey: "GPS", approved: true, action: "clear-source" }] });
		expect(res.status).toBe(400);
	});

	it("POST /api/advisor/apply rejects malformed clear-source entries", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => makeAdvisorStub(),
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({
				decisions: [
					{
						optionKey: "GPS",
						approved: true,
						action: "clear-source",
						clearSources: [42],
					},
				],
			});
		expect(res.status).toBe(400);
	});

	it("POST /api/advisor/apply rejects padded clear-source paths", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => makeAdvisorStub(),
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({
				decisions: [
					{
						optionKey: "GPS",
						approved: true,
						action: "clear-source",
						clearSources: [{ path: " navigation.position", pinned: "stale-gps" }],
					},
				],
			});
		expect(res.status).toBe(400);
	});

	it.each(["", "   "])(
		"POST /api/advisor/apply rejects an empty clear-source pin %j",
		async (pinned) => {
			const ex = mountRouterWithAdvisor(
				fakeApp,
				() => null,
				() => makeAdvisorStub(),
			);
			const res = await request(ex)
				.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
				.send({
					decisions: [
						{
							optionKey: "GPS",
							approved: true,
							action: "clear-source",
							clearSources: [{ path: "navigation.position", pinned }],
						},
					],
				});
			expect(res.status).toBe(400);
		},
	);

	it("POST /api/advisor/apply rejects duplicate clear-source paths", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => makeAdvisorStub(),
		);
		const source = { path: "navigation.position", pinned: "stale-gps" };
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({
				decisions: [
					{
						optionKey: "GPS",
						approved: true,
						action: "clear-source",
						clearSources: [source, source],
					},
				],
			});
		expect(res.status).toBe(400);
	});

	it("POST /api/advisor/apply rejects clear sources on non-clear actions", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => makeAdvisorStub(),
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({
				decisions: [
					{
						optionKey: "GPS",
						approved: true,
						action: "enable",
						clearSources: [{ path: "navigation.position", pinned: "stale-gps" }],
					},
				],
			});
		expect(res.status).toBe(400);
	});

	it("POST /api/advisor/apply rejects the legacy path-only clear shape", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => makeAdvisorStub(),
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({
				decisions: [
					{
						optionKey: "GPS",
						approved: true,
						action: "clear-source",
						clearSourcePaths: ["navigation.position"],
					},
				],
			});
		expect(res.status).toBe(400);
	});

	it("POST /api/advisor/apply rejects the legacy path-only field on non-clear actions", async () => {
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() => makeAdvisorStub(),
		);
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({
				decisions: [
					{
						optionKey: "GPS",
						approved: true,
						action: "enable",
						clearSourcePaths: ["navigation.position"],
					},
				],
			});
		expect(res.status).toBe(400);
	});

	it("POST /api/advisor/apply forwards a value-bound clear-source approval", async () => {
		const calls: unknown[] = [];
		const ex = mountRouterWithAdvisor(
			fakeApp,
			() => null,
			() =>
				makeAdvisorStub({
					applyReview: async (decisions: unknown) => {
						calls.push(decisions);
						return 0;
					},
				}),
		);
		const decision = {
			optionKey: "GPS",
			approved: true,
			action: "clear-source",
			clearSources: [{ path: "navigation.position", pinned: "stale-gps" }],
		};
		const res = await request(ex)
			.post("/plugins/signalk-nmea2000-emitter-cannon/api/advisor/apply")
			.send({ decisions: [decision] });

		expect(res.status).toBe(200);
		expect(calls).toEqual([[decision]]);
	});
});
