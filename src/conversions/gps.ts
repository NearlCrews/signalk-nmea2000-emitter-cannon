import {
	MAX_N2K_DOP,
	MAX_SATELLITE_COUNT,
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
import {
	isValidLatitude,
	isValidLongitude,
	isValidNumber,
	toFiniteInRange,
} from "../utils/validation.js";

// Distinct from routeTypes' Position (which has optional lat/lon and no
// altitude): the GPS callback requires a fixed lat/lon and accepts altitude.
interface GpsPosition {
	latitude: number;
	longitude: number;
	altitude?: number;
}

const GNSS_RATE_LIMIT_MS = 1000;

// Signal K and canboat spell the PGN 129029 lookup values differently, and the
// canboat encoder does not reject an unrecognized label: it silently encodes
// enum 0. Passing Signal K's own spelling straight through therefore made a
// normal fix ("GNSS Fix") broadcast as "no GNSS" (enum 0), telling every
// chartplotter on the bus there was no fix while a valid position rode
// alongside it. These tables translate instead. Keys are lower-cased so both
// the Signal K and the canboat spelling of a value resolve to the same entry.
// A value with no canboat counterpart is deliberately absent: for the two
// 4-bit fields an omitted lookup encodes as all-ones, which decodes as "not
// available", the honest answer.
const GNSS_TYPE_BY_SK: ReadonlyMap<string, string> = new Map([
	["gps", "GPS"],
	["glonass", "GLONASS"],
	["combined gps/glonass", "GPS+GLONASS"],
	["gps+glonass", "GPS+GLONASS"],
	["gps+sbas/waas", "GPS+SBAS/WAAS"],
	["gps+sbas/waas+glonass", "GPS+SBAS/WAAS+GLONASS"],
	["chayka", "Chayka"],
	["integrated", "integrated"],
	["surveyed", "surveyed"],
	["galileo", "Galileo"],
]);

const GNSS_METHOD_BY_SK: ReadonlyMap<string, string> = new Map([
	["no gps", "no GNSS"],
	["no gnss", "no GNSS"],
	["gnss fix", "GNSS fix"],
	["dgnss fix", "DGNSS fix"],
	["precise gnss", "Precise GNSS"],
	["rtk fixed integer", "RTK Fixed Integer"],
	["rtk float", "RTK float"],
	["estimated (dr) mode", "Estimated (DR) mode"],
	["manual input", "Manual Input"],
	["simulator mode", "Simulate mode"],
	["simulate mode", "Simulate mode"],
]);

// Every one of the four 2-bit integrity codes is assigned, so this field has no
// not-available sentinel: an omitted value encodes as all-ones, which decodes
// as "Unsafe". Most installs never publish navigation.gnss.integrity, so the
// field has to fall back to the explicit "no checking" code instead.
const GNSS_INTEGRITY_BY_SK: ReadonlyMap<string, string> = new Map([
	["no integrity checking", "No integrity checking"],
	["safe", "Safe"],
	["caution", "Caution"],
	["unsafe", "Unsafe"],
]);
const GNSS_INTEGRITY_UNCHECKED = "No integrity checking";

function lookupLabel(table: ReadonlyMap<string, string>, value: unknown): string | undefined {
	return typeof value === "string" ? table.get(value.trim().toLowerCase()) : undefined;
}

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

			// PGN 129025 latitude/longitude are Int32 scaled at 1e-7 degrees.
			// Out-of-range upstream values (NMEA 0183 bridge glitches, dead
			// reckoning) are silently dropped by Garmin chartplotters: drop the
			// frame here so we never put nonsense on the wire.
			if (!isValidLatitude(position.latitude) || !isValidLongitude(position.longitude)) {
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
				const geoidalSeparation = getSelfValue(app, "navigation.gnss.geoidalSeparation");

				const fields: N2KMessage["fields"] = {
					sid: N2K_DEFAULT_SID,
					date,
					time,
					latitude: position.latitude,
					longitude: position.longitude,
				};
				if (isValidNumber(position.altitude)) fields.altitude = position.altitude;
				const gnssTypeLabel = lookupLabel(GNSS_TYPE_BY_SK, gnssType);
				if (gnssTypeLabel !== undefined) fields.gnssType = gnssTypeLabel;
				const methodLabel = lookupLabel(GNSS_METHOD_BY_SK, method);
				if (methodLabel !== undefined) fields.method = methodLabel;
				fields.integrity = lookupLabel(GNSS_INTEGRITY_BY_SK, integrity) ?? GNSS_INTEGRITY_UNCHECKED;
				// The satellite count and both dilution figures are narrow wire
				// fields (uint8 and int16 at 0.01). An out-of-range value would wrap
				// rather than be rejected, so a bogus reading is dropped instead.
				const svs = toFiniteInRange(numberOfSvs, 0, MAX_SATELLITE_COUNT);
				if (svs !== undefined) fields.numberOfSvs = svs;
				const hdopValue = toFiniteInRange(hdop, 0, MAX_N2K_DOP);
				if (hdopValue !== undefined) fields.hdop = hdopValue;
				if (isValidNumber(geoidalSeparation)) fields.geoidalSeparation = geoidalSeparation;
				const pdopValue = toFiniteInRange(pdop, 0, MAX_N2K_DOP);
				if (pdopValue !== undefined) fields.pdop = pdopValue;

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
				// Signal K's own spellings, which differ from canboat's for both
				// lookups: "GNSS Fix" and "Combined GPS/GLONASS" used to encode as
				// enum 0 ("no GNSS" and "GPS"). Integrity is deliberately absent, so
				// this also pins the "no checking" fallback that keeps an omitted
				// field from encoding as "Unsafe".
				input: [{ longitude: -75.487264, latitude: 32.0631296, altitude: 12.5 }],
				skSelfData: {
					"navigation.gnss.methodQuality": { value: "GNSS Fix" },
					"navigation.gnss.type": { value: "Combined GPS/GLONASS" },
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
							gnssType: "GPS+GLONASS",
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
