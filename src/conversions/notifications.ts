import { type Delta, hasValues, type Timestamp } from "@signalk/server-api";
import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { isDebugEnabled } from "../utils/debugUtils.js";
import { matchPathPrefix } from "../utils/pathUtils.js";

interface AlertValue {
	state: string;
	message: string;
	alertId?: number;
	method?: string[];
}

function isAlertValue(v: unknown): v is AlertValue {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	return typeof obj.state === "string" && typeof obj.message === "string";
}

// Values mirror @canboat/ts-pgns AlertType enum verbatim. Kept inline so the
// plugin doesn't take a runtime dependency on ts-pgns (which is only a
// transitive dev dep via canboatjs).
const alertTypes: Record<string, string> = {
	emergency: "Emergency Alarm",
	alarm: "Alarm",
	warn: "Warning",
	alert: "Caution",
};

// IEC 62923 alert priorities: lower number = higher priority.
const alertPriorities: Record<string, number> = {
	emergency: 1,
	alarm: 2,
	warn: 3,
	alert: 4,
};

// Path prefixes that surface as Navigational alerts on Garmin/B&G chart screens.
// Everything else falls through to Technical.
const CATEGORY_BY_PATH_PREFIX: ReadonlyArray<readonly [string, string]> = [
	["notifications.mob", "Navigational"],
	["notifications.navigation", "Navigational"],
	["notifications.anchor", "Navigational"],
	["notifications.arrival", "Navigational"],
	["notifications.gnss", "Navigational"],
];

function categoryForPath(path: string): string {
	return matchPathPrefix(path, CATEGORY_BY_PATH_PREFIX) ?? "Technical";
}

const DEFAULT_ALERT_TYPE = "Caution";
const DEFAULT_ALERT_PRIORITY = 4;
const alertSystem = 5;
// alertId field in PGN 126983/126985 is 16-bit unsigned (RangeMax 65532).
// MAX_ALERT_ID stays one below the spec max so the canboat encoder never sees
// the "data not available" sentinel.
const MAX_ALERT_ID = 65531;
// Hard caps so a misbehaving upstream cannot grow plugin state without bound.
// 256 distinct active notification paths and 256 cached PGN entries cover
// realistic load (each alarm contributes 2 PGN entries) with safe headroom.
const MAX_TRACKED_PATHS = 256;
const MAX_PGN_ENTRIES = 256;

function getAlertState(isAcknowledged: boolean, hasSound: boolean): string {
	if (isAcknowledged) return "Acknowledged";
	if (hasSound) return "Active";
	return "Silenced";
}

function commonAlertFields(alertId: number, type: string, category: string) {
	return {
		alertId,
		alertType: type,
		alertCategory: category,
		alertSystem,
		alertSubSystem: 0,
		dataSourceNetworkIdName: alertId,
		dataSourceInstance: 0,
		dataSourceIndexSource: 0,
		alertOccurrenceNumber: 0,
	};
}

