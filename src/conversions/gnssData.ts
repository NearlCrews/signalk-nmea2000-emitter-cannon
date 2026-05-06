import {
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
			title: "GNSS DOPs (129539)",
			optionKey: "GNSS_DOPS",
			keys: [
				"navigation.gnss.horizontalDilution",
				"navigation.gnss.verticalDilution",
				"navigation.gnss.timeDilution",
				"navigation.gnss.mode",
			],
			timeouts: [10000, 10000, 10000, 10000], // 10 seconds
			callback: ((
				hdop: number | null,
				vdop: number | null,
				tdop: number | null,
				mode: string | null,
			) => {
				// Only send if we have at least one DOP value
				if (hdop == null && vdop == null && tdop == null) {
					return [];
				}

				const hdopValue = isValidNumber(hdop) ? hdop : undefined;
				const vdopValue = isValidNumber(vdop) ? vdop : undefined;
				const tdopValue = isValidNumber(tdop) ? tdop : undefined;
				const modeString = typeof mode === "string" ? mode : "Auto";
				const modeValue =
					modeString === "3D" ? "3D" : modeString === "2D" ? "2D" : "Auto";

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 129539,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_SID_ZERO,
							desiredMode: modeValue,
							actualMode: modeValue,
							hdop: hdopValue,
							vdop: vdopValue,
							tdop: tdopValue,
						},
					},
				];
			}) as ConversionCallback<
				[number | null, number | null, number | null, string | null]
			>,
			tests: [
				{
					input: [1.2, 1.8, 0.9, "3D"],
					expected: [
						{
							prio: 2,
							pgn: 129539,
							dst: 255,
							fields: {
								sid: N2K_SID_ZERO,
								desiredMode: "3D",
								actualMode: "3D",
								hdop: 1.2,
								vdop: 1.8,
								tdop: 0.9,
							},
						},
					],
				},
				{
					// When Signal K reports mode "Auto", actualMode must NOT
					// falsely report "No GNSS" — that would tell MFDs that the
					// receiver has no fix. Fall through to "Auto".
					input: [1.5, 2.0, 1.0, "Auto"],
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
								vdop: 2.0,
								tdop: 1.0,
							},
						},
					],
				},
			],
		},

		// GNSS Satellites in View (PGN 129540)
		{
			title: "GNSS Satellites in View (129540)",
			optionKey: "GNSS_SATELLITES",
			keys: [
				"navigation.gnss.satellitesInView.count",
				"navigation.gnss.satellitesInView.satellites",
			],
			timeouts: [10000, 10000], // 10 seconds
			callback: ((count: number | null, satellites: SatelliteData[] | null) => {
				if (count == null || satellites == null || !Array.isArray(satellites)) {
					return [];
				}

				const countValue = isValidNumber(count) ? count : 0;

				const maxSatellites = Math.min(satellites.length, 12);
				const satelliteData = new Array(maxSatellites);
				for (let i = 0; i < maxSatellites; i++) {
					const sat = satellites[i] as SatelliteData;
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
							mode: "Auto",
							satsInView: Math.min(countValue, 12),
							list: satelliteData,
						},
					},
				];
			}) as ConversionCallback<[number | null, SatelliteData[] | null]>,
			tests: [
				{
					input: [
						8,
						[
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
					],
					expected: [
						{
							prio: 2,
							pgn: 129540,
							dst: 255,
							fields: {
								sid: N2K_SID_ZERO,
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
										// biome-ignore lint/suspicious/noApproximativeNumericConstant: encoded wire value — input Math.PI is rounded by the N2K encoder to this literal; substituting Math.PI would falsely pass.
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
