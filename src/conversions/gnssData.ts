import {
	DEFAULT_DATA_TIMEOUT_MS,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

interface SatelliteData {
	id?: number;
	elevation?: number;
	azimuth?: number;
	SNR?: number;
	signalToNoiseRatio?: number;
	used?: boolean;
}

export default function createGnssDataConversions(
	_app: SignalKApp,
): ConversionModule<unknown[]>[] {
	return [
		// GNSS DOPs (PGN 129539)
		{
			title: "GNSS DOPs (PGN 129539)",
			optionKey: "GNSS_DOPS",
			category: "navigation",
			// v1 SK only publishes horizontalDilution and positionDilution.
			// verticalDilution, timeDilution, and mode are not in the v1 schema
			// and signalk-server does not push them into the streambundle, so
			// the matching PGN fields (vdop, tdop) are left undefined: canboatjs
			// encodes that as the spec's "data not available" sentinel.
			keys: [
				"navigation.gnss.horizontalDilution",
				"navigation.gnss.positionDilution",
			],
			timeouts: [DEFAULT_DATA_TIMEOUT_MS, DEFAULT_DATA_TIMEOUT_MS],
			callback: ((hdop: number | null, pdop: number | null) => {
				const hdopValue = isValidNumber(hdop) ? hdop : undefined;
				// PDOP has no direct field in PGN 129539; we still subscribe so a
				// PDOP-only publisher triggers the conversion, but the wire payload
				// carries only hdop (when available); vdop/tdop stay undefined and
				// canboatjs encodes them as the spec's "data not available" sentinel.
				const pdopValid = isValidNumber(pdop);

				// Skip emission when neither DOP is usable. Single guard replaces
				// an earlier double-check; the prior "both null" early-return was
				// redundant with this combined hdopValue/pdopValid test.
				if (hdopValue === undefined && !pdopValid) {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129539,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_SID_ZERO,
							desiredMode: "Auto",
							actualMode: "Auto",
							hdop: hdopValue,
							vdop: undefined,
							tdop: undefined,
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
								desiredMode: "Auto",
								actualMode: "Auto",
								hdop: 1.2,
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
								desiredMode: "Auto",
								actualMode: "Auto",
								hdop: 1.5,
							},
						},
					],
				},
				{
					// PDOP-only: the conversion fires (the subscription matched
					// positionDilution) and emits a frame with hdop omitted.
					input: [null, 2.5],
					expected: [
						{
							prio: 2,
							pgn: 129539,
							dst: 255,
							fields: {
								sid: N2K_SID_ZERO,
								desiredMode: "Auto",
								actualMode: "Auto",
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
			// subscribe to the composite and the scalar satellites count
			// (published separately) as a fallback.
			keys: ["navigation.gnss.satellitesInView", "navigation.gnss.satellites"],
			timeouts: [DEFAULT_DATA_TIMEOUT_MS, DEFAULT_DATA_TIMEOUT_MS],
			callback: ((
				satellitesInView: {
					count?: number;
					satellites?: SatelliteData[];
				} | null,
				satelliteCount: number | null,
			) => {
				const list = satellitesInView?.satellites;
				if (!Array.isArray(list) || list.length === 0) {
					return [];
				}

				const compositeCount = satellitesInView?.count;
				const reportedCount = isValidNumber(compositeCount)
					? compositeCount
					: isValidNumber(satelliteCount)
						? satelliteCount
						: list.length;

				// Conservative fast-packet cap for PGN 129540: 12 satellites keep
				// the multi-frame payload well under the 223-byte canboat limit.
				const maxSatellites = Math.min(list.length, 12);
				const satelliteData = new Array(maxSatellites);
				for (let i = 0; i < maxSatellites; i++) {
					const sat = list[i] as SatelliteData;
					satelliteData[i] = {
						prn: sat.id ?? i + 1,
						elevation: sat.elevation ?? 0,
						azimuth: sat.azimuth ?? 0,
						snr: sat.SNR ?? sat.signalToNoiseRatio ?? 0,
						rangeResiduals: 0,
						status: sat.used ? "Used" : "Not tracked",
					};
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129540,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_SID_ZERO,
							rangeResidualMode: "Range residuals were used to calculate data",
							// Mirror the maxSatellites cap so satsInView matches list length.
							satsInView: Math.min(reportedCount, 12),
							list: satelliteData,
						},
					},
				];
			}) as ConversionCallback<
				[{ count?: number; satellites?: SatelliteData[] } | null, number | null]
			>,
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
						null,
					],
					expected: [
						{
							prio: 2,
							pgn: 129540,
							dst: 255,
							fields: {
								sid: N2K_SID_ZERO,
								rangeResidualMode:
									"Range residuals were used to calculate data",
								satsInView: 8,
								list: [
									{
										prn: 1,
										elevation: 0.7854,
										azimuth: 1.5708,
										snr: 40,
										rangeResiduals: 0,
										status: "Used",
									},
									{
										prn: 2,
										elevation: 0.5236,
										// biome-ignore lint/suspicious/noApproximativeNumericConstant: encoded wire value. Input Math.PI is rounded by the N2K encoder to this literal; substituting Math.PI would falsely pass.
										azimuth: 3.1416,
										snr: 35,
										rangeResiduals: 0,
										status: "Used",
									},
									{
										prn: 3,
										elevation: 1.0472,
										azimuth: 4.7124,
										snr: 42,
										rangeResiduals: 0,
										status: "Not tracked",
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
