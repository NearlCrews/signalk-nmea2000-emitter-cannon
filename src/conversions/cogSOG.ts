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
import { toUnsignedAngle, toValidNumber } from "../utils/validation.js";

export default function createCogSogConversion(
	_app: SignalKApp,
): ConversionModule<[number | null, number | null]> {
	return {
		title: "COG and SOG (PGN 129026)",
		optionKey: "COG_SOG",
		category: "navigation",
		presets: ["basic-nav"],
		keys: ["navigation.courseOverGroundTrue", "navigation.speedOverGround"],
		callback: ((course: number | null, speed: number | null) => {
			const validCourse = toValidNumber(course);
			const validSpeed = toValidNumber(speed);

			if (validCourse === null && validSpeed === null) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129026,
					dst: N2K_BROADCAST_DST,
					fields: {
						sid: N2K_DEFAULT_SID,
						cogReference: "True",
						// COG is an unsigned [0, 2pi) field; see toUnsignedAngle.
						cog: toUnsignedAngle(validCourse),
						sog: validSpeed,
					},
				},
			];
		}) as ConversionCallback<[number | null, number | null]>,

		tests: [
			{
				input: [2.1, 9],
				expected: [
					{
						prio: 2,
						pgn: 129026,
						dst: 255,
						fields: {
							sid: 87,
							cogReference: "True",
							cog: 2.1,
							sog: 9,
						},
					},
				],
			},
			{
				input: [null, 5.5],
				expected: [
					{
						prio: 2,
						pgn: 129026,
						dst: 255,
						fields: {
							sid: 87,
							cogReference: "True",
							sog: 5.5,
						},
					},
				],
			},
			{
				input: [1.57, null],
				expected: [
					{
						prio: 2,
						pgn: 129026,
						dst: 255,
						fields: {
							sid: 87,
							cogReference: "True",
							cog: 1.57,
						},
					},
				],
			},
			{
				// Regression: a negative COG is normalized into [0, 2pi). -0.5 rad
				// wraps to 5.7832 rad (2pi - 0.5) before the unsigned field.
				input: [-0.5, 5],
				expected: [
					{
						prio: 2,
						pgn: 129026,
						dst: 255,
						fields: {
							sid: 87,
							cogReference: "True",
							cog: 5.7832,
							sog: 5,
						},
					},
				],
			},
			{
				// Regression: a stationary boat reports SOG 0, a valid reading
				// that must be forwarded as sog 0, a valid wire zero, not dropped
				// or sent as the "not available" sentinel.
				input: [2, 0],
				expected: [
					{
						prio: 2,
						pgn: 129026,
						dst: 255,
						fields: {
							sid: 87,
							cogReference: "True",
							cog: 2,
							sog: 0,
						},
					},
				],
			},
			{
				// Regression: SOG 0 with no course still emits the PGN; the
				// both-null short-circuit must not treat a 0 speed as missing.
				input: [null, 0],
				expected: [
					{
						prio: 2,
						pgn: 129026,
						dst: 255,
						fields: {
							sid: 87,
							cogReference: "True",
							sog: 0,
						},
					},
				],
			},
		],
	};
}
