import type { IRouter } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiRouter } from "../api/router.js";
import type { PluginManager } from "../plugin-manager.js";
import type { SignalKApp } from "../types/index.js";

function mountRouter(
	app: SignalKApp,
	getPm: () => PluginManager | null,
): express.Express {
	const expressApp = express();
	const router: IRouter = express.Router();
	createApiRouter(app, getPm)(router);
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
		getPath: (p: string) =>
			p === "vessels.self.navigation.position"
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
		const pm = {
			getStatusSnapshot: () => ({
				nmea2000Ready: true,
				enabledCount: 3,
				totalConversions: 45,
				perConversion: [],
				startTime: 1000,
			}),
			getConversionMetadata: () => [],
		} as unknown as PluginManager;
		const ex = mountRouter(fakeApp, () => pm);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/status",
		);
		expect(res.status).toBe(200);
		expect(res.body.enabledCount).toBe(3);
	});

	it("GET /api/conversions returns an array under .conversions", async () => {
		const pm = {
			getStatusSnapshot: () => ({}) as never,
			getConversionMetadata: () => [{ key: "WIND" } as never],
		} as unknown as PluginManager;
		const ex = mountRouter(fakeApp, () => pm);
		const res = await request(ex).get(
			"/plugins/signalk-nmea2000-emitter-cannon/api/conversions",
		);
		expect(res.body.conversions).toEqual([{ key: "WIND" }]);
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
			getPath: () => undefined,
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
});
