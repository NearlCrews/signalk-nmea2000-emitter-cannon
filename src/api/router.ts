import type { PluginRouter } from "@signalk/server-api";
import type { Request, Response } from "express";
import { type Advisor, AdvisorOperationError } from "../advisor/advisor.js";
import type { PluginManager } from "../plugin-manager.js";
import type { SignalKApp } from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isPlainObject } from "../utils/validation.js";
import { enumerateActivePaths, enumerateSourcesForPath } from "./discovery.js";
import type {
	AdvisorApplyRequest,
	AdvisorApplyResponse,
	AdvisorPendingResponse,
	AdvisorQuestDbTestResponse,
	AdvisorReviewResponse,
	ConversionMetadata,
	ConversionsResponse,
	PathsResponse,
	SourcesResponse,
} from "./types.js";

const HTTP_STATUS = {
	BAD_REQUEST: 400,
	INTERNAL_SERVER_ERROR: 500,
	SERVICE_UNAVAILABLE: 503,
} as const;

function isAdvisorApplyDecision(value: unknown): boolean {
	if (
		!isPlainObject(value) ||
		typeof value.optionKey !== "string" ||
		value.optionKey.trim().length === 0 ||
		value.optionKey !== value.optionKey.trim() ||
		typeof value.approved !== "boolean"
	) {
		return false;
	}
	const action = value.action;
	if (
		action !== undefined &&
		action !== "enable" &&
		action !== "disable" &&
		action !== "clear-source"
	) {
		return false;
	}
	if (action !== "clear-source") {
		return value.clearSources === undefined && value.clearSourcePaths === undefined;
	}
	if (
		value.clearSourcePaths !== undefined ||
		!Array.isArray(value.clearSources) ||
		value.clearSources.length === 0
	) {
		return false;
	}
	const paths = new Set<string>();
	return value.clearSources.every((source) => {
		if (
			!isPlainObject(source) ||
			typeof source.path !== "string" ||
			source.path.length === 0 ||
			source.path !== source.path.trim() ||
			typeof source.pinned !== "string" ||
			source.pinned.trim().length === 0 ||
			paths.has(source.path)
		) {
			return false;
		}
		paths.add(source.path);
		return true;
	});
}

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
 * Signal K mounts routes registered directly through `registerWithRouter`
 * behind its admin authentication middleware. The plugin must not reach into
 * the server's internal security strategy or duplicate that middleware.
 */
export function createApiRouter(
	app: SignalKApp,
	getManager: () => PluginManager | null,
	getMetadata: () => ConversionMetadata[],
	getAdvisor: () => Advisor | null,
): (router: PluginRouter) => void {
	return (router) => {
		router.get("/api/status", (_req: Request, res: Response) => {
			const pm = getManager();
			if (!pm) {
				res.json({
					pluginRunning: false,
					nmea2000Ready: false,
					enabledCount: 0,
					totalConversions: getMetadata().length,
					perConversion: [],
					startTime: 0,
				});
				return;
			}
			const snapshot = pm.getStatusSnapshot();
			if (!snapshot.pluginRunning && snapshot.totalConversions === 0) {
				snapshot.totalConversions = getMetadata().length;
			}
			res.json(snapshot);
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

		// Every advisor route shares the same envelope: 503 only when no Advisor
		// is wired, and 500 for a failed operation. A typed operation error may
		// carry a safe, actionable panel message; internal details stay in logs.
		const advisorRoute =
			(handler: (advisor: Advisor, req: Request, res: Response) => Promise<void> | void) =>
			async (req: Request, res: Response): Promise<void> => {
				const advisor = getAdvisor();
				if (!advisor) {
					res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: "advisor unavailable" });
					return;
				}
				try {
					await handler(advisor, req, res);
				} catch (err) {
					app.error(`advisor request failed: ${errMessage(err)}`);
					res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
						error:
							err instanceof AdvisorOperationError
								? err.publicMessage
								: "The Advisor operation failed. Check the Signal K server log, then try again.",
					});
				}
			};

		router.post(
			"/api/advisor/review",
			advisorRoute(async (advisor, _req, res) => {
				const body: AdvisorReviewResponse = {
					result: await advisor.runReview(),
				};
				res.json(body);
			}),
		);

		router.get(
			"/api/advisor/pending",
			advisorRoute((advisor, _req, res) => {
				const body: AdvisorPendingResponse = {
					result: advisor.getPendingResult(),
				};
				res.json(body);
			}),
		);

		router.post(
			"/api/advisor/apply",
			advisorRoute(async (advisor, req, res) => {
				// Validate the request shape before touching the advisor: a
				// malformed body must not reach applyReview, which writes config.
				// Advisor additionally validates conversion keys and clear paths
				// against the loaded conversion metadata.
				const rawDecisions: unknown = isPlainObject(req.body) ? req.body.decisions : undefined;
				if (!Array.isArray(rawDecisions)) {
					res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "decisions must be an array" });
					return;
				}
				const allValid = rawDecisions.every(isAdvisorApplyDecision);
				if (!allValid) {
					res.status(HTTP_STATUS.BAD_REQUEST).json({
						error: "each decision must have a valid optionKey, approved flag, action, and paths",
					});
					return;
				}
				const decisions = rawDecisions as AdvisorApplyRequest["decisions"];
				const applied = await advisor.applyReview(decisions);
				const response: AdvisorApplyResponse = {
					applied,
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
	};
}
