import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
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

export default function createRaymarineAlarmsConversion(): ConversionModule {
	// Instance-scoped state (cleared when plugin restarts)
	let pgns: AlarmPGN[] = [];
	return {
		title: "Raymarine (Seatalk) Alarms (65288)",
		optionKey: "RAYMARINE_ALARMS",
		keys: ["notifications.navigation.anchor", "notifications.mob"],
		context: "vessels.self",
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

			let state: string | undefined;
			const method = value.method || [];
			const hasSound = method.includes("sound");

			if (value.state === "normal") {
				if (hasSound) {
					state = "Alarm condition not met";
				}
			} else {
				state = hasSound
					? "Alarm condition met and not silenced"
					: "Alarm condition met and silenced";
			}

			let alarmId: string | undefined;
			if (path.startsWith("notifications.navigation.anchor")) {
				// canboatjs lookup table doesn't yet expose a more specific anchor alarm.
				alarmId = "Deep Anchor";
			} else if (path.startsWith("notifications.mob")) {
				alarmId = "MOB";
			}

			if (state && alarmId) {
				pgns.push({
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 65288,
					dst: N2K_BROADCAST_DST,
					path: path,
					fields: {
						sid: 1,
						alarmStatus: state,
						alarmId: alarmId,
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
