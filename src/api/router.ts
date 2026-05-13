import type { IRouter, Request, Response } from "express";
import type { PluginManager } from "../plugin-manager.js";
import type { SignalKApp } from "../types/index.js";
import { enumerateActivePaths, enumerateSourcesForPath } from "./discovery.js";
import type {
	ConversionsResponse,
	PathsResponse,
	SourcesResponse,
} from "./types.js";

const API_PREFIX = "/plugins/signalk-nmea2000-emitter-cannon/api";

// UNAUTHORIZED is added defensively for future use even though the route
// handlers never emit it: the admin middleware installed above intercepts
// unauthenticated requests before they reach a handler.
const HTTP_STATUS = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
} as const;

/**
 * Factory for the panel's HTTP API router. Returns the function that
 * `Plugin.registerWithRouter` passes the Express router to.
 *
 * `getManager` is a closure so the router always sees the current
 * PluginManager. PluginManager is recreated on every start/stop cycle, so
 * holding a direct reference here would go stale after the first restart.
 *
 * All `/api/*` routes are admin-gated via `securityStrategy.addAdminMiddleware`
 * registered on the parent Express app at router setup time.
 */
export function createApiRouter(
	app: SignalKApp,
	getManager: () => PluginManager | null,
): (router: IRouter) => void {
	return (router) => {
		// Spec requires admin-gated routes. The optional-chain check below
		// stays defensive so the plugin still loads against older
		// signalk-server builds that don't expose securityStrategy /
		// addAdminMiddleware, but absence is logged once (not silently
		// no-op'd) so operators can see why the routes are unauthenticated.
		const addMw = app.securityStrategy?.addAdminMiddleware;
		if (typeof addMw === "function") {
			addMw.call(app.securityStrategy, API_PREFIX);
		} else {
			app.error(
				`securityStrategy.addAdminMiddleware unavailable; ${API_PREFIX}/* routes will be unauthenticated. Update signalk-server to >= 2.x.`,
			);
		}

		router.get("/api/status", (_req: Request, res: Response) => {
			const pm = getManager();
			if (!pm) {
				res.json({
					nmea2000Ready: false,
					enabledCount: 0,
					totalConversions: 0,
					perConversion: [],
					startTime: 0,
				});
				return;
			}
			res.json(pm.getStatusSnapshot());
		});

		router.get("/api/conversions", (_req: Request, res: Response) => {
			const pm = getManager();
			const body: ConversionsResponse = {
				conversions: pm ? pm.getConversionMetadata() : [],
			};
			res.json(body);
		});

		router.get("/api/paths", (_req: Request, res: Response) => {
			const body: PathsResponse = { paths: enumerateActivePaths(app) };
			res.json(body);
		});

		router.get("/api/sources", (req: Request, res: Response) => {
			// Express parses repeated query params (`?path=a&path=b`) into a
			// string[], and nested params into an object. Coercing those via
			// String(...) would silently produce `"a,b"` / `"[object Object]"`
			// and 200 with an empty source list. Reject anything that isn't a
			// single non-empty string, then trim so a stray leading/trailing
			// whitespace from a hand-typed URL does not produce an empty
			// source list under a 200 response.
			const raw = req.query.path;
			if (typeof raw !== "string") {
				res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "path required" });
				return;
			}
			const path = raw.trim();
			if (!path) {
				res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "path required" });
				return;
			}
			const body: SourcesResponse = {
				sources: enumerateSourcesForPath(app, path),
			};
			res.json(body);
		});
	};
}
