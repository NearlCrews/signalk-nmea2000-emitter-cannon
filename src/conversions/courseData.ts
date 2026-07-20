import { DEFAULT_DATA_TIMEOUT_MS, SLOW_DATA_TIMEOUT_MS } from "../constants.js";
import type { SignalKApp } from "../types/index.js";
import { isPlainObject } from "../utils/validation.js";

const CALC_ROOT = "navigation.course.calcValues";
interface CachedCourseValue {
	value: unknown;
	updatedAt: number;
}

const courseValueCache = new WeakMap<SignalKApp, Map<string, CachedCourseValue>>();
const lastProcessedCourseDelta = new WeakMap<SignalKApp, object>();

/** Clear cached Course Provider deltas at a plugin lifecycle boundary. */
export function resetCourseValueCache(app: SignalKApp): void {
	courseValueCache.delete(app);
	lastProcessedCourseDelta.delete(app);
}

function nestedValue(value: unknown, path: string): unknown {
	for (const segment of path.split(".")) {
		if (!isPlainObject(value)) return undefined;
		value = value[segment];
	}
	return value;
}

function unwrapValue(value: unknown): unknown {
	return isPlainObject(value) && Object.hasOwn(value, "value") ? value.value : value;
}

function storeCourseValue(
	cache: Map<string, CachedCourseValue>,
	path: string,
	value: unknown,
	updatedAt: number,
): void {
	for (const cachedPath of cache.keys()) {
		if (cachedPath === path || cachedPath.startsWith(`${path}.`)) cache.delete(cachedPath);
	}
	cache.set(path, { value, updatedAt });
	if (!isPlainObject(value)) return;
	for (const [key, child] of Object.entries(value)) {
		storeCourseValue(cache, `${path}.${key}`, child, updatedAt);
	}
}

function cacheTtl(path: string): number {
	return path === "notifications.navigation" || path.startsWith("notifications.navigation.")
		? SLOW_DATA_TIMEOUT_MS
		: DEFAULT_DATA_TIMEOUT_MS;
}

function cachedCourseValue(
	cache: Map<string, CachedCourseValue>,
	path: string,
): CachedCourseValue | undefined {
	if (cache.has(path)) return cache.get(path);
	let ancestorPath = "";
	let ancestor: CachedCourseValue | undefined;
	for (const [cachedPath, entry] of cache) {
		if (path.startsWith(`${cachedPath}.`) && cachedPath.length > ancestorPath.length) {
			ancestorPath = cachedPath;
			ancestor = entry;
		}
	}
	return ancestorPath === "" || ancestor === undefined
		? undefined
		: {
				value: nestedValue(ancestor.value, path.slice(ancestorPath.length + 1)),
				updatedAt: ancestor.updatedAt,
			};
}

function freshCachedCourseValue(cache: Map<string, CachedCourseValue>, path: string): unknown {
	const entry = cachedCourseValue(cache, path);
	if (entry === undefined) return undefined;
	if (Date.now() - entry.updatedAt > cacheTtl(path)) {
		cache.delete(path);
		return undefined;
	}
	return unwrapValue(entry.value);
}

function freshFallbackValue(value: unknown, path: string): unknown {
	if (!isPlainObject(value) || !Object.hasOwn(value, "value")) return value;
	if (typeof value.timestamp === "string") {
		const timestamp = Date.parse(value.timestamp);
		if (Number.isFinite(timestamp) && Date.now() - timestamp > cacheTtl(path)) return undefined;
	}
	return value.value;
}

/** Read a canonical v2 Course Provider value directly from its delta. */
export function coursePathValue(app: SignalKApp, path: string, delta?: unknown): unknown {
	let cache = courseValueCache.get(app);
	if (!cache) {
		cache = new Map<string, CachedCourseValue>();
		courseValueCache.set(app, cache);
	}
	if (isPlainObject(delta) && lastProcessedCourseDelta.get(app) !== delta) {
		lastProcessedCourseDelta.set(app, delta);
		const updates = (delta as CourseDelta).updates;
		if (Array.isArray(updates)) {
			const entries = updates.flatMap((update) => update.values ?? []);
			if (
				entries.some(
					(entry) =>
						typeof entry.path === "string" &&
						(entry.path === CALC_ROOT || entry.path.startsWith(`${CALC_ROOT}.`)),
				)
			) {
				// Course Provider calculations are one coherent generation. A partial
				// newer batch must not inherit sibling values from the prior waypoint.
				for (const cachedPath of cache.keys()) {
					if (cachedPath === CALC_ROOT || cachedPath.startsWith(`${CALC_ROOT}.`)) {
						cache.delete(cachedPath);
					}
				}
			}
			const updatedAt = Date.now();
			for (const entry of entries) {
				if (
					typeof entry.path === "string" &&
					(entry.path === CALC_ROOT ||
						entry.path.startsWith(`${CALC_ROOT}.`) ||
						entry.path === "notifications.navigation" ||
						entry.path.startsWith("notifications.navigation."))
				) {
					storeCourseValue(cache, entry.path, entry.value, updatedAt);
				}
			}
		}
	}
	const cached = freshCachedCourseValue(cache, path);
	if (cached !== undefined) return cached;
	// Delta-driven callers must not combine a new event with an unversioned,
	// potentially stale full-model value after a cache miss or plugin restart.
	if (delta !== undefined) return undefined;
	return freshFallbackValue(app.getSelfPath(path), path);
}

export function courseCalculation(app: SignalKApp, path: string, delta?: unknown): unknown {
	const fullPath = `${CALC_ROOT}.${path}`;
	const deltaValue = coursePathValue(app, fullPath, delta);
	if (deltaValue !== undefined) return deltaValue;
	return freshFallbackValue(nestedValue(coursePathValue(app, CALC_ROOT, delta), path), fullPath);
}

interface CoursePoint {
	type?: unknown;
	position?: { latitude?: unknown; longitude?: unknown };
}

export interface CurrentCourse {
	activeRoute?: { pointIndex?: unknown } | null;
	nextPoint?: CoursePoint | null;
	previousPoint?: CoursePoint | null;
}

export function routePointIndex(course: CurrentCourse | null): number | undefined {
	const pointIndex = course?.activeRoute?.pointIndex;
	return Number.isInteger(pointIndex) &&
		(pointIndex as number) >= 0 &&
		(pointIndex as number) <= 4_294_967_291
		? (pointIndex as number)
		: undefined;
}

interface CourseDelta {
	context?: unknown;
	updates?: Array<{ values?: Array<{ path?: unknown; value?: unknown }> }>;
}

/** Return true when a self-vessel delta updates one of the requested paths. */
export function courseDeltaTouches(
	app: SignalKApp,
	delta: unknown,
	paths: readonly string[],
): boolean {
	if (!isPlainObject(delta)) return false;
	const candidate = delta as CourseDelta;
	const selfContext = app.selfId ? `vessels.${app.selfId}` : undefined;
	if (
		candidate.context !== undefined &&
		candidate.context !== "vessels.self" &&
		candidate.context !== selfContext
	) {
		return false;
	}
	if (!Array.isArray(candidate.updates)) return false;
	return candidate.updates.some((update) =>
		update.values?.some((entry) => {
			const entryPath = entry.path;
			return (
				typeof entryPath === "string" &&
				paths.some((path) => entryPath === path || entryPath.startsWith(`${path}.`))
			);
		}),
	);
}

export async function currentCourse(app: SignalKApp): Promise<CurrentCourse | null> {
	try {
		return (await app.getCourse()) as CurrentCourse;
	} catch {
		return null;
	}
}
