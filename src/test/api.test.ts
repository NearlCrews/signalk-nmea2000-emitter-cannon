import type { IRouter } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiRouter } from "../api/router.js";
import type { PluginManager } from "../plugin-manager.js";
import type { SignalKApp } from "../types/index.js";

// Mock surface narrowed to the two methods createApiRouter calls on a
// PluginManager: getStatusSnapshot and getConversionMetadata. Tests cast
// the literal through this type instead of `as unknown as PluginManager`
// with embedded `as never` casts, so the structural shape is checked.
type MockPluginManager = Pick<
	PluginManager,
	"getStatusSnapshot" | "getConversionMetadata"
>;

function mountRouter(
	app: SignalKApp,
	getPm: () => PluginManager | null,
): express.Express {
	const expressApp = express();
	const router: IRouter = express.Router();
	createApiRouter(app, getPm, () => null)(router);
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
	createApiRouter(app, getPm, getAdvisor as never)(router);
	expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);
	return expressApp;
}

// Built per-test in beforeEach so each case starts with fresh mock state
// (a shared module-scoped fakeApp would accumulate vi.fn() call history
// across tests and let the addAdminMiddleware assertion succeed off prior
// runs).
function makeFakeApp(): SignalKApp {
	return {
		streambundle: { getAvailablePaths: () => ["a", "b"] },
		getSelfPath: (p: string) =>
			p === "navigation.position"
				? { $source: "gps1", values: { gps1: {} } }
				: undefined,
		securityStrategy: { addAdminMiddleware: vi.fn() },
		error: vi.fn(),
	} as unknown as SignalKApp;
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
				nmea2000Ready: true,
				enabledCount: 3,
				totalConversions: 45,
				perConversion: [],
				startTime: 1000,
			}),
			getConversionMetadata: () => [],
		};
		const ex = mountRouter(fakeApp, () => pm as PluginManager);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/status",
		);
		expect(res.status).toBe(200);
		expect(res.body.enabledCount).toBe(3);
	});

	it("GET /api/conversions returns an array under .conversions", async () => {
		// /api/conversions does not read the snapshot, only the metadata list,
		// but a sound mock honours both methods of the narrowed surface.
		const pm: MockPluginManager = {
			getStatusSnapshot: () => ({
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
					pgns: [],
					category: "navigation",
					presets: [],
					paths: [],
					extras: { type: "none" },
				},
			],
		};
		const ex = mountRouter(fakeApp, () => pm as PluginManager);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/conversions",
		);
		expect(res.body.conversions).toHaveLength(1);
		expect(res.body.conversions[0].key).toBe("WIND");
	});

	it("GET /api/paths returns sorted paths", async () => {
		const ex = mountRouter(fakeApp, () => null);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/paths",
		);
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
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/sources",
		);
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

	it("calls addAdminMiddleware with the api prefix", async () => {
		mountRouter(fakeApp, () => null);
		expect(
			(
				fakeApp.securityStrategy as {
					addAdminMiddleware: ReturnType<typeof vi.fn>;
				}
			).addAdminMiddleware,
		).toHaveBeenCalledWith("/plugins/signalk-nmea2000-emitter-cannon/api");
	});

	it("logs an error when securityStrategy.addAdminMiddleware is unavailable", async () => {
		const localApp = {
			streambundle: { getAvailablePaths: () => [] },
			getSelfPath: () => undefined,
			error: vi.fn(),
			// securityStrategy intentionally undefined to simulate older
			// signalk-server builds.
		} as unknown as SignalKApp;
		mountRouter(localApp, () => null);
		expect(
			(localApp as unknown as { error: ReturnType<typeof vi.fn> }).error,
		).toHaveBeenCalledTimes(1);
		const firstCall = (
			localApp as unknown as { error: ReturnType<typeof vi.fn> }
		).error.mock.calls[0];
		expect(firstCall?.[0]).toMatch(/addAdminMiddleware unavailable/);
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
			applyReview: async () => {},
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

	it("POST /api/advisor/apply forwards decisions and returns the count", async () => {
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
		expect(res.body.applied).toBe(1);
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
			applyReview: async () => {},
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
});
