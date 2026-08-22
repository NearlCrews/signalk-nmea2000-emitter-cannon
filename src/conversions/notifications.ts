import type { Delta, PathValue, SourceRef, Timestamp, Update } from "@signalk/server-api";
import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SOURCE_TYPE,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import { classifySourceOrigin, SOURCE_ORIGIN } from "../recommendation/busSource.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { isDebugEnabled } from "../utils/debugUtils.js";
import { isClearState } from "../utils/notificationUtils.js";
import { matchPathPrefix, pathMatchesPrefix } from "../utils/pathUtils.js";

// Local copy of @signalk/server-api's `hasValues` type guard. Importing it as a
// value pulls the whole server-api package (FullSignalK, BaconJS) into the
// esbuild ESM bundle, where its dynamic `require("events")` throws at load.
// Keeping server-api a type-only import keeps the runtime bundle lean.
function hasValues(u: Update): u is Update & { values: PathValue[] } {
	return "values" in u && Array.isArray(u.values);
}

interface AlertValue {
	state: string;
	message?: string;
	alertId?: number;
	method?: string[];
	status?: {
		silenced?: boolean;
		acknowledged?: boolean;
		canSilence?: boolean;
		canAcknowledge?: boolean;
	};
}

function isAlertValue(v: unknown): v is AlertValue {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	return typeof obj.state === "string";
}

type ActiveAlertValue = AlertValue & { message: string };

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
// Canboat defines the PGN 126983/126985 alertId field as an integer from 0
// through 65532. Values 65533 through 65535 are reserved sentinels. Preserve
// upstream zero IDs, but keep locally allocated IDs nonzero.
const MIN_ALERT_ID = 0;
const MIN_ALLOCATED_ALERT_ID = 1;
const MAX_ALERT_ID = 65532;
// Hard caps so a misbehaving upstream cannot grow plugin state without bound.
// 256 distinct active notification paths and 256 cached alert entries cover
// realistic load. Each cached alert entry contains its status and text PGNs.
const MAX_TRACKED_PATHS = 256;
const MAX_CACHED_ALERTS = 256;

// CanboatJS writes STRING_LAU with its one-byte ASCII mode and stores the
// payload length in one byte, so alert text has to be printable and
// single-byte. The size cap is set by the fast-packet limit rather than by the
// encoder buffer: 32 frames carry 6 + 31 * 7 = 223 bytes, and at exactly 200
// characters PGN 126985 is already 221 payload bytes. Adding any currently
// omitted field to that PGN would push it over, so the cap has to come down
// with it.
const MAX_ALERT_TEXT_BYTES = 200;
const ASCII_SPACE = 0x20;
const ASCII_PRINTABLE_MAX = 0x7e;
const ASCII_REPLACEMENT = 0x3f;

function sanitizeAlertText(value: string): string {
	const bytes: number[] = [];
	for (const character of value) {
		if (bytes.length >= MAX_ALERT_TEXT_BYTES) break;
		const codePoint = character.codePointAt(0);
		if (codePoint !== undefined && codePoint >= ASCII_SPACE && codePoint <= ASCII_PRINTABLE_MAX) {
			bytes.push(codePoint);
		} else if (character === "\t" || character === "\n" || character === "\r") {
			bytes.push(ASCII_SPACE);
		} else {
			bytes.push(ASCII_REPLACEMENT);
		}
	}
	return String.fromCharCode(...bytes);
}

// Object param to prevent a transposition trap: acknowledgement and silence
// are distinct states, but a positional call site could swap them silently.
function getAlertState({
	isAcknowledged,
	isSilenced,
}: {
	isAcknowledged: boolean;
	isSilenced: boolean;
}): string {
	if (isAcknowledged) return "Acknowledged";
	return isSilenced ? "Silenced" : "Active";
}

function yesNo(value: boolean): "Yes" | "No" {
	return value ? "Yes" : "No";
}

function isValidAlertId(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= MIN_ALERT_ID &&
		value <= MAX_ALERT_ID
	);
}

