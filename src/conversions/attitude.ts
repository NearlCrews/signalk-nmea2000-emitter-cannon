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
import { errMessage } from "../utils/errorUtils.js";
import { isValidNumber } from "../utils/validation.js";

interface AttitudeData {
	pitch?: number;
	yaw?: number;
	roll?: number;
}

export default function createAttitudeConversion(
	app: SignalKApp,
): ConversionModule<[AttitudeData]> {
	return {
		title: "Attitude (127257)",
		optionKey: "ATTITUDE",
		keys: ["navigation.attitude"],
		callback: ((attitude: AttitudeData) => {
			try {
				if (!attitude || typeof attitude !== "object") {
					return [];
				}

				const fields: N2KMessage["fields"] = { sid: N2K_DEFAULT_SID };
				if (isValidNumber(attitude.pitch)) fields.pitch = attitude.pitch;
				if (isValidNumber(attitude.yaw)) fields.yaw = attitude.yaw;
				if (isValidNumber(attitude.roll)) fields.roll = attitude.roll;

				return [
					{
						prio: N2K_DEFAULT_PRIORITY,
						pgn: 127257,
						dst: N2K_BROADCAST_DST,
						fields,
					},
				];
			} catch (err) {
				app.error(errMessage(err));
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
