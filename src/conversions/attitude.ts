import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, N2K_DEFAULT_SID } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { toSignedAngle, toValidNumber } from "../utils/validation.js";

interface AttitudeData {
	pitch?: number;
	yaw?: number;
	roll?: number;
}

export default function createAttitudeConversion(
	_app: SignalKApp,
): ConversionModule<[AttitudeData]> {
	return {
		title: "Vessel Attitude (PGN 127257)",
		optionKey: "ATTITUDE",
		category: "navigation",
		keys: ["navigation.attitude"],
		callback: ((attitude: AttitudeData) => {
			if (!attitude || typeof attitude !== "object") {
				return [];
			}

			// All three PGN 127257 components are the signed int16 0.0001 rad
			// angle field, which truncates an out-of-range input rather than
			// rejecting it. See toSignedAngle: a heading-style yaw of 4 rad would
			// otherwise reach the receiver as -2.5536 rad, a different direction.
			const pitch = toSignedAngle(toValidNumber(attitude.pitch));
			const yaw = toSignedAngle(toValidNumber(attitude.yaw));
			const roll = toSignedAngle(toValidNumber(attitude.roll));

			const fields: N2KMessage["fields"] = { sid: N2K_DEFAULT_SID };
			if (pitch !== null && pitch !== undefined) fields.pitch = pitch;
			if (yaw !== null && yaw !== undefined) fields.yaw = yaw;
			if (roll !== null && roll !== undefined) fields.roll = roll;

			// An attitude object whose three components are all invalid would
			// otherwise emit a frame carrying nothing but the SID.
			if (fields.pitch === undefined && fields.yaw === undefined && fields.roll === undefined) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 127257,
					dst: N2K_BROADCAST_DST,
					fields,
				},
			];
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
				// dropped from the PGN, never emitted as corrupt bits.
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
			{
				// A compass-style IMU publishes yaw as an absolute [0, 2pi)
				// heading, which the signed field cannot carry: 4 rad used to
				// reach the receiver as -2.5536 rad, a heading 15 degrees off the
				// true one. Wrapping preserves the direction. A pitch of exactly
				// pi sits above the largest angle canboat's decoder accepts, so it
				// clamps to 3.1415 instead of being discarded.
				input: [
					{
						yaw: 4.0,
						pitch: Math.PI,
						roll: -0.042,
					},
				],
				expected: [
					{
						dst: 255,
						fields: {
							// biome-ignore lint/suspicious/noApproximativeNumericConstant: decoded wire value. Math.PI clamps to this literal, so substituting Math.PI would falsely pass.
							pitch: 3.1415,
							roll: -0.042,
							sid: 87,
							yaw: -2.2832,
						},
						pgn: 127257,
						prio: 2,
					},
				],
			},
		],
	};
}