function commonAlertFields(alertId: number, type: string, category: string) {
	return {
		alertId,
		alertType: type,
		alertCategory: category,
		alertSystem,
		alertSubSystem: 0,
		// Omit dataSourceNetworkIdName until the plugin has a stable producer
		// ISO NAME. Zero would claim a real producer identity rather than N/A.
		dataSourceInstance: 0,
		dataSourceIndexSource: 0,
		alertOccurrenceNumber: 0,
	};
}

interface BuildAlertPgnsArgs {
	alertId: number;
	type: string;
	category: string;
	priority: number;
	value: ActiveAlertValue;
}

function buildAlertPgns({
	alertId,
	type,
	category,
	priority,
	value,
}: BuildAlertPgnsArgs): [N2KMessage, N2KMessage] {
	// Signal K status is the only authoritative control state. `method`
	// describes presentation and cannot prove that an alert was acknowledged
	// or silenced. Missing canonical flags therefore default safely to false.
	const isAcknowledged = value.status?.acknowledged === true;
	const isSilenced = value.status?.silenced === true;
	const state = getAlertState({ isAcknowledged, isSilenced });
	const common = commonAlertFields(alertId, type, category);
	return [
		{
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 126985,
			dst: N2K_BROADCAST_DST,
			fields: {
				...common,
				languageId: "English (US)",
				alertTextDescription: sanitizeAlertText(value.message),
			},
		},
		{
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 126983,
			dst: N2K_BROADCAST_DST,
			fields: {
				...common,
				temporarySilenceStatus: yesNo(isSilenced),
				acknowledgeStatus: yesNo(isAcknowledged),
				escalationStatus: "No",
				// Do not advertise controls until PGN 126984 responses are handled.
				temporarySilenceSupport: "No",
				acknowledgeSupport: "No",
				escalationSupport: "No",
				triggerCondition: "Auto",
				thresholdStatus: "Threshold Exceeded",
				alertPriority: priority,
				alertState: state,
			},
		},
	];
}

function buildDeactivationPgn(activeStatus: N2KMessage): N2KMessage {
	return {
		...activeStatus,
		fields: {
			...activeStatus.fields,
			temporarySilenceStatus: "No",
			acknowledgeStatus: "No",
			escalationStatus: "No",
			triggerCondition: "Auto",
			thresholdStatus: "Normal",
			alertState: "Normal",
		},
	};
}

interface BatchDeactivations {
	entryStatuses: ReadonlyMap<number, N2KMessage>;
	pending: Map<number, N2KMessage>;
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
	// Cached PGN pair + payload digest per active alert. The digest is
	// computed at set time so the per-callback emit gate is an integer
	// `Date.now` check plus a string compare, not a stringify per active
	// alert per delta.
	const pgnsByAlertId: Map<number, { pgns: [N2KMessage, N2KMessage]; digest: string }> = new Map();
	// Per-alert emit gate. The conversion callback fires for every
	// `notifications.*` delta on the vessel (Evinrude alone broadcasts 24
	// state=normal paths at ~2.4 Hz each), so returning the full PGN cache
	// on every invocation flooded the bus at ~100 PGN/s per active alert.
	// Emit immediately when the payload digest changes. Otherwise, repeat an
	// unchanged alert no more than once per MIN_EMIT_INTERVAL_MS (at most 1 Hz).
	const emitTracker: Map<number, { lastEmitMs: number; lastDigest: string }> = new Map();
	const MIN_EMIT_INTERVAL_MS = 1000;
	const EMPTY_EMIT: N2KMessage[] = [];
	let excludePrefixes: string[] = [];

	function sourceIsAccepted(deltaUpdate: Update, getSourceMetadata: () => unknown): boolean {
		const sourceRef = typeof deltaUpdate.$source === "string" ? deltaUpdate.$source : "";
		if (
			sourceRef === plugin.id ||
			sourceRef.startsWith(`${plugin.id}.`) ||
			(deltaUpdate.source?.type === "plugin" && deltaUpdate.source.label === plugin.id)
		) {
			return false;
		}
		let origin = classifySourceOrigin(sourceRef, deltaUpdate.source);
		if (origin === SOURCE_ORIGIN.UNKNOWN) {
			origin = classifySourceOrigin(sourceRef, undefined, getSourceMetadata());
		}
		return origin !== SOURCE_ORIGIN.NMEA2000;
	}

