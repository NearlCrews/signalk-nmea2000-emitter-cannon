import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";

interface AlertValue {
	state: string;
	message: string;
	alertId?: number;
	method?: string[];
}

interface NotificationDelta {
	context: string;
	updates: Array<{
		values: Array<{
			path: string;
			value: AlertValue;
		}>;
	}>;
}

const alertTypes: Record<string, string> = {
	emergency: "Emergency Alarm",
	alarm: "Alarm",
	warn: "Warning",
	alert: "Caution",
};

const alertCategory = "Technical";
const alertSystem = 5;

export default function createNotificationsConversion(
	app: SignalKApp,
	plugin: { id: string },
): ConversionModule {
	// Instance-scoped state (cleared when plugin restarts)
	let idCounter = 0;
	const ids: Record<string, { alertId: number }> = {};
	let pgns: N2KMessage[] = [];
	let excludePrefixes: string[] = [];

	return {
		title: "Notifications (126983, 126985)",
		optionKey: "NOTIFICATIONS",
		keys: ["notifications.*"],
		context: "vessels.self",
		sourceType: "subscription",
		onOptionsLoaded: (options: Record<string, unknown>) => {
			const raw =
				typeof options.excludePaths === "string" ? options.excludePaths : "";
			excludePrefixes = raw
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			// Reset alert state when configuration changes so newly excluded
			// paths don't leak through stale cached PGNs and the alertId
			// counter doesn't grow forever across config reloads.
			pgns = [];
			idCounter = 0;
			for (const key of Object.keys(ids)) delete ids[key];
			if (excludePrefixes.length > 0) {
				app.debug(
					`Notifications excluding paths: ${excludePrefixes.join(", ")}`,
				);
			}
		},
		callback: (delta: unknown): N2KMessage[] => {
			if (!delta || typeof delta !== "object") {
				return [];
			}

			const deltaMsg = delta as NotificationDelta;
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

			let alertId: number;

			if (typeof value.alertId === "number") {
				alertId = value.alertId;
				app.debug(`Using existing alertId ${alertId} for ${update.path}`);

				pgns = pgns.filter((obj) => obj.fields.alertId !== alertId);

				if (value.state !== "normal") {
					const type = alertTypes[value.state];
					const method = value.method || [];
					const isAcknowledged = method.length === 0;
					const hasSound = method.includes("sound");
					const state = isAcknowledged
						? "Acknowledged"
						: hasSound
							? "Active"
							: "Silenced";

					pgns.push({
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 126985,
						dst: N2K_BROADCAST_DST,
						fields: {
							alertId: alertId,
							alertType: type,
							alertCategory: alertCategory,
							alertSystem: alertSystem,
							alertSubSystem: 0,
							dataSourceNetworkIdName: alertId,
							dataSourceInstance: 0,
							dataSourceIndexSource: 0,
							alertOccurrenceNumber: 0,
							languageId: "English (US)",
							alertTextDescription: value.message,
						},
					});

					pgns.push({
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 126983,
						dst: N2K_BROADCAST_DST,
						fields: {
							alertId: alertId,
							alertType: type,
							alertCategory: alertCategory,
							alertSystem: alertSystem,
							alertSubSystem: 0,
							dataSourceNetworkIdName: alertId,
							dataSourceInstance: 0,
							dataSourceIndexSource: 0,
							alertOccurrenceNumber: 0,
							temporarySilenceStatus:
								!isAcknowledged && !hasSound ? "Yes" : "No",
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
				} else {
					delete ids[update.path];
				}
			} else {
				const type = alertTypes[value.state];
				const existingRecord = ids[update.path];
				if (existingRecord?.alertId) {
					alertId = existingRecord.alertId;
					app.debug(`Assigning existing alertId ${alertId} to ${update.path}`);
				} else {
					alertId = ++idCounter;
					ids[update.path] = { alertId: alertId };
					app.debug(`Assigning new alertId ${alertId} to ${update.path}`);
				}

				if (app.handleMessage) {
					const modifiedDelta = {
						context: deltaMsg.context,
						updates: [
							{
								source: { label: plugin.id, type: "plugin" },
								timestamp: new Date().toISOString(),
								values: [
									{
										path: update.path,
										value: {
											...value,
											alertType: type,
											alertCategory: alertCategory,
											alertSystem: alertSystem,
											alertId: alertId,
										},
									},
								],
							},
						],
					};

					const appDebug = app.debug as unknown as { enabled?: boolean };
					if (appDebug?.enabled) {
						app.debug(
							`New delta with alertId: ${JSON.stringify(modifiedDelta)}`,
						);
					}
					app.handleMessage(
						plugin.id,
						modifiedDelta as Parameters<
							NonNullable<typeof app.handleMessage>
						>[1],
					);
				}
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
