import type { IRouter, Request, Response } from "express";
import type { Advisor } from "../advisor/advisor.js";
import type { PluginManager } from "../plugin-manager.js";
import type { SignalKApp } from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isPlainObject } from "../utils/validation.js";
import { enumerateActivePaths, enumerateSourcesForPath } from "./discovery.js";
import type {
	AdvisorApplyRequest,
	AdvisorApplyResponse,
	AdvisorModelsResponse,
	AdvisorPendingResponse,
	AdvisorQuestDbTestResponse,
	AdvisorReviewResponse,
	AdvisorTestKeyResponse,
	ConversionMetadata,
	ConversionsResponse,
	PathsResponse,
	SourcesResponse,
} from "./types.js";

const API_PREFIX = "/plugins/signalk-nmea2000-emitter-cannon/api";

const HTTP_STATUS = {
	BAD_REQUEST: 400,
	FORBIDDEN: 403,
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
 * `getMetadata` returns the conversion catalog independently of the manager:
 * signalk-server mounts this router for a disabled plugin but never calls
 * start(), so the catalog must come from a manager-free source until the user
 * enables the plugin, otherwise the panel shows every category at zero.
 *
 * All `/api/*` routes are admin-gated via `securityStrategy.addAdminMiddleware`
 * registered on the parent Express app at router setup time.
 */
export function createApiRouter(
	app: SignalKApp,
	getManager: () => PluginManager | null,
	getMetadata: () => ConversionMetadata[],
	getAdvisor: () => Advisor | null,
): (router: IRouter) => void {
	return (router) => {
		// Spec requires admin-gated routes. The optional-chain check below
		// stays defensive so the plugin still loads against older
		// signalk-server builds that don't expose securityStrategy /
		// addAdminMiddleware, but absence is logged once (not silently
		// no-op'd) so operators can see why the routes are unauthenticated.
		const addMw = app.securityStrategy?.addAdminMiddleware;
		const adminGuarded = typeof addMw === "function";
		if (adminGuarded) {
			addMw.call(app.securityStrategy, API_PREFIX);
		} else {
			app.error(
				`securityStrategy.addAdminMiddleware unavailable; read-only ${API_PREFIX}/* routes will be unauthenticated and the mutating advisor routes (review, apply, test-key) will be refused with 403. Update signalk-server to >= 2.x.`,
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
			const body: ConversionsResponse = { conversions: getMetadata() };
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

		// Mutating advisor routes have side effects (config writes, outbound
		// requests using the stored key), so they must not run unauthenticated.
		// When addAdminMiddleware is unavailable they fail closed with a 403,
		// while the read-only GETs stay open for older-server compatibility.
		const guardedAdvisorRoute = (
			handler: (
				advisor: Advisor,
				req: Request,
				res: Response,
			) => Promise<void> | void,
		) => {
			// Wrap once at registration; rebuilding the advisorRoute closure on
			// every request would allocate per hit for no benefit.
			const wrapped = advisorRoute(handler);
			return async (req: Request, res: Response): Promise<void> => {
				if (!adminGuarded) {
					res.status(HTTP_STATUS.FORBIDDEN).json({
						error:
							"This action requires an authenticated admin session, which this Signal K server build does not support. Update signalk-server to >= 2.x.",
					});
					return;
				}
				await wrapped(req, res);
			};
		};

		router.post(
			"/api/advisor/review",
			guardedAdvisorRoute(async (advisor, _req, res) => {
				const body: AdvisorReviewResponse = {
					result: await advisor.runReview(),
				};
				res.json(body);
			}),
		);

		router.get(
			"/api/advisor/pending",
			advisorRoute((advisor, _req, res) => {
				// Synthetic envelope: no run yet, so `ranAt` is omitted rather
				// than set to an empty string the panel would mis-parse as a
				// date.
				const body: AdvisorPendingResponse = {
					result: {
						autoApplied: [],
						pending: advisor.getPending(),
						notes: [],
					},
				};
				res.json(body);
			}),
		);

		router.post(
			"/api/advisor/apply",
			guardedAdvisorRoute(async (advisor, req, res) => {
				// Validate the request shape before touching the advisor: a
				// malformed body must not reach applyReview, which writes config.
				// Reject anything that is not an array of plain objects each
				// carrying a non-empty string optionKey. This also turns the
				// `[null]` case into a clean 400 instead of a thrown 503, and
				// blocks a missing-optionKey decision from injecting a
				// `conversions["undefined"]` entry. (The advisor additionally
				// allow-lists optionKey against known conversions.)
				const rawDecisions: unknown = isPlainObject(req.body)
					? req.body.decisions
					: undefined;
				if (!Array.isArray(rawDecisions)) {
					res
						.status(HTTP_STATUS.BAD_REQUEST)
						.json({ error: "decisions must be an array" });
					return;
				}
				const allValid = rawDecisions.every(
					(d) =>
						isPlainObject(d) &&
						typeof d.optionKey === "string" &&
						d.optionKey.length > 0,
				);
				if (!allValid) {
					res.status(HTTP_STATUS.BAD_REQUEST).json({
						error: "each decision must be an object with a non-empty optionKey",
					});
					return;
				}
				const decisions = rawDecisions as AdvisorApplyRequest["decisions"];
				await advisor.applyReview(decisions);
				const response: AdvisorApplyResponse = {
					applied: decisions.filter((d) => d.approved).length,
				};
				res.json(response);
			}),
		);

		router.get(
			"/api/advisor/questdb-test",
			advisorRoute(async (advisor, _req, res) => {
				const body: AdvisorQuestDbTestResponse = await advisor.testQuestDB();
				res.json(body);
			}),
		);

		router.post(
			"/api/advisor/test-key",
			guardedAdvisorRoute(async (advisor, _req, res) => {
				const body: AdvisorTestKeyResponse = await advisor.testKey();
				res.json(body);
			}),
		);

		router.get(
			"/api/advisor/models",
			advisorRoute(async (advisor, _req, res) => {
				const body: AdvisorModelsResponse = await advisor.listModels();
				res.json(body);
			}),
		);
	};
}
