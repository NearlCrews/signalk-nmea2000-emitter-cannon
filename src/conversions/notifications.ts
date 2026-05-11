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

const alertTypes: Record<string, string> = {
	emergency: "Emergency Alarm",
	alarm: "Alarm",
	warn: "Warning",
	alert: "Caution",
};

const alertCategory = "Technical";
const alertSystem = 5;
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

function commonAlertFields(alertId: number, type: string | undefined) {
	return {
		alertId,
		alertType: type,
		alertCategory,
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
	let idCounter = 0;
	const ids: Record<string, { alertId: number }> = {};
	let pgns: N2KMessage[] = [];
	let excludePrefixes: string[] = [];

	return {
		title: "Notifications (126983, 126985)",
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
			// leak through stale cached PGNs and the alertId counter doesn't
			// grow forever across reloads.
			pgns = [];
			idCounter = 0;
			for (const key of Object.keys(ids)) delete ids[key];
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
				return pgns;
			}
			const value = update.value;

			if (update.path.includes("notifications.nmea")) {
				return pgns;
			}

			if (
				excludePrefixes.length > 0 &&
				excludePrefixes.some((prefix) => update.path.startsWith(prefix))
			) {
				return pgns;
			}

			if (typeof value.alertId === "number") {
				const alertId = value.alertId;
				app.debug(`Using existing alertId ${alertId} for ${update.path}`);

				pgns = pgns.filter((obj) => obj.fields.alertId !== alertId);

				if (value.state === "normal") {
					delete ids[update.path];
					return pgns;
				}

				const type = alertTypes[value.state];
				const method = value.method || [];
				const isAcknowledged = method.length === 0;
				const hasSound = method.includes("sound");
				const state = getAlertState(isAcknowledged, hasSound);
				const common = commonAlertFields(alertId, type);

				pgns.push({
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 126985,
					dst: N2K_BROADCAST_DST,
					fields: {
						...common,
						languageId: "English (US)",
						alertTextDescription: value.message,
					},
				});

				pgns.push({
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 126983,
					dst: N2K_BROADCAST_DST,
					fields: {
						...common,
						temporarySilenceStatus: !isAcknowledged && !hasSound ? "Yes" : "No",
						acknowledgeStatus: isAcknowledged ? "Yes" : "No",
						escalationStatus: "No",
						temporarySilenceSupport: "Yes",
						acknowledgeSupport: "Yes",
						escalationSupport: "No",
						triggerCondition: "Auto",
						thresholdStatus: "Threshold Exceeded",
						alertPriority: 0,
						alertState: state,
					},
				});

				// Drop the oldest cached PGNs once the cap is exceeded so a
				// stream of alerts with rotating alertIds cannot grow the
				// resend buffer unbounded.
				if (pgns.length > MAX_PGN_ENTRIES) {
					pgns.splice(0, pgns.length - MAX_PGN_ENTRIES);
				}

				return pgns;
			}

			const type = alertTypes[value.state];
			const existingRecord = ids[update.path];
			let alertId: number;
			if (existingRecord?.alertId) {
				alertId = existingRecord.alertId;
				app.debug(`Assigning existing alertId ${alertId} to ${update.path}`);
			} else {
				alertId = ++idCounter;
				ids[update.path] = { alertId };
				app.debug(`Assigning new alertId ${alertId} to ${update.path}`);
				// Evict the oldest tracked path so a misbehaving stream that
				// fires warnings without ever normalising cannot grow `ids`
				// unbounded.
				const keys = Object.keys(ids);
				if (keys.length > MAX_TRACKED_PATHS) {
					const oldest = keys[0];
					if (oldest !== undefined) delete ids[oldest];
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
									alertCategory,
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
							alertPriority: 0,
							alertState: "Acknowledged",
						},
					},
				],
			},
		],
	};
}
