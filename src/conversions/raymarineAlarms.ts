import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";

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

const ALARM_ID_BY_PATH_PREFIX: ReadonlyArray<[prefix: string, id: string]> = [
	["notifications.navigation.anchor", "Deep Anchor"],
	["notifications.mob", "MOB"],
];

function alarmStatus(state: string, hasSound: boolean): string | undefined {
	if (state === "normal") {
		return hasSound ? "Alarm condition not met" : undefined;
	}
	return hasSound
		? "Alarm condition met and not silenced"
		: "Alarm condition met and silenced";
}

function alarmIdForPath(path: string): string | undefined {
	for (const [prefix, id] of ALARM_ID_BY_PATH_PREFIX) {
		if (path.startsWith(prefix)) return id;
	}
	return undefined;
}

export default function createRaymarineAlarmsConversion(): ConversionModule {
	let pgns: AlarmPGN[] = [];
	return {
		title: "Raymarine (Seatalk) Alarms (65288)",
		optionKey: "RAYMARINE_ALARMS",
		keys: ["notifications.navigation.anchor", "notifications.mob"],
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
