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
import { getSelfValue } from "../utils/pathUtils.js";
import { isValidNumber } from "../utils/validation.js";

// Distinct from routeTypes' Position (which has optional lat/lon and no
// altitude): the GPS callback requires a fixed lat/lon and accepts altitude.
interface GpsPosition {
	latitude: number;
	longitude: number;
	altitude?: number;
}

const GNSS_RATE_LIMIT_MS = 1000;

export default function createGpsConversion(
	app: SignalKApp,
): ConversionModule<[GpsPosition | null]> {
	let lastUpdate: number | null = null;

	return {
		title: "GPS Position (PGNs 129025, 129029)",
		optionKey: "GPS",
		category: "navigation",
		presets: ["basic-nav"],
		keys: ["navigation.position"],
		callback: ((position: GpsPosition | null) => {
			if (!position || typeof position !== "object") {
				return [];
			}

			if (
				!isValidNumber(position.latitude) ||
				!isValidNumber(position.longitude)
			) {
				return [];
			}

			// PGN 129025 latitude/longitude are Int32 scaled at 1e-7 degrees.
			// Out-of-range upstream values (NMEA 0183 bridge glitches, dead
			// reckoning) are silently dropped by Garmin chartplotters: drop the
			// frame here so we never put nonsense on the wire.
			if (
				Math.abs(position.latitude) > 90 ||
				Math.abs(position.longitude) > 180
			) {
				return [];
			}

			const res: N2KMessage[] = [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129025,
					dst: N2K_BROADCAST_DST,
					fields: {
						latitude: position.latitude,
						longitude: position.longitude,
					},
				},
			];

			const now = Date.now();
			if (lastUpdate === null || now - lastUpdate > GNSS_RATE_LIMIT_MS) {
				lastUpdate = now;

				const { date, time } = toN2KDateTime();

				const gnssType = getSelfValue(app, "navigation.gnss.type");
				const method = getSelfValue(app, "navigation.gnss.methodQuality");
				const integrity = getSelfValue(app, "navigation.gnss.integrity");
				const numberOfSvs = getSelfValue(app, "navigation.gnss.satellites");
				const hdop = getSelfValue(app, "navigation.gnss.horizontalDilution");
				const pdop = getSelfValue(app, "navigation.gnss.positionDilution");
				const geoidalSeparation = getSelfValue(
					app,
					"navigation.gnss.geoidalSeparation",
				);

				const fields: N2KMessage["fields"] = {
					sid: N2K_DEFAULT_SID,
					date,
					time,
					latitude: position.latitude,
					longitude: position.longitude,
				};
				if (isValidNumber(position.altitude))
					fields.altitude = position.altitude;
				if (typeof gnssType === "string") fields.gnssType = gnssType;
				if (typeof method === "string") fields.method = method;
				if (typeof integrity === "string") fields.integrity = integrity;
				if (isValidNumber(numberOfSvs)) fields.numberOfSvs = numberOfSvs;
				if (isValidNumber(hdop)) fields.hdop = hdop;
				if (isValidNumber(geoidalSeparation))
					fields.geoidalSeparation = geoidalSeparation;
				if (isValidNumber(pdop)) fields.pdop = pdop;

				res.push({
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129029,
					dst: N2K_BROADCAST_DST,
					fields,
				});
			}

			return res;
		}) as ConversionCallback<[GpsPosition | null]>,

		tests: [
			{
				input: [
					{ longitude: -75.487264, latitude: 32.0631296, altitude: 12.5 },
				],
				skSelfData: {
					"navigation.gnss.methodQuality": { value: "GNSS fix" },
					"navigation.gnss.integrity": { value: "No integrity checking" },
					"navigation.gnss.type": { value: "GPS" },
					"navigation.gnss.satellites": { value: 9 },
					"navigation.gnss.horizontalDilution": { value: 1.2 },
					"navigation.gnss.geoidalSeparation": { value: -34.5 },
					"navigation.gnss.positionDilution": { value: 2.1 },
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
							pdop: 2.1,
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
				// Position without altitude or GNSS metadata. Second call is
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
			{
				input: [{ longitude: 0, latitude: 999 }],
				expected: [],
			},
			{
				input: [{ longitude: -200, latitude: 0 }],
				expected: [],
			},
		],
	};
}