	function pathIsAccepted(path: string): boolean {
		return (
			path.startsWith("notifications.") &&
			!pathMatchesPrefix(path, "notifications.nmea") &&
			!excludePrefixes.some((prefix) => pathMatchesPrefix(path, prefix))
		);
	}

	function valueIsAccepted(value: unknown): boolean {
		if (value === null) return true;
		if (!isAlertValue(value)) return false;
		return isClearState(value.state) || typeof value.message === "string";
	}

	function deltaIsAccepted(candidate: unknown): boolean {
		if (typeof candidate !== "object" || candidate === null) return false;
		const delta = candidate as Delta;
		if (!Array.isArray(delta.updates) || delta.updates.length === 0) return false;
		let sourceMetadataLoaded = false;
		let sourceMetadata: unknown;
		const getSourceMetadata = () => {
			if (!sourceMetadataLoaded) {
				sourceMetadata = app.getPath?.("sources");
				sourceMetadataLoaded = true;
			}
			return sourceMetadata;
		};

		for (const deltaUpdate of delta.updates) {
			if (!hasValues(deltaUpdate) || deltaUpdate.values.length === 0) continue;
			if (!sourceIsAccepted(deltaUpdate, getSourceMetadata)) continue;
			for (const update of deltaUpdate.values) {
				if (
					update &&
					typeof update.path === "string" &&
					pathIsAccepted(update.path) &&
					valueIsAccepted(update.value)
				) {
					return true;
				}
			}
		}
		return false;
	}

	function setAlertPgns(alertId: number, pgns: [N2KMessage, N2KMessage]): void {
		// Delete before set so a refresh moves this alert to the newest end of the
		// Map's insertion order, the same way ais.ts and raymarineAlarms.ts keep
		// their caps behaving as an LRU. Map.set on an existing key preserves the
		// original position, so without this the eviction below would take the
		// oldest alert by first sighting rather than the least recently seen: at
		// the cap it would clear the anchor alarm that had been active for hours,
		// then re-allocate it on its next delta, so the alarm flapped on the
		// chartplotter.
		pgnsByAlertId.delete(alertId);
		pgnsByAlertId.set(alertId, { pgns, digest: JSON.stringify(pgns) });
	}

	function evictOldestIfOverCap(deactivations: BatchDeactivations): void {
		if (pgnsByAlertId.size <= MAX_CACHED_ALERTS) return;
		const firstKey = pgnsByAlertId.keys().next().value;
		if (firstKey !== undefined) releaseAlertId(firstKey, deactivations);
	}

	function buildEmitList(): N2KMessage[] {
		if (pgnsByAlertId.size === 0) return EMPTY_EMIT;
		const now = Date.now();
		const out: N2KMessage[] = [];
		for (const [alertId, entry] of pgnsByAlertId) {
			const prev = emitTracker.get(alertId);
			const changed = prev === undefined || prev.lastDigest !== entry.digest;
			const stale = prev === undefined || now - prev.lastEmitMs >= MIN_EMIT_INTERVAL_MS;
			if (changed || stale) {
				out.push(entry.pgns[0], entry.pgns[1]);
				emitTracker.set(alertId, { lastEmitMs: now, lastDigest: entry.digest });
			}
		}
		return out.length === 0 ? EMPTY_EMIT : out;
	}

	function allocateAlertId(): number | undefined {
		const allocationCount = MAX_ALERT_ID - MIN_ALLOCATED_ALERT_ID + 1;
		for (let i = 0; i < allocationCount; i++) {
			const candidate =
				((nextAlertIdHint - MIN_ALLOCATED_ALERT_ID + i) % allocationCount) + MIN_ALLOCATED_ALERT_ID;
			if (!usedAlertIds.has(candidate)) {
				usedAlertIds.add(candidate);
				nextAlertIdHint = candidate === MAX_ALERT_ID ? MIN_ALLOCATED_ALERT_ID : candidate + 1;
				return candidate;
			}
		}
		return undefined;
	}

