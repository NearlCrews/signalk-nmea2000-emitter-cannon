import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { toValidNumber } from "../utils/validation.js";

export default function createRudderConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Rudder Position (PGN 127245)",
		optionKey: "RUDDER",
		category: "navigation",
		presets: ["basic-nav"],
		keys: ["steering.rudderAngle", "steering.rudderAngleTarget"],
		timeouts: [1000, 1000],
		callback: (rudderAngle: unknown, rudderAngleTarget: unknown): N2KMessage[] => {
			const angle = toValidNumber(rudderAngle);
			const target = toValidNumber(rudderAngleTarget);

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
						directionOrder,
						angleOrder: target !== null ? Math.abs(target) : undefined,
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
							angleOrder: 0.0698,
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
		],
	};
}
