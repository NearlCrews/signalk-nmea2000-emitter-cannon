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
import { errMessage } from "../utils/errorUtils.js";
import { isValidNumber } from "../utils/validation.js";

interface Position {
	latitude: number;
	longitude: number;
	altitude?: number;
}

const GNSS_RATE_LIMIT_MS = 1000;

export default function createGpsConversion(
	app: SignalKApp,
): ConversionModule<[Position | null]> {
	let lastUpdate: number | null = null;

	return {
		title: "Location (129025,129029)",
		optionKey: "GPS",
		keys: ["navigation.position"],
		callback: ((position: Position | null) => {
			try {
				if (!position || typeof position !== "object") {
					return [];
				}

				if (
					!isValidNumber(position.latitude) ||
					!isValidNumber(position.longitude)
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

					res.push({
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129029,
						dst: N2K_BROADCAST_DST,
						fields,
					});
				}

				return res;
			} catch (err) {
				app.error(errMessage(err));
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