	function releaseAlertId(alertId: number, deactivations: BatchDeactivations): void {
		const entryStatus = deactivations.entryStatuses.get(alertId);
		const path = alertIdToPath.get(alertId);
		if (entryStatus !== undefined && !deactivations.pending.has(alertId)) {
			deactivations.pending.set(alertId, buildDeactivationPgn(entryStatus));
		}
		if (path !== undefined) ids.delete(path);
		alertIdToPath.delete(alertId);
		usedAlertIds.delete(alertId);
		pgnsByAlertId.delete(alertId);
		emitTracker.delete(alertId);
	}

	// Single mutator for the path<->alertId binding, used by both the
	// upstream-supplied-id path and the auto-allocate path. Releasing any id
	// previously bound to this path first keeps ids, alertIdToPath, and
	// usedAlertIds in lockstep: without it, an upstream that changes the
	// alertId for a path leaks the old id in pgnsByAlertId (ghost PGNs that
	// can never be cleared) and corrupts the reverse map (alertIdToPath for
	// the old id still points at the path, so a later releaseAlertId(oldId)
	// would delete the NEW path binding).
	function bindAlertId(path: string, alertId: number, deactivations: BatchDeactivations): void {
		const previous = ids.get(path);
		if (previous === alertId) {
			// Binding unchanged, so there is no release work to do, but the path
			// still has to move to the newest end so the MAX_TRACKED_PATHS eviction
			// stays least-recently-seen rather than first-seen.
			ids.delete(path);
			ids.set(path, alertId);
			return;
		}
		if (previous !== undefined) releaseAlertId(previous, deactivations);
		const previousPath = alertIdToPath.get(alertId);
		if (previousPath !== undefined && previousPath !== path) {
			releaseAlertId(alertId, deactivations);
		}
		usedAlertIds.add(alertId);
		ids.set(path, alertId);
		alertIdToPath.set(alertId, path);
	}

	function releasePath(path: string, deactivations: BatchDeactivations): void {
		const alertId = ids.get(path);
		if (alertId !== undefined) releaseAlertId(alertId, deactivations);
	}

	function resolveAlertId(
		path: string,
		rawAlertId: unknown,
	): { alertId: number | undefined; publishAssignedId: boolean } {
		const current = ids.get(path);
		if (isValidAlertId(rawAlertId)) {
			const owner = alertIdToPath.get(rawAlertId);
			if (owner === undefined || owner === path) {
				return { alertId: rawAlertId, publishAssignedId: false };
			}
			// Alert IDs identify one alert for this producer. Do not evict another
			// active path when an upstream emits a duplicate ID.
			app.debug(
				`Notifications: alertId ${rawAlertId} is already assigned to ${owner}; assigning a different ID to ${path}`,
			);
		}

		if (current !== undefined) {
			return {
				alertId: current,
				publishAssignedId: rawAlertId !== undefined,
			};
		}
		return { alertId: allocateAlertId(), publishAssignedId: true };
	}

	function resetState(): void {
		pgnsByAlertId.clear();
		usedAlertIds.clear();
		alertIdToPath.clear();
		ids.clear();
		emitTracker.clear();
		nextAlertIdHint = 1;
	}

