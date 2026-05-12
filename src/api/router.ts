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
		app.securityStrategy?.addAdminMiddleware?.(API_PREFIX);

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
			const path = String(req.query.path ?? "");
			if (!path) {
				res.status(400).json({ error: "path required" });
				return;
			}
			const body: SourcesResponse = {
				sources: enumerateSourcesForPath(app, path),
			};
			res.json(body);
		});
	};
}
