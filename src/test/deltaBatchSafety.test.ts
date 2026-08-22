import { FromPgn, pgnToActisenseSerialFormat } from "@canboat/canboatjs";
import { describe, expect, it, vi } from "vitest";
import createAisConversion from "../conversions/ais.js";
import createNotificationsConversion from "../conversions/notifications.js";
import createRaymarineAlarmsConversion from "../conversions/raymarineAlarms.js";
import type { ConversionModule, N2KMessage, SignalKApp, SignalKPlugin } from "../types/index.js";

const plugin: SignalKPlugin = {
	id: "signalk-nmea2000-emitter-cannon",
	name: "Test Plugin",
	description: "Test plugin",
	schema: () => ({}),
	start: () => {},
	stop: () => {},
};

function appForDeltas(overrides: Record<string, unknown> = {}): SignalKApp {
	return {
		selfId: "urn:mrn:imo:mmsi:111222333",
		debug: Object.assign(vi.fn(), { enabled: false }),
		error: vi.fn(),
		getPath: (path: string) =>
			path === "sources"
				? {
						can0: { type: "NMEA2000" },
						"ais-provider": { type: "plugin" },
					}
				: {},
		handleMessage: vi.fn(),
		...overrides,
	} as unknown as SignalKApp;
}

async function invoke(conversion: ConversionModule, delta: unknown): Promise<N2KMessage[]> {
	if (!conversion.callback) throw new Error(`Missing callback for ${conversion.title}`);
	return Promise.resolve(conversion.callback(delta));
}

function alert(path: string, message: string, alertId?: number) {
	return {
		path,
		value: {
			state: "alert",
			message,
			method: ["sound"],
			...(alertId !== undefined && { alertId }),
		},
	};
}

