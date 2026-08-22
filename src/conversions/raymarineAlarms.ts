import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SOURCE_TYPE,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import { classifySourceOrigin, SOURCE_ORIGIN } from "../recommendation/busSource.js";
import type { ConversionModule, N2KMessage, SignalKApp, SignalKPlugin } from "../types/index.js";
import { isClearState } from "../utils/notificationUtils.js";
import { matchPathPrefix, pathMatchesPrefix } from "../utils/pathUtils.js";

interface AlarmValue {
	state: string;
	method?: string[];
	status?: {
		silenced?: boolean;
	};
}

interface RaymarineAlarmDelta {
	context: string;
	updates: Array<{
		$source?: string;
		source?: {
			type?: string;
			label?: string;
			src?: string | number;
			pgn?: number;
			canName?: string;
		};
		values: Array<{
			path: string;
			value: AlarmValue | null;
		}>;
	}>;
}

interface AcceptedAlarmUpdate {
	contributorKey: string;
	alarmId: string;
	value: AlarmValue | null;
}

interface ActiveAlarmContributor {
	alarmId: string;
	silenced: boolean;
}

interface PendingAlarmClear {
	message: N2KMessage;
	remainingEmissions: number;
	nextEmissionAt: number;
}

const RAYMARINE_ALARM_SID = 1;
// Initial delivery plus two time-gated retries. A clear is important enough to
// repeat after one lost CAN frame, but busy input must not exhaust it at once.
const TERMINAL_CLEAR_EMISSION_LIMIT = 3;
const TERMINAL_CLEAR_RETRY_INTERVAL_MS = 1000;
// Match the standard notification conversion's realistic state ceiling. Child
// wildcard paths are publisher-controlled and must not grow state forever.
const MAX_TRACKED_CONTRIBUTORS = 256;

// Signal K notification path prefix → Raymarine SeaTalk PGN 65288 alarmId
// (must match @canboat/ts-pgns generated SeaTalk alarm ID values verbatim).
// Order matters: longer/more-specific prefixes come first so they take
// precedence over their broader parents.
const ALARM_ID_BY_PATH_PREFIX: ReadonlyArray<[prefix: string, id: string]> = [
	["notifications.mob", "MOB"],
	["notifications.navigation.anchor", "Deep Anchor"],
	["notifications.navigation.course.arrivalCircleEntered", "WP Arrival"],
	["notifications.navigation.arrivalCircleEntered", "WP Arrival"],
	["notifications.navigation.gnss", "GPS Failure"],
	["notifications.navigation.courseGreatCircle.crossTrackError", "Off Course"],
	["notifications.navigation.courseRhumbline.crossTrackError", "Off Course"],
	["notifications.environment.depth.belowKeel", "Shallow Depth"],
	["notifications.environment.depth.belowTransducer", "Shallow Depth"],
	["notifications.environment.depth.deep", "Deep Depth"],
	["notifications.steering.autopilot.watchAlarm", "Pilot Watch"],
	["notifications.steering.autopilot.offCourse", "Pilot Off Course"],
	["notifications.steering.autopilot.windShift", "Pilot Wind Shift"],
];

const SUBSCRIBED_KEYS: ReadonlyArray<string> = ALARM_ID_BY_PATH_PREFIX.flatMap(([prefix]) => [
	prefix,
	`${prefix}.*`,
]);

// SeaTalk alarm group per alarmId (values must match @canboat/ts-pgns generated
// SeaTalk alarm group values verbatim). Autopilot alarms route to the "Autopilot"
// group so a Raymarine MFD lists them with the pilot alarms rather than the
// generic instrument set; every other alarmId keeps the default "Instrument".
const ALARM_GROUP_BY_ID: Record<string, string> = {
	"Pilot Watch": "Autopilot",
	"Pilot Off Course": "Autopilot",
	"Pilot Wind Shift": "Autopilot",
};

const DEFAULT_ALARM_GROUP = "Instrument";

function alarmGroupForId(alarmId: string): string {
	return ALARM_GROUP_BY_ID[alarmId] ?? DEFAULT_ALARM_GROUP;
}

function isSilenced(value: AlarmValue): boolean {
	// Delivery methods describe presentation channels, not acknowledgment or
	// silence. Only the explicit Signal K status can mark an alarm as silenced.
	return value.status?.silenced === true;
}

function alarmIdForPath(path: string): string | undefined {
	return matchPathPrefix(path, ALARM_ID_BY_PATH_PREFIX);
}

