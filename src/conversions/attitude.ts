import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_DEFAULT_SID,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

/**
 * Attitude data interface
 */
interface AttitudeData {
	pitch?: number;
	yaw?: number;
	roll?: number;
}

/**
 * Attitude conversion module - converts Signal K attitude data to NMEA 2000 PGN 127257
 */
export default function createAttitudeConversion(
	app: SignalKApp,
): ConversionModule<[AttitudeData]> {
	return {
		title: "Attitude (127257)",
		optionKey: "ATTITUDE",
		keys: ["navigation.attitude"],
		callback: ((attitude: AttitudeData) => {
			try {
				// Validate attitude input
				if (!attitude || typeof attitude !== "object") {
					return [];
				}

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127257,
						dst: N2K_BROADCAST_DST,
						fields: {
							sid: N2K_DEFAULT_SID,
							...(isValidNumber(attitude.pitch)
								? { pitch: attitude.pitch }
								: {}),
							...(isValidNumber(attitude.yaw) ? { yaw: attitude.yaw } : {}),
							...(isValidNumber(attitude.roll) ? { roll: attitude.roll } : {}),
						},
					},
				];
			} catch (err) {
				app.error(err instanceof Error ? err.message : String(err));
				return [];
			}
		}) as ConversionCallback<[AttitudeData]>,

		tests: [
			{
				input: [
					{
						yaw: 1.8843,
						pitch: 0.042,
						roll: 0.042,
					},
				],
				expected: [
					{
						dst: 255,
						fields: {
							pitch: 0.042,
							roll: 0.042,
							sid: 87,
							yaw: 1.8843,
						},
						pgn: 127257,
						prio: 2,
					},
				],
			},
			{
				// Faulty IMU: pitch is NaN, yaw is Infinity. Both must be
				// dropped from the PGN — never emitted as corrupt bits.
				input: [
					{
						yaw: Number.POSITIVE_INFINITY,
						pitch: Number.NaN,
						roll: 0.1,
					},
				],
				expected: [
					{
						dst: 255,
						fields: {
							roll: 0.1,
							sid: 87,
						},
						pgn: 127257,
						prio: 2,
					},
				],
			},
		],
	};
}
