import {
	MAX_N2K_ANGLE_SIGNED_RADIANS,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { toFiniteInRange } from "../utils/validation.js";

export default function createRudderConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Rudder Position (PGN 127245)",
		optionKey: "RUDDER",
		category: "navigation",
		presets: ["basic-nav"],
		keys: ["steering.rudderAngle", "steering.rudderAngleTarget"],
		timeouts: [1000, 1000],
		callback: (rudderAngle: unknown, rudderAngleTarget: unknown): N2KMessage[] => {
			// angleOrder and position are the signed int16 0.0001 rad field. A
			// rudder is a bounded mechanical deflection, not a circular quantity,
			// so an angle past the field ceiling is bad data and the frame is
			// dropped rather than wrapped the way toSignedAngle treats a compass
			// bearing. The bound is 3.1415 and not pi because canboat's decoder
			// discards anything above it; see MAX_N2K_ANGLE_SIGNED_RADIANS.
			const angle =
				toFiniteInRange(rudderAngle, -MAX_N2K_ANGLE_SIGNED_RADIANS, MAX_N2K_ANGLE_SIGNED_RADIANS) ??
				null;
			const target =
				toFiniteInRange(
					rudderAngleTarget,
					-MAX_N2K_ANGLE_SIGNED_RADIANS,
					MAX_N2K_ANGLE_SIGNED_RADIANS,
				) ?? null;

			if (angle === null && target === null) {
				return [];
			}

			let directionOrder = "No Order";
			if (target !== null) {
				if (target > 0) directionOrder = "Move to starboard";
				else if (target < 0) directionOrder = "Move to port";
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 127245,
					dst: N2K_BROADCAST_DST,
					fields: {
						instance: 0,
						// directionOrder is the redundant 3-bit enum. angleOrder is a
						// signed field carrying the same port/starboard convention as
						// position, so it keeps the sign: sending the magnitude made a
						// receiver that reads angleOrder on its own, the normal thing to
						// do with a signed field, show a port order as starboard.
						directionOrder,
						angleOrder: target ?? undefined,
						position: angle,
					},
				},
			];
		},

		tests: [
			{
				input: [0.0873, 0.1396], // 5 degrees actual, 8 degrees target (starboard)
				expected: [
					{
						prio: 2,
						pgn: 127245,
						dst: 255,
						fields: {
							angleOrder: 0.1396,
							directionOrder: "Move to starboard",
							instance: 0,
							position: 0.0873,
						},
					},
				],
			},
			{
				input: [-0.0349, -0.0698], // 2 degrees port actual, 4 degrees port target
				expected: [
					{
						prio: 2,
						pgn: 127245,
						dst: 255,
						fields: {
							angleOrder: -0.0698,
							directionOrder: "Move to port",
							instance: 0,
							position: -0.0349,
						},
					},
				],
			},
			{
				input: [0.0524, null],
				expected: [
					{
						prio: 2,
						pgn: 127245,
						dst: 255,
						fields: {
							directionOrder: "No Order",
							instance: 0,
							position: 0.0524,
						},
					},
				],
			},
			{
				input: [0.0175, 0],
				expected: [
					{
						prio: 2,
						pgn: 127245,
						dst: 255,
						fields: {
							angleOrder: 0,
							directionOrder: "No Order",
							instance: 0,
							position: 0.0175,
						},
					},
				],
			},
			{
				// Regression: Math.PI passed the old plus-or-minus-pi guard and
				// encoded onto the bus, where canboat's decoder discarded it. No
				// usable angle remains, so the frame is dropped here instead.
				// Math.PI is the input that discriminates: it sits above the 3.1415
				// encodable ceiling and below the old bound, so this case emitted a
				// frame before the fix and drops it after. An input past pi, such as
				// 3.1416, would have been rejected by the old guard too and would
				// pass either way.
				input: [Math.PI, null],
				expected: [],
			},
		],
	};
}
