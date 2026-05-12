import type { IRouter } from "express";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
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

describe("API router", () => {
	const fakeApp = {
		streambundle: { getAvailablePaths: () => ["a", "b"] },
		getPath: (p: string) =>
			p === "/sources" ? { gps1: { navigation: { position: {} } } } : undefined,
		securityStrategy: { addAdminMiddleware: vi.fn() },
	} as unknown as SignalKApp;

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

	it("calls addAdminMiddleware with the api prefix", async () => {
		const localApp = {
			streambundle: { getAvailablePaths: () => [] },
			getPath: () => undefined,
			securityStrategy: { addAdminMiddleware: vi.fn() },
		} as unknown as SignalKApp;
		mountRouter(localApp, () => null);
		expect(
			(
				localApp.securityStrategy as {
					addAdminMiddleware: ReturnType<typeof vi.fn>;
				}
			).addAdminMiddleware,
		).toHaveBeenCalledWith("/plugins/signalk-nmea2000-emitter-cannon/api");
	});
});