export default function createRaymarineAlarmsConversion(
	app: SignalKApp,
	plugin: SignalKPlugin,
): ConversionModule {
	// Paths are independent Signal K contributors, but PGN 65288 identifies an
	// alarm only by SID and alarmId. Keep contributors in a bounded LRU, then
	// derive one receiver-visible PGN for each wire alarm identity.
	const contributorsBySourcePath = new Map<string, ActiveAlarmContributor>();
	let receiverVisiblePgns = new Map<string, N2KMessage>();
	const pendingClears = new Map<string, PendingAlarmClear>();

	function buildAlarmPgn(alarmId: string, silenced: boolean): N2KMessage {
		return {
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 65288,
			dst: N2K_BROADCAST_DST,
			fields: {
				sid: RAYMARINE_ALARM_SID,
				alarmStatus: silenced
					? "Alarm condition met and silenced"
					: "Alarm condition met and not silenced",
				alarmId,
				alarmGroup: alarmGroupForId(alarmId),
				alarmPriority: 1,
				manufacturerCode: "Raymarine",
				industryCode: "Marine Industry",
			},
		};
	}

	function isOwnPluginSource(
		sourceRef: string,
		source: RaymarineAlarmDelta["updates"][number]["source"],
	): boolean {
		return (
			sourceRef === plugin.id ||
			sourceRef.startsWith(`${plugin.id}.`) ||
			(source?.type === "plugin" && source.label === plugin.id)
		);
	}

	function sourceIdentity(
		sourceRef: string,
		source: RaymarineAlarmDelta["updates"][number]["source"],
	): string {
		if (sourceRef.length > 0) return sourceRef;
		const label =
			typeof source?.label === "string" && source.label.length > 0 ? source.label : undefined;
		const canName =
			typeof source?.canName === "string" && source.canName.length > 0 ? source.canName : undefined;
		const src =
			typeof source?.src === "string" || typeof source?.src === "number"
				? String(source.src)
				: undefined;
		if (canName !== undefined) return `${label ?? "unknown_source"}.${canName}`;
		if (src !== undefined) return `${label ?? "unknown_source"}.${src}`;
		return label ?? source?.type ?? "unknown_source";
	}

	function acceptedAlarmUpdates(delta: unknown): AcceptedAlarmUpdate[] {
		if (!delta || typeof delta !== "object") return [];
		const deltaMsg = delta as RaymarineAlarmDelta;
		if (!Array.isArray(deltaMsg.updates) || deltaMsg.updates.length === 0) return [];

		const accepted: AcceptedAlarmUpdate[] = [];
		let sourceMetadataLoaded = false;
		let sourceMetadata: unknown;
		for (const deltaUpdate of deltaMsg.updates) {
			if (!deltaUpdate || !Array.isArray(deltaUpdate.values) || deltaUpdate.values.length === 0) {
				continue;
			}
			const sourceRef = typeof deltaUpdate.$source === "string" ? deltaUpdate.$source : "";
			if (isOwnPluginSource(sourceRef, deltaUpdate.source)) continue;

			let origin = classifySourceOrigin(sourceRef, deltaUpdate.source);
			if (origin === SOURCE_ORIGIN.UNKNOWN) {
				if (!sourceMetadataLoaded) {
					sourceMetadata = app.getPath?.("sources");
					sourceMetadataLoaded = true;
				}
				origin = classifySourceOrigin(sourceRef, undefined, sourceMetadata);
			}
			if (origin === SOURCE_ORIGIN.NMEA2000) continue;
			const publisher = sourceIdentity(sourceRef, deltaUpdate.source);

			for (const update of deltaUpdate.values) {
				if (!update || typeof update.path !== "string") continue;
				if (pathMatchesPrefix(update.path, "notifications.nmea")) {
					continue;
				}
				const alarmId = alarmIdForPath(update.path);
				if (alarmId === undefined) continue;
				const contributorKey = JSON.stringify([publisher, update.path]);
				if (update.value === null) {
					accepted.push({ contributorKey, alarmId, value: null });
					continue;
				}
				if (typeof update.value !== "object" || typeof update.value.state !== "string") {
					continue;
				}
				accepted.push({ contributorKey, alarmId, value: update.value });
			}
		}
		return accepted;
	}

	function scheduleTerminalClear(alarmId: string, previous: N2KMessage, now: number): void {
		// Delete before set so a refreshed entry moves to the newest end of the
		// insertion order the retry sweep walks. No size cap is needed here:
		// pendingClears is keyed by alarmId, and alarmIdForPath can only return
		// one of the fixed ALARM_ID_BY_PATH_PREFIX ids, so the map is bounded by
		// that table. MAX_TRACKED_CONTRIBUTORS is the real cap in this module,
		// on the unbounded per-publisher map.
		pendingClears.delete(alarmId);
		pendingClears.set(alarmId, {
			message: {
				...previous,
				fields: {
					...previous.fields,
					alarmStatus: "Alarm condition not met",
				},
			},
			remainingEmissions: TERMINAL_CLEAR_EMISSION_LIMIT,
			nextEmissionAt: now,
		});
	}

	function enforceContributorLimit(): void {
		while (contributorsBySourcePath.size > MAX_TRACKED_CONTRIBUTORS) {
			const oldestContributor = contributorsBySourcePath.keys().next().value;
			if (oldestContributor === undefined) break;
			contributorsBySourcePath.delete(oldestContributor);
		}
	}

	function deriveActivePgns(): Map<string, N2KMessage> {
		const allSilencedByAlarmId = new Map<string, boolean>();
		for (const contributor of contributorsBySourcePath.values()) {
			const allSilenced = allSilencedByAlarmId.get(contributor.alarmId);
			allSilencedByAlarmId.set(
				contributor.alarmId,
				allSilenced === undefined ? contributor.silenced : allSilenced && contributor.silenced,
			);
		}

		const active = new Map<string, N2KMessage>();
		for (const [alarmId, allSilenced] of allSilencedByAlarmId) {
			active.set(alarmId, buildAlarmPgn(alarmId, allSilenced));
		}
		return active;
	}

	function emitPendingClears(now: number): N2KMessage[] {
		const output: N2KMessage[] = [];
		for (const [alarmId, pending] of pendingClears) {
			if (now < pending.nextEmissionAt) continue;
			output.push(pending.message);
			pending.remainingEmissions--;
			if (pending.remainingEmissions <= 0) {
				pendingClears.delete(alarmId);
			} else {
				pending.nextEmissionAt = now + TERMINAL_CLEAR_RETRY_INTERVAL_MS;
			}
		}
		return output;
	}

	return {
		title: "Raymarine SeaTalk Alarms (PGN 65288)",
		optionKey: "RAYMARINE_ALARMS",
		category: "comms",
		presets: ["raymarine"],
		keys: [...SUBSCRIBED_KEYS],
		context: VESSELS_SELF_CONTEXT,
		sourceType: SOURCE_TYPE.SUBSCRIPTION,
		acceptsInput: (delta: unknown): boolean => acceptedAlarmUpdates(delta).length > 0,
		callback: (delta: unknown): N2KMessage[] => {
			const accepted = acceptedAlarmUpdates(delta);
			if (accepted.length === 0) return [];

			// Resolve the whole batch before deriving receiver-visible identities.
			// The last value for each source-plus-path contributor is authoritative.
			const previousVisible = receiverVisiblePgns;
			const lastByContributor = new Map<string, { alarmId: string; value: AlarmValue | null }>();
			for (const update of accepted) {
				lastByContributor.delete(update.contributorKey);
				lastByContributor.set(update.contributorKey, {
					alarmId: update.alarmId,
					value: update.value,
				});
			}

			for (const [contributorKey, { alarmId, value }] of lastByContributor) {
				if (value === null || isClearState(value.state)) {
					contributorsBySourcePath.delete(contributorKey);
					continue;
				}

				// Delete before set so a refresh moves this contributor to the newest end of
				// the Map's insertion order and LRU eviction remains deterministic.
				contributorsBySourcePath.delete(contributorKey);
				contributorsBySourcePath.set(contributorKey, {
					alarmId,
					silenced: isSilenced(value),
				});
			}
			enforceContributorLimit();

			const nextVisible = deriveActivePgns();
			const now = Date.now();
			for (const alarmId of nextVisible.keys()) pendingClears.delete(alarmId);
			for (const [alarmId, previous] of previousVisible) {
				if (!nextVisible.has(alarmId)) scheduleTerminalClear(alarmId, previous, now);
			}
			receiverVisiblePgns = nextVisible;

			return [...emitPendingClears(now), ...nextVisible.values()];
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
										path: "notifications.navigation.anchor",
										value: {
											state: "alert",
											method: ["sound"],
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
						pgn: 65288,
						dst: 255,
						fields: {
							manufacturerCode: "Raymarine",
							industryCode: "Marine Industry",
							sid: 1,
							alarmStatus: "Alarm condition met and not silenced",
							alarmId: "Deep Anchor",
							alarmGroup: "Instrument",
							alarmPriority: 1,
						},
					},
				],
			},
			{
				// "nominal" sends a final deactivation before the cached alarm is
				// removed so a Raymarine receiver does not retain a latched state.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301250",
						updates: [
							{
								values: [
									{
										path: "notifications.navigation.anchor",
										value: { state: "nominal" },
									},
								],
							},
						],
					},
				],
				expected: [
					{
						prio: 2,
						pgn: 65288,
						dst: 255,
						fields: {
							manufacturerCode: "Raymarine",
							industryCode: "Marine Industry",
							sid: 1,
							alarmStatus: "Alarm condition not met",
							alarmId: "Deep Anchor",
							alarmGroup: "Instrument",
							alarmPriority: 1,
						},
					},
				],
			},
			{
				// Autopilot alarms route to the "Autopilot" group, not the default
				// "Instrument" group, so a Raymarine MFD lists them with the pilot
				// alarms. The prior anchor clear remains pending until its time-gated
				// retry window rather than consuming a retry on this new alarm input.
				input: [
					{
						context: "vessels.urn:mrn:imo:mmsi:367301250",
						updates: [
							{
								values: [
									{
										path: "notifications.steering.autopilot.watchAlarm",
										value: {
											state: "alarm",
											method: ["sound"],
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
						pgn: 65288,
						dst: 255,
						fields: {
							manufacturerCode: "Raymarine",
							industryCode: "Marine Industry",
							sid: 1,
							alarmStatus: "Alarm condition met and not silenced",
							alarmId: "Pilot Watch",
							alarmGroup: "Autopilot",
							alarmPriority: 1,
						},
					},
				],
			},
		],
	};
}