export default function createNotificationsConversion(
	app: SignalKApp,
	plugin: { id: string },
): ConversionModule {
	const usedAlertIds = new Set<number>();
	let nextAlertIdHint = 1;
	const ids: Map<string, number> = new Map();
	// alertIdToPath is the reverse of `ids` for the entries we allocated.
	// Load-bearing: `releaseAlertId` uses it to keep `ids` in sync when the
	// PGN-cap path evicts an entry, otherwise a released alertId could later
	// be re-allocated to a different path while the old path still has a
	// stale `ids` binding pointing at the same number.
	const alertIdToPath: Map<number, string> = new Map();
	const pgnsByAlertId: Map<number, [N2KMessage, N2KMessage]> = new Map();
	// Flat view of pgnsByAlertId, rebuilt only when the map mutates. The
	// conversion callback returns this reference unchanged on every dedup
	// path, matching the pre-1.4.3 zero-allocation cost model.
	let cachedFlat: N2KMessage[] = [];
	let excludePrefixes: string[] = [];

	function rebuildFlat(): void {
		const next: N2KMessage[] = [];
		for (const [a, b] of pgnsByAlertId.values()) next.push(a, b);
		cachedFlat = next;
	}

	function allocateAlertId(): number | undefined {
		for (let i = 0; i < MAX_ALERT_ID; i++) {
			const candidate = ((nextAlertIdHint - 1 + i) % MAX_ALERT_ID) + 1;
			if (!usedAlertIds.has(candidate)) {
				usedAlertIds.add(candidate);
				nextAlertIdHint = candidate + 1;
				return candidate;
			}
		}
		return undefined;
	}

	function releaseAlertId(alertId: number): void {
		const path = alertIdToPath.get(alertId);
		if (path !== undefined) ids.delete(path);
		alertIdToPath.delete(alertId);
		usedAlertIds.delete(alertId);
		pgnsByAlertId.delete(alertId);
		rebuildFlat();
	}

	function resetState(): void {
		pgnsByAlertId.clear();
		usedAlertIds.clear();
		alertIdToPath.clear();
		ids.clear();
		nextAlertIdHint = 1;
		cachedFlat = [];
	}

	return {
		title: "Notifications (PGNs 126983, 126985)",
		optionKey: "NOTIFICATIONS",
		keys: ["notifications.*"],
		context: VESSELS_SELF_CONTEXT,
		sourceType: "subscription",
		onOptionsLoaded: (options) => {
			const raw =
				typeof options.excludePaths === "string" ? options.excludePaths : "";
			excludePrefixes = raw
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			// Reset alert state on config change so newly excluded paths don't
			// leak through stale cached PGNs.
			resetState();
			if (excludePrefixes.length > 0) {
				app.debug(
					`Notifications excluding paths: ${excludePrefixes.join(", ")}`,
				);
			}
		},
		callback: (delta: Delta): N2KMessage[] => {
			if (
				!delta?.updates ||
				!Array.isArray(delta.updates) ||
				delta.updates.length === 0
			) {
				return [];
			}

			const firstUpdate = delta.updates[0];
			if (
				!firstUpdate ||
				!hasValues(firstUpdate) ||
				firstUpdate.values.length === 0
			) {
				return [];
			}

			const update = firstUpdate.values[0];
			if (!update) {
				return [];
			}

			if (!isAlertValue(update.value)) {
				return cachedFlat;
			}
			const value = update.value;

			if (update.path.includes("notifications.nmea")) {
				return cachedFlat;
			}

			if (
				excludePrefixes.length > 0 &&
				excludePrefixes.some((prefix) => update.path.startsWith(prefix))
			) {
				return cachedFlat;
			}

			const category = categoryForPath(update.path);
			const type = alertTypes[value.state] ?? DEFAULT_ALERT_TYPE;
			const priority = alertPriorities[value.state] ?? DEFAULT_ALERT_PRIORITY;
			if (alertTypes[value.state] === undefined && value.state !== "normal") {
				app.debug(
					`Unknown notification state "${value.state}" on ${update.path}; emitting as Caution`,
				);
			}

			if (typeof value.alertId === "number") {
				const alertId = value.alertId;
				app.debug(`Using existing alertId ${alertId} for ${update.path}`);

				if (value.state === "normal") {
					releaseAlertId(alertId);
					return cachedFlat;
				}

				const method = value.method || [];
				const isAcknowledged = method.length === 0;
				const hasSound = method.includes("sound");
				const state = getAlertState(isAcknowledged, hasSound);
				const common = commonAlertFields(alertId, type, category);

				pgnsByAlertId.set(alertId, [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 126985,
						dst: N2K_BROADCAST_DST,
						fields: {
							...common,
							languageId: "English (US)",
							alertTextDescription: value.message,
						},
					},
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 126983,
						dst: N2K_BROADCAST_DST,
						fields: {
							...common,
							temporarySilenceStatus:
								!isAcknowledged && !hasSound ? "Yes" : "No",
							acknowledgeStatus: isAcknowledged ? "Yes" : "No",
							escalationStatus: "No",
							temporarySilenceSupport: "Yes",
							acknowledgeSupport: "Yes",
							escalationSupport: "No",
							triggerCondition: "Auto",
							thresholdStatus: "Threshold Exceeded",
							alertPriority: priority,
							alertState: state,
						},
					},
				]);
				rebuildFlat();

				// Drop oldest tracked alerts when over cap so a rotating-alertId
				// stream cannot grow the cache unbounded. releaseAlertId rebuilds
				// the flat view itself.
				if (pgnsByAlertId.size > MAX_PGN_ENTRIES) {
					const firstKey = pgnsByAlertId.keys().next().value;
					if (firstKey !== undefined) releaseAlertId(firstKey);
				}

				return cachedFlat;
			}

			const existing = ids.get(update.path);
			let alertId: number;
			if (existing !== undefined) {
				alertId = existing;
				app.debug(`Assigning existing alertId ${alertId} to ${update.path}`);
			} else {
				const allocated = allocateAlertId();
				if (allocated === undefined) {
					app.error(
						`Notifications: alertId pool exhausted (${MAX_ALERT_ID} active); dropping ${update.path}`,
					);
					return cachedFlat;
				}
				alertId = allocated;
				ids.set(update.path, alertId);
				alertIdToPath.set(alertId, update.path);
				app.debug(`Assigning new alertId ${alertId} to ${update.path}`);
				// Evict the oldest tracked path so a misbehaving stream that
				// fires warnings without ever normalising cannot grow `ids`
				// unbounded. releaseAlertId handles the ids cleanup via
				// alertIdToPath.
				if (ids.size > MAX_TRACKED_PATHS) {
					const oldest = ids.keys().next().value;
					if (oldest !== undefined) {
						const oldestId = ids.get(oldest);
						if (oldestId !== undefined) releaseAlertId(oldestId);
					}
				}
			}

			const modifiedDelta: Partial<Delta> = {
				...(delta.context !== undefined && { context: delta.context }),
				updates: [
					{
						source: { label: plugin.id, type: "plugin" },
						timestamp: new Date().toISOString() as Timestamp,
						values: [
							{
								path: update.path,
								value: {
									...value,
									alertType: type,
									alertCategory: category,
									alertSystem,
									alertId,
								},
							},
						],
					},
				],
			};

			if (isDebugEnabled(app)) {
				app.debug(`New delta with alertId: ${JSON.stringify(modifiedDelta)}`);
			}
			app.handleMessage(plugin.id, modifiedDelta);

			return cachedFlat;
		},
		tests: [
			{
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301250",
						updates: [
							{
								values: [
									{
										path: "notifications.environment.inside.refrigerator.temperature",
										value: {
											state: "alert",
											message: "The Fridge Temperature is high",
											alertId: 1,
										},
									},
								],
							},
						],
					},
				],
				expected: [
					{
						prio: 2,
						pgn: 126985,
						dst: 255,
						fields: {
							alertType: "Caution",
							alertCategory: "Technical",
							alertSystem: 5,
							alertSubSystem: 0,
							alertId: 1,
							dataSourceNetworkIdName: 1,
							dataSourceInstance: 0,
							dataSourceIndexSource: 0,
							alertOccurrenceNumber: 0,
							languageId: "English (US)",
							alertTextDescription: "The Fridge Temperature is high",
						},
					},
					{
						prio: 2,
						pgn: 126983,
						dst: 255,
						fields: {
							alertType: "Caution",
							alertCategory: "Technical",
							alertSystem: 5,
							alertSubSystem: 0,
							alertId: 1,
							dataSourceNetworkIdName: 1,
							dataSourceInstance: 0,
							dataSourceIndexSource: 0,
							alertOccurrenceNumber: 0,
							temporarySilenceStatus: "No",
							acknowledgeStatus: "Yes",
							escalationStatus: "No",
							temporarySilenceSupport: "Yes",
							acknowledgeSupport: "Yes",
							escalationSupport: "No",
							triggerCondition: "Auto",
							thresholdStatus: "Threshold Exceeded",
							alertPriority: 4,
							alertState: "Acknowledged",
						},
					},
				],
			},
		],
	};
}
