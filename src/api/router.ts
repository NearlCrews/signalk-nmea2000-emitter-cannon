import type { IRouter, Request, Response } from "express";
import type { Advisor } from "../advisor/advisor.js";
import type { PluginManager } from "../plugin-manager.js";
import type { SignalKApp } from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { enumerateActivePaths, enumerateSourcesForPath } from "./discovery.js";
import type {
	AdvisorApplyRequest,
	ConversionsResponse,
	PathsResponse,
	SourcesResponse,
} from "./types.js";

const API_PREFIX = "/plugins/signalk-nmea2000-emitter-cannon/api";

const HTTP_STATUS = {
	BAD_REQUEST: 400,
	SERVICE_UNAVAILABLE: 503,
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
	getAdvisor: () => Advisor | null,
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

		// Every advisor route shares the same envelope: 503 when no advisor is
		// wired, and any thrown error coerced to a 503. advisorRoute factors
		// that out so each handler is just its happy path.
		const advisorRoute =
			(
				handler: (
					advisor: Advisor,
					req: Request,
					res: Response,
				) => Promise<void> | void,
			) =>
			async (req: Request, res: Response): Promise<void> => {
				const advisor = getAdvisor();
				if (!advisor) {
					res
						.status(HTTP_STATUS.SERVICE_UNAVAILABLE)
						.json({ error: "advisor unavailable" });
					return;
				}
				try {
					await handler(advisor, req, res);
				} catch (err) {
					app.error(`advisor request failed: ${errMessage(err)}`);
					res
						.status(HTTP_STATUS.SERVICE_UNAVAILABLE)
						.json({ error: "request failed" });
				}
			};

		router.post(
			"/api/advisor/review",
			advisorRoute(async (advisor, _req, res) => {
				res.json({ result: await advisor.runReview() });
			}),
		);

		router.get(
			"/api/advisor/pending",
			advisorRoute((advisor, _req, res) => {
				res.json({
					result: {
						ranAt: "",
						autoApplied: [],
						pending: advisor.getPending(),
						notes: [],
					},
				});
			}),
		);

		router.post(
			"/api/advisor/apply",
			advisorRoute(async (advisor, req, res) => {
				const body = (req.body ?? {}) as Partial<AdvisorApplyRequest>;
				const decisions = Array.isArray(body.decisions) ? body.decisions : [];
				await advisor.applyReview(decisions);
				res.json({ applied: decisions.filter((d) => d.approved).length });
			}),
		);

		router.get(
			"/api/advisor/questdb-test",
			advisorRoute(async (advisor, _req, res) => {
				res.json(await advisor.testQuestDB());
			}),
		);
	};
}