	return {
		title: "Notifications (PGNs 126983, 126985)",
		optionKey: "NOTIFICATIONS",
		category: "comms",
		keys: ["notifications.*"],
		context: VESSELS_SELF_CONTEXT,
		sourceType: SOURCE_TYPE.SUBSCRIPTION,
		acceptsInput: (delta: unknown) => deltaIsAccepted(delta),
		onOptionsLoaded: (options) => {
			const raw = typeof options.excludePaths === "string" ? options.excludePaths : "";
			excludePrefixes = raw
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			// Reset alert state on config change so newly excluded paths don't
			// leak through stale cached PGNs.
			resetState();
			if (excludePrefixes.length > 0) {
				app.debug(`Notifications excluding paths: ${excludePrefixes.join(", ")}`);
			}
		},
		callback: (delta: Delta): N2KMessage[] => {
			if (!delta?.updates || !Array.isArray(delta.updates) || delta.updates.length === 0) {
				return EMPTY_EMIT;
			}

			// Snapshot receiver-visible alert states before processing the batch.
			// Only those IDs need terminal frames. Intermediate IDs created and
			// removed inside this callback were never emitted to the bus.
			const entryStatuses = new Map<number, N2KMessage>();
			for (const [alertId, entry] of pgnsByAlertId) {
				entryStatuses.set(alertId, entry.pgns[1]);
			}
			const assignedValues = new Map<string, PathValue>();
			const deactivations: BatchDeactivations = {
				entryStatuses,
				pending: new Map<number, N2KMessage>(),
			};
			let sawSafeValue = false;
			let sourceMetadataLoaded = false;
			let sourceMetadata: unknown;
			const getSourceMetadata = () => {
				if (!sourceMetadataLoaded) {
					sourceMetadata = app.getPath?.("sources");
					sourceMetadataLoaded = true;
				}
				return sourceMetadata;
			};

			for (const deltaUpdate of delta.updates) {
				if (!hasValues(deltaUpdate) || deltaUpdate.values.length === 0) continue;
				// Skip both our one-shot alertId delta and NMEA-origin notifications.
				// The runtime normally filters the latter before this callback, but
				// keeping the conversion safe in isolation protects direct callers.
				if (!sourceIsAccepted(deltaUpdate, getSourceMetadata)) continue;

				for (const update of deltaUpdate.values) {
					if (!update || typeof update.path !== "string") continue;
					if (!pathIsAccepted(update.path)) continue;
					if (!valueIsAccepted(update.value)) {
						assignedValues.delete(update.path);
						continue;
					}
					sawSafeValue = true;

					// Signal K uses value:null to remove a notification. Clear by path
					// because a removal delta carries no alertId payload.
					if (update.value === null) {
						assignedValues.delete(update.path);
						releasePath(update.path, deactivations);
						continue;
					}
					if (!isAlertValue(update.value)) continue;
					const value = update.value;

					if (isClearState(value.state)) {
						assignedValues.delete(update.path);
						// The path binding is authoritative. A mismatched upstream alertId
						// must never clear another path that owns that ID.
						releasePath(update.path, deactivations);
						continue;
					}
					if (typeof value.message !== "string") continue;

					const category = categoryForPath(update.path);
					const type = alertTypes[value.state] ?? DEFAULT_ALERT_TYPE;
					const priority = alertPriorities[value.state] ?? DEFAULT_ALERT_PRIORITY;
					if (alertTypes[value.state] === undefined) {
						app.debug(
							`Unknown notification state "${value.state}" on ${update.path}; emitting as Caution`,
						);
					}

					const resolved = resolveAlertId(update.path, value.alertId);
					const alertId = resolved.alertId;
					if (alertId === undefined) {
						app.error(
							`Notifications: alertId pool exhausted (${MAX_ALERT_ID} active); dropping ${update.path}`,
						);
						assignedValues.delete(update.path);
						continue;
					}

					bindAlertId(update.path, alertId, deactivations);
					setAlertPgns(
						alertId,
						buildAlertPgns({ alertId, type, category, priority, value: value as ActiveAlertValue }),
					);
					evictOldestIfOverCap(deactivations);

					if (ids.size > MAX_TRACKED_PATHS) {
						const oldestPath = ids.keys().next().value;
						const oldestId = oldestPath === undefined ? undefined : ids.get(oldestPath);
						if (oldestId !== undefined) releaseAlertId(oldestId, deactivations);
					}

					const pendingAssignment = assignedValues.has(update.path);
					const incomingCarriesResolvedId =
						isValidAlertId(value.alertId) && value.alertId === alertId;
					if (resolved.publishAssignedId || (pendingAssignment && !incomingCarriesResolvedId)) {
						assignedValues.delete(update.path);
						assignedValues.set(update.path, {
							path: update.path,
							value: {
								...value,
								alertType: type,
								alertCategory: category,
								alertSystem,
								alertId,
							},
						});
					} else {
						assignedValues.delete(update.path);
					}
				}
			}

			// Publish all newly assigned ids in one delta so a batched input does
			// not recursively generate one Signal K update per value.
			if (assignedValues.size > 0) {
				const modifiedDelta: Partial<Delta> = {
					...(delta.context !== undefined && { context: delta.context }),
					updates: [
						{
							source: { label: plugin.id, type: "plugin" },
							$source: plugin.id as SourceRef,
							timestamp: new Date().toISOString() as Timestamp,
							values: [...assignedValues.values()],
						},
					],
				};
				if (isDebugEnabled(app)) {
					app.debug(`New delta with alertIds: ${JSON.stringify(modifiedDelta)}`);
				}
				app.handleMessage(plugin.id, modifiedDelta);
			}

			if (!sawSafeValue) return EMPTY_EMIT;
			// The same producer alert ID still active at batch end supersedes any
			// earlier clear for that ID. Terminals for different entry IDs remain.
			for (const alertId of pgnsByAlertId.keys()) {
				deactivations.pending.delete(alertId);
			}
			return [...deactivations.pending.values(), ...buildEmitList()];
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
							dataSourceInstance: 0,
							dataSourceIndexSource: 0,
							alertOccurrenceNumber: 0,
							temporarySilenceStatus: "No",
							acknowledgeStatus: "No",
							escalationStatus: "No",
							temporarySilenceSupport: "No",
							acknowledgeSupport: "No",
							escalationSupport: "No",
							triggerCondition: "Auto",
							thresholdStatus: "Threshold Exceeded",
							alertPriority: 4,
							alertState: "Active",
						},
					},
				],
			},
			{
				// A receiver needs one terminal Alert frame before local cache state
				// is released, otherwise it can retain the prior active indication.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301250",
						updates: [
							{
								values: [
									{
										path: "notifications.environment.inside.refrigerator.temperature",
										value: {
											state: "normal",
											message: "The Fridge Temperature is normal",
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
						pgn: 126983,
						dst: 255,
						fields: {
							alertType: "Caution",
							alertCategory: "Technical",
							alertSystem: 5,
							alertSubSystem: 0,
							alertId: 1,
							dataSourceInstance: 0,
							dataSourceIndexSource: 0,
							alertOccurrenceNumber: 0,
							temporarySilenceStatus: "No",
							acknowledgeStatus: "No",
							escalationStatus: "No",
							temporarySilenceSupport: "No",
							acknowledgeSupport: "No",
							escalationSupport: "No",
							triggerCondition: "Auto",
							thresholdStatus: "Normal",
							alertPriority: 4,
							alertState: "Normal",
						},
					},
				],
			},
			{
				// Regression: "nominal" is a valid non-alert Signal K state. It
				// must be suppressed (release + no PGN), not emitted as a
				// Caution alert the way an unknown state would be.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301250",
						updates: [
							{
								values: [
									{
										path: "notifications.openrouter-companion.engine.report",
										value: {
											state: "nominal",
											message: "All engine parameters within normal range.",
										},
									},
								],
							},
						],
					},
				],
				expected: [],
			},
			{
				// Regression: an over-long message is sanitized and byte-capped before
				// it reaches PGN 126985's STRING_LAU field.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301250",
						updates: [
							{
								values: [
									{
										path: "notifications.environment.inside.refrigerator.temperature",
										value: {
											state: "alarm",
											message: "T".repeat(250),
											alertId: 7,
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
							alertType: "Alarm",
							alertCategory: "Technical",
							alertSystem: 5,
							alertSubSystem: 0,
							alertId: 7,
							dataSourceInstance: 0,
							dataSourceIndexSource: 0,
							alertOccurrenceNumber: 0,
							languageId: "English (US)",
							alertTextDescription: "T".repeat(200),
						},
					},
					{
						prio: 2,
						pgn: 126983,
						dst: 255,
						fields: {
							alertType: "Alarm",
							alertCategory: "Technical",
							alertSystem: 5,
							alertSubSystem: 0,
							alertId: 7,
							dataSourceInstance: 0,
							dataSourceIndexSource: 0,
							alertOccurrenceNumber: 0,
							temporarySilenceStatus: "No",
							acknowledgeStatus: "No",
							escalationStatus: "No",
							temporarySilenceSupport: "No",
							acknowledgeSupport: "No",
							escalationSupport: "No",
							triggerCondition: "Auto",
							thresholdStatus: "Threshold Exceeded",
							alertPriority: 2,
							alertState: "Active",
						},
					},
				],
			},
		],
	};
}
