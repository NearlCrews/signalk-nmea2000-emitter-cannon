import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";
import { isValidNumber, toSignedAngle } from "../utils/validation.js";

export default function createLeewayConversion(
	_app: SignalKApp,
): ConversionModule<[number | null]> {
	return {
		title: "Leeway Angle (PGN 128000)",
		optionKey: "LEEWAY",
		category: "navigation",
		keys: ["navigation.leewayAngle"],
		callback: ((leeway: number | null) => {
			if (!isValidNumber(leeway)) {
				return [];
			}
			// PGN 128000 leewayAngle is the signed int16 0.0001 rad field the
			// heading, rudder, and variation conversions already route through
			// toSignedAngle. It truncates rather than rejecting, so a provider
			// publishing degrees instead of the radians the Signal K spec calls
			// for sent 5 degrees of starboard leeway onto the bus as -1.5536 rad,
			// an 89 degree crab to port.
			const leewayAngle = toSignedAngle(leeway);
			if (leewayAngle === null || leewayAngle === undefined) {
				return [];
			}
			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 128000,
					dst: N2K_BROADCAST_DST,
					fields: {
						leewayAngle,
					},
				},
			];
		}) as ConversionCallback<[number | null]>,

		tests: [
			{
				input: [0.24],
				expected: [
					{
						prio: 2,
						pgn: 128000,
						dst: 255,
						fields: {
							leewayAngle: 0.24,
						},
					},
				],
			},
			{
				input: [-0.15],
				expected: [
					{
						prio: 2,
						pgn: 128000,
						dst: 255,
						fields: {
							leewayAngle: -0.15,
						},
					},
				],
			},
			{
				// Regression: the signed field truncates rather than wrapping by a
				// turn. A provider publishing the leeway in degrees sends 5, which
				// reached the receiver as -1.5536 rad: 5 degrees of crab to
				// starboard displayed as 89 degrees to port. The wrap now preserves
				// the direction.
				input: [5],
				expected: [
					{
						prio: 2,
						pgn: 128000,
						dst: 255,
						fields: {
							leewayAngle: -1.2832,
						},
					},
				],
			},
			{
				// A leeway of exactly pi sits above the largest angle canboat's
				// decoder accepts, so it used to be discarded on arrival. It now
				// clamps to 3.1415 and survives the round trip.
				input: [Math.PI],
				expected: [
					{
						prio: 2,
						pgn: 128000,
						dst: 255,
						fields: {
							// biome-ignore lint/suspicious/noApproximativeNumericConstant: decoded wire value. Math.PI clamps to this literal, so substituting Math.PI would falsely pass.
							leewayAngle: 3.1415,
						},
					},
				],
			},
		],
	};
}