describe("batched delta safety", () => {
	it("uses $source to drop NMEA 2000 AIS input", async () => {
		const conversion = createAisConversion(appForDeltas(), plugin);
		const output = await invoke(conversion, {
			context: "vessels.urn:mrn:imo:mmsi:367301250",
			updates: [
				{
					$source: "can0.35",
					values: [
						{ path: "", value: { mmsi: "367301250" } },
						{ path: "sensors.ais.class", value: "A" },
						{
							path: "navigation.position",
							value: { longitude: -76.39, latitude: 39.12 },
						},
					],
				},
			],
		});

		expect(output).toEqual([]);
	});

	it("preserves a safe AIS publisher in a mixed-source delta", async () => {
		const conversion = createAisConversion(appForDeltas(), plugin);
		const output = await invoke(conversion, {
			context: "vessels.urn:mrn:imo:mmsi:367301250",
			updates: [
				{
					$source: "can0.35",
					source: { type: "NMEA2000", pgn: 129038, src: 35 },
					values: [{ path: "navigation.position", value: { longitude: 1, latitude: 1 } }],
				},
				{
					$source: "ais-provider",
					source: { label: "ais-provider", type: "plugin" },
					values: [
						{ path: "", value: { mmsi: "367301250" } },
						{ path: "sensors.ais.class", value: "A" },
						{
							path: "navigation.position",
							value: { longitude: -76.39, latitude: 39.12 },
						},
					],
				},
			],
		});

		expect(output).toHaveLength(1);
		expect(output[0]).toMatchObject({
			pgn: 129038,
			fields: { userId: 367301250, longitude: -76.39, latitude: 39.12 },
		});
	});

	it("never rehydrates rejected AIS identity from the source-mixed vessel tree", async () => {
		const context = "vessels.urn:mrn:imo:mmsi:367301251";
		const conversion = createAisConversion(
			appForDeltas({
				getPath: (path: string) => {
					if (path === "sources") {
						return {
							can0: { type: "NMEA2000" },
							"ais-provider": { type: "plugin" },
						};
					}
					if (path === context) {
						return { mmsi: "367301251", sensors: { ais: { class: "A" } } };
					}
					return undefined;
				},
			}),
			plugin,
		);

		expect(
			await invoke(conversion, {
				context,
				updates: [
					{
						$source: "can0.35",
						source: { type: "NMEA2000", pgn: 129038, src: 35 },
						values: [
							{ path: "mmsi", value: "367301251" },
							{ path: "sensors.ais.class", value: "A" },
						],
					},
				],
			}),
		).toEqual([]);

		const safePosition = {
			context,
			updates: [
				{
					$source: "ais-provider",
					source: { label: "ais-provider", type: "plugin" },
					values: [
						{
							path: "navigation.position",
							value: { longitude: -76.39, latitude: 39.12 },
						},
					],
				},
			],
		};
		expect(await invoke(conversion, safePosition)).toEqual([]);

		expect(
			await invoke(conversion, {
				context,
				updates: [
					{
						$source: "ais-provider",
						source: { label: "ais-provider", type: "plugin" },
						values: [
							{ path: "mmsi", value: "367301251" },
							{ path: "sensors.ais.class", value: "A" },
						],
					},
				],
			}),
		).toEqual([]);
		expect(await invoke(conversion, safePosition)).toMatchObject([
			{ pgn: 129038, fields: { userId: 367301251 } },
		]);
	});

	it("processes every notification in a batch and publishes assigned ids once", async () => {
		const handleMessage = vi.fn();
		const conversion = createNotificationsConversion(appForDeltas({ handleMessage }), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });

		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					source: { label: "monitor", type: "plugin" },
					values: [
						alert("notifications.navigation.anchor", "Anchor alarm"),
						alert("notifications.environment.inside.refrigerator.temperature", "Fridge alarm"),
					],
				},
			],
		});

		expect(output).toHaveLength(4);
		expect(output.every((message) => !("dataSourceNetworkIdName" in message.fields))).toBe(true);
		expect(output.filter((message) => message.pgn === 126983)).toMatchObject([
			{
				fields: {
					alertState: "Active",
					acknowledgeStatus: "No",
					temporarySilenceStatus: "No",
					acknowledgeSupport: "No",
					temporarySilenceSupport: "No",
				},
			},
			{
				fields: {
					alertState: "Active",
					acknowledgeStatus: "No",
					temporarySilenceStatus: "No",
					acknowledgeSupport: "No",
					temporarySilenceSupport: "No",
				},
			},
		]);
		expect(handleMessage).toHaveBeenCalledTimes(1);
		const assigned = handleMessage.mock.calls[0]?.[1] as {
			updates: Array<{ values: unknown[] }>;
		};
		expect(assigned.updates[0]?.values).toHaveLength(2);
	});

	it("removes null notifications without retaining ghost PGNs", async () => {
		const conversion = createNotificationsConversion(appForDeltas(), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });
		const path = "notifications.navigation.anchor";

		expect(
			await invoke(conversion, {
				context: "vessels.self",
				updates: [{ $source: "monitor", values: [alert(path, "Anchor alarm")] }],
			}),
		).toHaveLength(2);
		expect(
			await invoke(conversion, {
				context: "vessels.self",
				updates: [{ $source: "monitor", values: [{ path, value: null }] }],
			}),
		).toMatchObject([
			{
				pgn: 126983,
				fields: { alertId: 1, thresholdStatus: "Normal", alertState: "Normal" },
			},
		]);
		expect(
			await invoke(conversion, {
				context: "vessels.self",
				updates: [
					{
						$source: "monitor",
						values: [alert("notifications.mob", "MOB alarm")],
					},
				],
			}),
		).toHaveLength(2);
	});

	it("uses canonical notification status ahead of legacy method inference", async () => {
		const conversion = createNotificationsConversion(appForDeltas(), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });

		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						{
							path: "notifications.navigation.anchor",
							value: {
								state: "alarm",
								message: "Anchor alarm",
								alertId: 42,
								method: [],
								status: {
									acknowledged: false,
									silenced: false,
									canSilence: true,
									canAcknowledge: true,
								},
							},
						},
						{
							path: "notifications.steering.autopilot.watchAlarm",
							value: {
								state: "alarm",
								message: "Pilot watch alarm",
								alertId: 43,
								method: ["sound"],
								status: { acknowledged: false, silenced: true },
							},
						},
						{
							path: "notifications.environment.inside.refrigerator.temperature",
							value: {
								state: "alarm",
								message: "Acknowledged temperature alarm",
								alertId: 44,
								method: ["sound"],
								status: { acknowledged: true, silenced: false },
							},
						},
					],
				},
			],
		});

		const states = output.filter((message) => message.pgn === 126983);
		expect(states).toMatchObject([
			{
				fields: {
					alertId: 42,
					alertState: "Active",
					acknowledgeStatus: "No",
					temporarySilenceStatus: "No",
					acknowledgeSupport: "No",
					temporarySilenceSupport: "No",
				},
			},
			{
				fields: {
					alertId: 43,
					alertState: "Silenced",
					acknowledgeStatus: "No",
					temporarySilenceStatus: "Yes",
				},
			},
			{
				fields: {
					alertId: 44,
					alertState: "Acknowledged",
					acknowledgeStatus: "Yes",
					temporarySilenceStatus: "No",
				},
			},
		]);
	});

	it("accepts the complete Canboat alert ID range", async () => {
		const handleMessage = vi.fn();
		const conversion = createNotificationsConversion(appForDeltas({ handleMessage }), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });

		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						alert("notifications.navigation.anchor", "Anchor alarm", 0),
						alert("notifications.mob", "MOB alarm", 65532),
					],
				},
			],
		});

		expect(output.map((message) => message.fields.alertId)).toEqual([0, 0, 65532, 65532]);
		expect(handleMessage).not.toHaveBeenCalled();
	});

	it("sanitizes and byte-caps alert text through a CanboatJS wire round trip", async () => {
		const conversion = createNotificationsConversion(appForDeltas(), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });
		const expectedText = `Caf? ?${"A".repeat(194)}`;
		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					source: { label: "monitor", type: "plugin" },
					values: [alert("notifications.navigation.anchor", `Café\n⚓${"A".repeat(250)}`, 12)],
				},
			],
		});
		const textPgn = output.find((message) => message.pgn === 126985);
		expect(textPgn?.fields.alertTextDescription).toBe(expectedText);
		expect(Buffer.byteLength(expectedText, "ascii")).toBe(200);

		const encoded = pgnToActisenseSerialFormat(
			textPgn as unknown as Parameters<typeof pgnToActisenseSerialFormat>[0],
		);
		expect(encoded).toBeTruthy();
		const parsed = new FromPgn().parseString(encoded as string);
		const parsedFields = parsed?.fields as Record<string, unknown> | undefined;
		expect(parsedFields?.alertTextDescription).toBe(expectedText);
	});

	it("replaces invalid upstream alert IDs with nonzero allocated IDs", async () => {
		const handleMessage = vi.fn();
		const conversion = createNotificationsConversion(appForDeltas({ handleMessage }), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });
		const invalidIds = [65533, 65535, -1, 1.5, Number.NaN];

		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: invalidIds.map((alertId, index) => ({
						path: `notifications.test.invalid${index}`,
						value: { state: "alert", message: `Invalid ${index}`, method: ["sound"], alertId },
					})),
				},
			],
		});

		expect(output.map((message) => message.fields.alertId)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
		expect(handleMessage).toHaveBeenCalledTimes(1);
		const assigned = handleMessage.mock.calls[0]?.[1] as {
			updates: Array<{ values: Array<{ value: { alertId: number } }> }>;
		};
		expect(assigned.updates[0]?.values.map(({ value }) => value.alertId)).toEqual([1, 2, 3, 4, 5]);
	});

	it("evicts the least recently seen alert rather than the longest running one", async () => {
		// Map.set on an existing key preserves its original position, so an alert
		// that keeps refreshing never moved in insertion order and was the first
		// thing evicted at the cap. That is precisely the wrong victim: an anchor
		// alarm active for hours would be terminally cleared on the chartplotter
		// and then re-allocated on its next delta, so the alarm flapped.
		const conversion = createNotificationsConversion(appForDeltas(), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });
		const anchorPath = "notifications.navigation.anchor";
		const trackedPathCap = 256;

		const opened = await invoke(conversion, {
			context: "vessels.self",
			updates: [{ $source: "monitor", values: [alert(anchorPath, "Anchor alarm")] }],
		});
		const anchorAlertId = opened[0]?.fields.alertId;
		expect(typeof anchorAlertId).toBe("number");

		// Other alerts come and go while the anchor watch keeps republishing.
		for (let i = 0; i <= trackedPathCap; i++) {
			await invoke(conversion, {
				context: "vessels.self",
				updates: [
					{
						$source: "monitor",
						values: [
							alert(anchorPath, "Anchor alarm"),
							alert(`notifications.test.churn${i}`, `Churn ${i}`),
						],
					},
				],
			});
		}

		// A changed message forces past the 1 Hz emit gate, so the anchor's
		// current wire identity is observable. It must still be the original.
		const refreshed = await invoke(conversion, {
			context: "vessels.self",
			updates: [{ $source: "monitor", values: [alert(anchorPath, "Anchor alarm, dragging")] }],
		});
		expect(refreshed.map((message) => message.fields.alertId)).toEqual([
			anchorAlertId,
			anchorAlertId,
		]);
	});

	it("keeps an active-then-clear notification cleared within one batch", async () => {
		const handleMessage = vi.fn();
		const conversion = createNotificationsConversion(appForDeltas({ handleMessage }), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });
		const path = "notifications.navigation.anchor";

		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [alert(path, "Anchor alarm"), { path, value: null }],
				},
			],
		});

		expect(output).toEqual([]);
		expect(handleMessage).not.toHaveBeenCalled();
	});

	it("allows a clear-then-active notification to reactivate within one batch", async () => {
		const handleMessage = vi.fn();
		const conversion = createNotificationsConversion(appForDeltas({ handleMessage }), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });
		const path = "notifications.navigation.anchor";

		await invoke(conversion, {
			context: "vessels.self",
			updates: [{ $source: "monitor", values: [alert(path, "First alarm")] }],
		});
		handleMessage.mockClear();

		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [{ path, value: null }, alert(path, "Reactivated alarm")],
				},
			],
		});

		expect(output.map((message) => message.pgn)).toEqual([126983, 126985, 126983]);
		expect(output.map((message) => message.fields.alertId)).toEqual([1, 2, 2]);
		expect(output[0]?.fields.alertState).toBe("Normal");
		expect(output[2]?.fields.alertState).toBe("Active");
		expect(handleMessage).toHaveBeenCalledTimes(1);
	});

	it("cancels a terminal frame only when the same alert ID is active at batch end", async () => {
		const conversion = createNotificationsConversion(appForDeltas(), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });
		const path = "notifications.navigation.anchor";

		await invoke(conversion, {
			context: "vessels.self",
			updates: [{ $source: "monitor", values: [alert(path, "First alarm", 1)] }],
		});
		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [{ path, value: null }, alert(path, "Reactivated alarm", 1)],
				},
			],
		});

		expect(output.map((message) => message.pgn)).toEqual([126985, 126983]);
		expect(output.every((message) => message.fields.alertId === 1)).toBe(true);
		expect(output.find((message) => message.pgn === 126983)?.fields.alertState).toBe("Active");
	});

	it("clears only the entry alert ID across several same-batch ID changes", async () => {
		const conversion = createNotificationsConversion(appForDeltas(), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });
		const path = "notifications.navigation.anchor";

		await invoke(conversion, {
			context: "vessels.self",
			updates: [{ $source: "monitor", values: [alert(path, "First alarm", 1)] }],
		});
		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [alert(path, "Second alarm", 2), alert(path, "Third alarm", 3)],
				},
			],
		});

		expect(output.map((message) => message.pgn)).toEqual([126983, 126985, 126983]);
		expect(output.map((message) => message.fields.alertId)).toEqual([1, 3, 3]);
		expect(output[0]?.fields.alertState).toBe("Normal");
		expect(output[2]?.fields.alertState).toBe("Active");
	});

	it("clears a notification by its path instead of a mismatched payload ID", async () => {
		const conversion = createNotificationsConversion(appForDeltas(), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });
		const anchorPath = "notifications.navigation.anchor";
		const mobPath = "notifications.mob";

		await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [alert(anchorPath, "Anchor alarm", 10), alert(mobPath, "MOB alarm", 11)],
				},
			],
		});

		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						{
							path: anchorPath,
							value: { state: "normal", message: "Anchor clear", alertId: 11 },
						},
					],
				},
			],
		});

		expect(output).toMatchObject([
			{ pgn: 126983, fields: { alertId: 10, thresholdStatus: "Normal", alertState: "Normal" } },
		]);
		expect(output).toHaveLength(1);
	});

	it("drops NMEA-origin notification batches", async () => {
		const conversion = createNotificationsConversion(appForDeltas(), plugin);
		conversion.onOptionsLoaded?.({ enabled: true, resend: 0 });

		expect(
			await invoke(conversion, {
				context: "vessels.self",
				updates: [
					{
						$source: "can0.22",
						values: [alert("notifications.navigation.anchor", "Echo")],
					},
				],
			}),
		).toEqual([]);
	});

	it("accepts only processable notification deltas for resend state", async () => {
		const conversion = createNotificationsConversion(appForDeltas(), plugin);
		conversion.onOptionsLoaded?.({
			enabled: true,
			resend: 0,
			excludePaths: "notifications.navigation.anchor",
		});
		const anchor = alert("notifications.navigation.anchor", "Anchor alarm");
		const rejected = [
			{
				context: "vessels.self",
				updates: [{ $source: plugin.id, source: { label: plugin.id }, values: [anchor] }],
			},
			{
				context: "vessels.self",
				updates: [{ $source: `${plugin.id}.assigned`, values: [anchor] }],
			},
			{
				context: "vessels.self",
				updates: [{ $source: "can0.22", values: [anchor] }],
			},
			{
				context: "vessels.self",
				updates: [
					{
						$source: "monitor",
						values: [alert("notifications.nmea.can0.anchor", "Echo")],
					},
				],
			},
			{
				context: "vessels.self",
				updates: [
					{
						$source: "monitor",
						values: [
							{
								path: "notifications.mob",
								value: { state: "alert" },
							},
						],
					},
				],
			},
			{
				context: "vessels.self",
				updates: [
					{
						$source: "monitor",
						values: [{ path: "environment.wind.speedApparent", value: 3 }],
					},
				],
			},
			{
				context: "vessels.self",
				updates: [{ $source: "monitor", values: [anchor] }],
			},
		];

		for (const delta of rejected) {
			expect(conversion.acceptsInput?.(delta)).toBe(false);
			expect(await invoke(conversion, delta)).toEqual([]);
		}

		const validAlert = {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [alert("notifications.mob", "MOB alarm")],
				},
			],
		};
		expect(conversion.acceptsInput?.(validAlert)).toBe(true);
		expect(await invoke(conversion, validAlert)).toHaveLength(2);

		const adjacentPaths = {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						alert("notifications.navigation.anchorDrag", "Adjacent path"),
						alert("notifications.nmeaa.can0.anchor", "Not the NMEA namespace"),
					],
				},
			],
		};
		expect(conversion.acceptsInput?.(adjacentPaths)).toBe(true);
		expect(await invoke(conversion, adjacentPaths)).toHaveLength(4);

		const validClear = {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [{ path: "notifications.mob", value: null }],
				},
			],
		};
		expect(conversion.acceptsInput?.(validClear)).toBe(true);
	});

	it("processes and clears every Raymarine alarm value in a batch", async () => {
		const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const anchorPath = "notifications.navigation.anchor";
		const watchPath = "notifications.steering.autopilot.watchAlarm";
		const active = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						{ path: anchorPath, value: { state: "alarm", method: ["sound"] } },
						{ path: watchPath, value: { state: "alarm", method: ["sound"] } },
					],
				},
			],
		});

		expect(active).toHaveLength(2);
		expect(active.map((message) => message.fields.alarmId)).toEqual(["Deep Anchor", "Pilot Watch"]);
		expect(active.every((message) => !("path" in message))).toBe(true);

		const cleared = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						{ path: anchorPath, value: null },
						{ path: watchPath, value: null },
					],
				},
			],
		});
		expect(cleared).toMatchObject([
			{ pgn: 65288, fields: { alarmId: "Deep Anchor", alarmStatus: "Alarm condition not met" } },
			{ pgn: 65288, fields: { alarmId: "Pilot Watch", alarmStatus: "Alarm condition not met" } },
		]);
	});

	it("uses explicit Raymarine silence status and does not infer it from delivery methods", async () => {
		const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const output = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						{
							path: "notifications.navigation.anchor",
							value: { state: "alarm", method: [] },
						},
						{
							path: "notifications.steering.autopilot.watchAlarm",
							value: { state: "alarm", method: ["sound"], status: { silenced: true } },
						},
					],
				},
			],
		});

		expect(output.map((message) => message.fields.alarmStatus)).toEqual([
			"Alarm condition met and not silenced",
			"Alarm condition met and silenced",
		]);
	});

	it("aggregates depth contributors by alarm ID and keeps the least-silenced state", async () => {
		const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const belowKeel = "notifications.environment.depth.belowKeel";
		const belowTransducer = "notifications.environment.depth.belowTransducer";
		const active = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "depth-keel",
					values: [
						{
							path: belowKeel,
							value: { state: "alarm", status: { silenced: true } },
						},
					],
				},
				{
					$source: "depth-transducer",
					values: [{ path: belowTransducer, value: { state: "alarm" } }],
				},
			],
		});
		expect(active).toMatchObject([
			{
				fields: {
					alarmId: "Shallow Depth",
					alarmStatus: "Alarm condition met and not silenced",
				},
			},
		]);
		expect(active).toHaveLength(1);

		const oneRemaining = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "depth-transducer",
					values: [{ path: belowTransducer, value: null }],
				},
			],
		});
		expect(oneRemaining).toMatchObject([
			{
				fields: {
					alarmId: "Shallow Depth",
					alarmStatus: "Alarm condition met and silenced",
				},
			},
		]);
		expect(oneRemaining).toHaveLength(1);

		const finalClear = await invoke(conversion, {
			context: "vessels.self",
			updates: [{ $source: "depth-keel", values: [{ path: belowKeel, value: null }] }],
		});
		expect(finalClear).toMatchObject([
			{ fields: { alarmId: "Shallow Depth", alarmStatus: "Alarm condition not met" } },
		]);
		expect(finalClear).toHaveLength(1);
	});

	it("keeps one anchor alarm for multiple descendant contributors", async () => {
		const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const first = "notifications.navigation.anchor.drag";
		const second = "notifications.navigation.anchor.radius";
		const active = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{
					$source: "anchor-monitor",
					values: [
						{ path: first, value: { state: "alarm" } },
						{ path: second, value: { state: "alarm" } },
					],
				},
			],
		});
		expect(active).toMatchObject([{ fields: { alarmId: "Deep Anchor" } }]);
		expect(active).toHaveLength(1);

		const oneRemaining = await invoke(conversion, {
			context: "vessels.self",
			updates: [{ $source: "anchor-monitor", values: [{ path: first, value: null }] }],
		});
		expect(oneRemaining).toMatchObject([
			{
				fields: {
					alarmId: "Deep Anchor",
					alarmStatus: "Alarm condition met and not silenced",
				},
			},
		]);
		expect(oneRemaining).toHaveLength(1);

		const finalClear = await invoke(conversion, {
			context: "vessels.self",
			updates: [{ $source: "anchor-monitor", values: [{ path: second, value: null }] }],
		});
		expect(finalClear).toMatchObject([
			{ fields: { alarmId: "Deep Anchor", alarmStatus: "Alarm condition not met" } },
		]);
		expect(finalClear).toHaveLength(1);
	});

	it("keeps same-path alarm contributors separate by publisher", async () => {
		const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const path = "notifications.navigation.anchor";
		const active = await invoke(conversion, {
			context: "vessels.self",
			updates: [
				{ $source: "anchor-a", values: [{ path, value: { state: "alarm" } }] },
				{ $source: "anchor-b", values: [{ path, value: { state: "alarm" } }] },
			],
		});
		expect(active).toMatchObject([{ fields: { alarmId: "Deep Anchor" } }]);
		expect(active).toHaveLength(1);

		const oneRemaining = await invoke(conversion, {
			context: "vessels.self",
			updates: [{ $source: "anchor-a", values: [{ path, value: null }] }],
		});
		expect(oneRemaining).toMatchObject([
			{
				fields: {
					alarmId: "Deep Anchor",
					alarmStatus: "Alarm condition met and not silenced",
				},
			},
		]);
		expect(oneRemaining).toHaveLength(1);

		const finalClear = await invoke(conversion, {
			context: "vessels.self",
			updates: [{ $source: "anchor-b", values: [{ path, value: null }] }],
		});
		expect(finalClear).toMatchObject([
			{ fields: { alarmId: "Deep Anchor", alarmStatus: "Alarm condition not met" } },
		]);
		expect(finalClear).toHaveLength(1);
	});

	it("uses the last Raymarine alarm occurrence without emitting a phantom clear", async () => {
		const path = "notifications.navigation.anchor";
		const activeThenClear = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const cleared = await invoke(activeThenClear, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						{ path, value: { state: "alarm", method: ["sound"] } },
						{ path, value: null },
					],
				},
			],
		});
		// The active state never left this callback, so the receiver never saw it
		// and must not receive a terminal clear for it.
		expect(cleared).toEqual([]);

		const clearThenActive = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		await invoke(clearThenActive, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [{ path, value: { state: "alarm", method: ["sound"] } }],
				},
			],
		});
		const reactivated = await invoke(clearThenActive, {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						{ path, value: null },
						{ path, value: { state: "alarm", method: ["sound"] } },
					],
				},
			],
		});
		expect(reactivated).toMatchObject([
			{ pgn: 65288, fields: { alarmStatus: "Alarm condition met and not silenced" } },
		]);
		expect(reactivated).toHaveLength(1);
	});

	it("time-gates terminal-clear retries so busy alarm traffic cannot exhaust them", async () => {
		vi.useFakeTimers();
		try {
			const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
			const path = "notifications.navigation.anchor";
			const activeDelta = {
				context: "vessels.self",
				updates: [
					{
						$source: "monitor",
						values: [{ path, value: { state: "alarm", method: ["sound"] } }],
					},
				],
			};
			const clearDelta = {
				context: "vessels.self",
				updates: [{ $source: "monitor", values: [{ path, value: null }] }],
			};
			const busyDelta = {
				context: "vessels.self",
				updates: [
					{
						$source: "monitor",
						values: [
							{
								path: "notifications.steering.autopilot.watchAlarm",
								value: { state: "alarm", method: ["sound"] },
							},
						],
					},
				],
			};
			const clearCount = (messages: N2KMessage[]) =>
				messages.filter((message) => message.fields.alarmStatus === "Alarm condition not met")
					.length;

			expect(await invoke(conversion, activeDelta)).toHaveLength(1);
			expect(clearCount(await invoke(conversion, clearDelta))).toBe(1);
			for (let update = 0; update < 20; update++) {
				expect(clearCount(await invoke(conversion, busyDelta))).toBe(0);
			}

			vi.advanceTimersByTime(999);
			expect(clearCount(await invoke(conversion, busyDelta))).toBe(0);
			vi.advanceTimersByTime(1);
			expect(clearCount(await invoke(conversion, busyDelta))).toBe(1);
			expect(clearCount(await invoke(conversion, busyDelta))).toBe(0);

			vi.advanceTimersByTime(1000);
			expect(clearCount(await invoke(conversion, busyDelta))).toBe(1);
			vi.advanceTimersByTime(1000);
			expect(clearCount(await invoke(conversion, busyDelta))).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("matches Raymarine child alarm paths only at segment boundaries", async () => {
		const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const childDelta = {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						{
							path: "notifications.navigation.anchor.drag",
							value: { state: "alarm", method: ["sound"] },
						},
					],
				},
			],
		};
		expect(conversion.acceptsInput?.(childDelta)).toBe(true);
		expect(await invoke(conversion, childDelta)).toMatchObject([
			{ pgn: 65288, fields: { alarmId: "Deep Anchor" } },
		]);

		const adjacentDelta = {
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: [
						{
							path: "notifications.navigation.anchorDrag",
							value: { state: "alarm", method: ["sound"] },
						},
					],
				},
			],
		};
		expect(conversion.acceptsInput?.(adjacentDelta)).toBe(false);
		expect(await invoke(conversion, adjacentDelta)).toEqual([]);
	});

	it("maps the current and legacy arrival-circle notification paths to WP Arrival", async () => {
		for (const path of [
			"notifications.navigation.course.arrivalCircleEntered",
			"notifications.navigation.arrivalCircleEntered",
		]) {
			const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
			const delta = {
				context: "vessels.self",
				updates: [
					{
						$source: "navigation-monitor",
						values: [{ path, value: { state: "alarm" } }],
					},
				],
			};
			expect(conversion.acceptsInput?.(delta), path).toBe(true);
			expect(await invoke(conversion, delta), path).toMatchObject([
				{ fields: { alarmId: "WP Arrival" } },
			]);
		}

		const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const formerBroadPrefix = {
			context: "vessels.self",
			updates: [
				{
					$source: "navigation-monitor",
					values: [
						{
							path: "notifications.navigation.arrival",
							value: { state: "alarm" },
						},
					],
				},
			],
		};
		expect(conversion.acceptsInput?.(formerBroadPrefix)).toBe(false);
		expect(await invoke(conversion, formerBroadPrefix)).toEqual([]);
	});

	it("rejects self, NMEA 2000, malformed, and irrelevant Raymarine input", async () => {
		const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const value = {
			path: "notifications.navigation.anchor",
			value: { state: "alarm", method: ["sound"] },
		};
		const rejected = [
			{
				context: "vessels.self",
				updates: [{ $source: plugin.id, source: { type: "plugin" }, values: [value] }],
			},
			{
				context: "vessels.self",
				updates: [{ $source: "can0.22", values: [value] }],
			},
			{
				context: "vessels.self",
				updates: [
					{
						$source: "monitor",
						values: [{ ...value, path: "notifications.nmea.can0.anchor" }],
					},
				],
			},
			{
				context: "vessels.self",
				updates: [{ $source: "monitor", values: [{ ...value, value: { method: ["sound"] } }] }],
			},
			{
				context: "vessels.self",
				updates: [
					{
						$source: "monitor",
						values: [{ ...value, path: "notifications.environment.temperature" }],
					},
				],
			},
		];

		for (const delta of rejected) {
			expect(conversion.acceptsInput?.(delta)).toBe(false);
			expect(await invoke(conversion, delta)).toEqual([]);
		}
	});

	it("bounds Raymarine contributor paths without duplicating a wire alarm identity", async () => {
		const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const batch = (count: number, state: "alarm" | "normal", start = 0) => ({
			context: "vessels.self",
			updates: [
				{
					$source: "monitor",
					values: Array.from({ length: count }, (_, index) => ({
						path: `notifications.navigation.anchor.contributor.${start + index}`,
						value: { state },
					})),
				},
			],
		});

		const active = await invoke(conversion, batch(257, "alarm"));
		expect(active).toMatchObject([
			{
				fields: {
					alarmId: "Deep Anchor",
					alarmStatus: "Alarm condition met and not silenced",
				},
			},
		]);
		expect(active).toHaveLength(1);

		// The oldest of 257 contributors was evicted by the 256-entry LRU. Clearing
		// the 256 retained paths therefore removes the final tracked contributor.
		const cleared = await invoke(conversion, batch(256, "normal", 1));
		expect(cleared).toMatchObject([
			{ fields: { alarmId: "Deep Anchor", alarmStatus: "Alarm condition not met" } },
		]);
		expect(cleared).toHaveLength(1);
	});

	it("emits Raymarine clears only for cached alarms", async () => {
		const conversion = createRaymarineAlarmsConversion(appForDeltas(), plugin);
		const path = "notifications.navigation.anchor";

		expect(
			await invoke(conversion, {
				context: "vessels.self",
				updates: [{ $source: "monitor", values: [{ path, value: null }] }],
			}),
		).toEqual([]);
		expect(
			await invoke(conversion, {
				context: "vessels.self",
				updates: [{ $source: "monitor", values: [{ path, value: { state: "normal" } }] }],
			}),
		).toEqual([]);
	});
});
