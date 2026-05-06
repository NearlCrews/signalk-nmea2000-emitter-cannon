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
import { errMessage } from "../utils/errorUtils.js";
import { toValidNumber } from "../utils/validation.js";

export default function createCogSogConversion(
	app: SignalKApp,
): ConversionModule<[number | null, number | null]> {
	return {
		title: "COG & SOG (129026)",
		optionKey: "COG_SOG",
		keys: ["navigation.courseOverGroundTrue", "navigation.speedOverGround"],
		callback: ((course: number | null, speed: number | null) => {
			try {
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
							cog: validCourse,
							sog: validSpeed,
						},
					},
				];
			} catch (err) {
				app.error(errMessage(err));
				return [];
			}
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
		],
	};
}
