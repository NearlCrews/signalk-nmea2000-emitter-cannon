import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_DEFAULT_SID,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { toN2KDateTime } from "../utils/dateUtils.js";

/**
 * GPS position interface for Signal K position data
 */
interface Position {
	latitude: number;
	longitude: number;
	altitude?: number;
}

/**
 * GPS conversion module - converts Signal K position data to NMEA 2000 PGNs 129025 & 129029
 */
export default function createGpsConversion(
	app: SignalKApp,
): ConversionModule<[Position | null]> {
	let lastUpdate: Date | null = null;

	return {
		title: "Location (129025,129029)",
		optionKey: "GPS",
		keys: ["navigation.position"],
		callback: ((position: Position | null) => {
			try {
				// Validate position input
				if (!position || typeof position !== "object") {
					return [];
				}

				const pos = position as Position;
				if (
					typeof pos.latitude !== "number" ||
					typeof pos.longitude !== "number"
				) {
					return [];
				}

				// Always generate basic position message (PGN 129025)
				const res: N2KMessage[] = [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129025,
						dst: N2K_BROADCAST_DST,
						fields: {
							latitude: pos.latitude,
							longitude: pos.longitude,
						},
					},
				];

				// Generate detailed GNSS data (PGN 129029) with rate limiting
				if (lastUpdate === null || Date.now() - lastUpdate.getTime() > 1000) {
					lastUpdate = new Date();

					const { date, time } = toN2KDateTime();

					const gnssType = app.getSelfPath("navigation.gnss.type.value");
					const method = app.getSelfPath("navigation.gnss.methodQuality.value");
					const integrity = app.getSelfPath("navigation.gnss.integrity.value");
					const numberOfSvs = app.getSelfPath(
						"navigation.gnss.satellites.value",
					);
					const hdop = app.getSelfPath(
						"navigation.gnss.horizontalDilution.value",
					);
					const geoidalSeparation = app.getSelfPath(
						"navigation.gnss.geoidalSeparation.value",
					);

					res.push({
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129029,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_DEFAULT_SID,
							date,
							time,
							latitude: pos.latitude,
							longitude: pos.longitude,
							...(typeof pos.altitude === "number"
								? { altitude: pos.altitude }
								: {}),
							...(typeof gnssType === "string" ? { gnssType } : {}),
							...(typeof method === "string" ? { method } : {}),
							...(typeof integrity === "string" ? { integrity } : {}),
							...(typeof numberOfSvs === "number" ? { numberOfSvs } : {}),
							...(typeof hdop === "number" ? { hdop } : {}),
							...(typeof geoidalSeparation === "number"
								? { geoidalSeparation }
								: {}),
						},
					});
				}

				return res;
			} catch (err) {
				app.error(err instanceof Error ? err.message : String(err));
				return [];
			}
		}) as ConversionCallback<[Position | null]>,

		tests: [
			{
				input: [
					{ longitude: -75.487264, latitude: 32.0631296, altitude: 12.5 },
				],
				skSelfData: {
					"navigation.gnss.methodQuality.value": "GNSS fix",
					"navigation.gnss.integrity.value": "No integrity checking",
					"navigation.gnss.type.value": "GPS",
					"navigation.gnss.satellites.value": 9,
					"navigation.gnss.horizontalDilution.value": 1.2,
					"navigation.gnss.geoidalSeparation.value": -34.5,
				},
				expected: [
					{
						prio: 2,
						pgn: 129025,
						dst: 255,
						fields: {
							latitude: 32.0631296,
							longitude: -75.487264,
						},
					},
					{
						prio: 2,
						pgn: 129029,
						dst: 255,
						fields: {
							sid: 87,
							latitude: 32.0631296,
							longitude: -75.487264,
							altitude: 12.5,
							gnssType: "GPS",
							method: "GNSS fix",
							integrity: "No integrity checking",
							numberOfSvs: 9,
							hdop: 1.2,
							geoidalSeparation: -34.5,
						},
						__preprocess__: (testResult: N2KMessage) => {
							// Remove dynamic date/time fields and canboat-decoder
							// artifacts (empty reference-station list) for testing.
							delete testResult.fields.date;
							delete testResult.fields.time;
							delete testResult.fields.list;
						},
					},
				],
			},
			{
				// Position without altitude or GNSS metadata — second call is
				// rate-limited so only PGN 129025 is emitted.
				input: [{ longitude: -122.419416, latitude: 37.774929 }],
				expected: [
					{
						prio: 2,
						pgn: 129025,
						dst: 255,
						fields: {
							latitude: 37.774929,
							longitude: -122.419416,
						},
					},
				],
			},
		],
	};
}
