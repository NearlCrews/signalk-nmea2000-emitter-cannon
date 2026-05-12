import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { matchPathPrefix } from "../utils/pathUtils.js";

interface AlarmValue {
	state: string;
	method?: string[];
}

interface RaymarineAlarmDelta {
	context: string;
	updates: Array<{
		values: Array<{
			path: string;
			value: AlarmValue;
		}>;
	}>;
}

interface AlarmPGN extends N2KMessage {
	path: string;
}

const RAYMARINE_ALARM_SID = 1;

// Signal K notification path prefix → Raymarine Seatalk PGN 65288 alarmId
// (must match @canboat/ts-pgns SeatalkAlarmId enum values verbatim).
// Order matters: longer/more-specific prefixes come first so they take
// precedence over their broader parents.
const ALARM_ID_BY_PATH_PREFIX: ReadonlyArray<[prefix: string, id: string]> = [
	["notifications.mob", "MOB"],
	["notifications.navigation.anchor", "Deep Anchor"],
	["notifications.navigation.arrival", "WP Arrival"],
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

const SUBSCRIBED_KEYS: ReadonlyArray<string> = ALARM_ID_BY_PATH_PREFIX.map(
	([prefix]) => prefix,
);

function alarmStatus(state: string, hasSound: boolean): string | undefined {
	if (state === "normal") {
		return hasSound ? "Alarm condition not met" : undefined;
	}
	return hasSound
		? "Alarm condition met and not silenced"
		: "Alarm condition met and silenced";
}

function alarmIdForPath(path: string): string | undefined {
	return matchPathPrefix(path, ALARM_ID_BY_PATH_PREFIX);
}

export default function createRaymarineAlarmsConversion(): ConversionModule {
	let pgns: AlarmPGN[] = [];
	return {
		title: "Raymarine Seatalk Alarms (PGN 65288)",
		optionKey: "RAYMARINE_ALARMS",
		category: "comms",
		presets: ["raymarine"],
		keys: [...SUBSCRIBED_KEYS],
		context: VESSELS_SELF_CONTEXT,
		sourceType: "subscription",
		callback: (delta: unknown): N2KMessage[] => {
			if (!delta || typeof delta !== "object") {
				return [];
			}

			const deltaMsg = delta as RaymarineAlarmDelta;
			if (
				!deltaMsg.updates ||
				!Array.isArray(deltaMsg.updates) ||
				deltaMsg.updates.length === 0
			) {
				return [];
			}

			const firstUpdate = deltaMsg.updates[0];
			if (
				!firstUpdate?.values ||
				!Array.isArray(firstUpdate.values) ||
				firstUpdate.values.length === 0
			) {
				return [];
			}

			const update = firstUpdate.values[0];
			if (!update) {
				return [];
			}

			const path = update.path;
			const value = update.value;

			if (path.includes("notifications.nmea")) {
				return pgns;
			}

			pgns = pgns.filter((obj) => obj.path !== path);

			const method = value.method || [];
			const hasSound = method.includes("sound");
			const state = alarmStatus(value.state, hasSound);
			const alarmId = alarmIdForPath(path);

			if (state && alarmId) {
				pgns.push({
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 65288,
					dst: N2K_BROADCAST_DST,
					path,
					fields: {
						sid: RAYMARINE_ALARM_SID,
						alarmStatus: state,
						alarmId,
						alarmGroup: "Instrument",
						alarmPriority: 1,
						manufacturerCode: "Raymarine",
						industryCode: "Marine Industry",
					},
				});
			}

			return pgns;
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
		],
	};
}
