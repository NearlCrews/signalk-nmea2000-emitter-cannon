import {
	DEFAULT_DATA_TIMEOUT_MS,
	MAX_N2K_DOP,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";
import { isValidNumber, toFiniteInRange, toUnsignedAngle } from "../utils/validation.js";

const MAX_SATELLITES_PER_FAST_PACKET = 18;

interface SatelliteData {
	id?: number;
	elevation?: number;
	azimuth?: number;
	SNR?: number;
	signalToNoiseRatio?: number;
	used?: boolean;
}

export default function createGnssDataConversions(_app: SignalKApp): ConversionModule<unknown[]>[] {
	return [
		// GNSS DOPs (PGN 129539)
		{
			title: "GNSS DOPs (PGN 129539)",
			optionKey: "GNSS_DOPS",
			category: "navigation",
			// Signal K publishes HDOP and PDOP. When both are valid, derive VDOP
			// from PDOP squared = HDOP squared + VDOP squared. TDOP and mode are
			// not present in the v1 schema and remain unavailable.
			keys: ["navigation.gnss.horizontalDilution", "navigation.gnss.positionDilution"],
			timeouts: [DEFAULT_DATA_TIMEOUT_MS, DEFAULT_DATA_TIMEOUT_MS],
			callback: ((hdop: number | null, pdop: number | null) => {
				const hdopValue = toFiniteInRange(hdop, 0, MAX_N2K_DOP);
				const pdopValue = toFiniteInRange(pdop, 0, MAX_N2K_DOP);
				if (hdopValue === undefined) return [];
				const vdop =
					pdopValue !== undefined && pdopValue >= hdopValue
						? toFiniteInRange(
								Math.round(Math.sqrt(pdopValue ** 2 - hdopValue ** 2) * 100) / 100,
								0,
								MAX_N2K_DOP,
							)
						: undefined;

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129539,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_SID_ZERO,
							hdop: hdopValue,
							...(vdop === undefined ? {} : { vdop }),
						},
					},
				];
			}) as ConversionCallback<[number | null, number | null]>,
			tests: [
				{
					input: [1.2, 2.4],
					expected: [
						{
							prio: 2,
							pgn: 129539,
							dst: 255,
							fields: {
								sid: N2K_SID_ZERO,
								hdop: 1.2,
								vdop: 2.08,
							},
						},
					],
				},
				{
					// HDOP alone is sufficient to emit; vdop/tdop remain unset
					// (canboatjs encodes as "data not available").
					input: [1.5, null],
					expected: [
						{
							prio: 2,
							pgn: 129539,
							dst: 255,
							fields: {
								sid: N2K_SID_ZERO,
								hdop: 1.5,
							},
						},
					],
				},
				{
					// PDOP has no direct PGN 129539 field and cannot produce a
					// standards-correct frame without HDOP.
					input: [null, 2.5],
					expected: [],
				},
				{
					// Negative and out-of-range HDOP cannot be represented as
					// physical DOP values.
					input: [-0.01, 2.5],
					expected: [],
				},
				{
					// PDOP below HDOP cannot produce a real VDOP. HDOP remains useful.
					input: [2.5, 1.5],
					expected: [
						{
							prio: 2,
							pgn: 129539,
							dst: 255,
							fields: {
								sid: N2K_SID_ZERO,
								hdop: 2.5,
							},
						},
					],
				},
			],
		},

		// GNSS Satellites in View (PGN 129540)
		{
			title: "GNSS Satellites (PGN 129540)",
			optionKey: "GNSS_SATELLITES",
			category: "navigation",
			// satellitesInView is a composite published as a single value at
			// the parent path: { count, satellites: [...] }. signalk-server
			// does not push child sub-paths into the streambundle, so we
			// subscribe only to the composite. The scalar count carries no
			// repeating-group detail and must not re-emit a cached satellite list.
			keys: ["navigation.gnss.satellitesInView"],
			timeouts: [DEFAULT_DATA_TIMEOUT_MS],
			callback: ((
				satellitesInView: {
					count?: number;
					satellites?: SatelliteData[];
				} | null,
			) => {
				const list = satellitesInView?.satellites;
				if (!Array.isArray(list) || list.length === 0) {
					return [];
				}

				// Each Canboat repeating group is 12 bytes after a 3-byte header, so
				// 18 satellites produce 219 bytes and fit the 223-byte fast packet.
				const satelliteData = [];
				for (const sat of list) {
					if (satelliteData.length >= MAX_SATELLITES_PER_FAST_PACKET) break;
					if (!isValidNumber(sat.id) || !Number.isInteger(sat.id) || sat.id < 0 || sat.id > 252) {
						continue;
					}
					const elevation = toFiniteInRange(sat.elevation, -Math.PI, Math.PI);
					// Unsigned [0, 2pi) on the wire, so normalize rather than range
					// check: a provider publishing [-pi, pi] would otherwise lose every
					// western-hemisphere satellite instead of having it wrapped.
					const azimuth = toUnsignedAngle(sat.azimuth);
					const snr = toFiniteInRange(sat.SNR ?? sat.signalToNoiseRatio, -327.67, 327.64);
					satelliteData.push({
						prn: sat.id,
						...(elevation === undefined ? {} : { elevation }),
						...(azimuth === undefined ? {} : { azimuth }),
						...(snr === undefined ? {} : { snr }),
						// Signal K supplies neither range residuals nor tracking state.
						// Only a positive `used` flag proves the NMEA status value.
						...(sat.used === true ? { status: "Used" } : {}),
					});
				}
				if (satelliteData.length === 0) return [];

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129540,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_SID_ZERO,
							// satsInView is the count of emitted repeating-group
							// entries. A provider's reported count can exceed the
							// actual satellites array, so the encoded list length is
							// authoritative and the field always matches it.
							satsInView: satelliteData.length,
							list: satelliteData,
						},
					},
				];
			}) as ConversionCallback<[{ count?: number; satellites?: SatelliteData[] } | null]>,
			tests: [
				{
					input: [
						{
							count: 8,
							satellites: [
								{
									id: 1,
									elevation: 0.7854,
									azimuth: 1.5708,
									SNR: 40,
									used: true,
								},
								{
									id: 2,
									elevation: 0.5236,
									azimuth: Math.PI,
									SNR: 35,
									used: true,
								},
								{
									id: 3,
									elevation: 1.0472,
									azimuth: 4.7124,
									SNR: 42,
									used: false,
								},
							],
						},
					],
					expected: [
						{
							prio: 2,
							pgn: 129540,
							dst: 255,
							fields: {
								sid: N2K_SID_ZERO,
								// satsInView tracks the emitted list length, not
								// the provider's reported count.
								satsInView: 3,
								list: [
									{
										prn: 1,
										elevation: 0.7854,
										azimuth: 1.5708,
										snr: 40,
										status: "Used",
									},
									{
										prn: 2,
										elevation: 0.5236,
										// biome-ignore lint/suspicious/noApproximativeNumericConstant: encoded wire value. Input Math.PI is rounded by the N2K encoder to this literal; substituting Math.PI would falsely pass.
										azimuth: 3.1416,
										snr: 35,
										status: "Used",
									},
									{
										prn: 3,
										elevation: 1.0472,
										azimuth: 4.7124,
										snr: 42,
									},
								],
							},
						},
					],
				},
			],
		},
	];
}
