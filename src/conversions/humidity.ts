import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_INSTANCE,
	N2K_DEFAULT_PRIORITY,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	N2KMessage,
	SignalKApp,
} from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

function createHumidityMessage(humidity: number, source: string): N2KMessage[] {
	// SK relativeHumidity is a ratio (0..1); PGN 130313 actualHumidity is a
	// percentage (0..100).
	const pct = humidity * 100;
	return [
		{
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 130313,
			dst: N2K_BROADCAST_DST,
			fields: {
				instance: N2K_DEFAULT_INSTANCE,
				source,
				actualHumidity: pct,
			},
		},
	];
}

export default function createHumidityConversions(
	_app: SignalKApp,
): ConversionModule<unknown[]>[] {
	return [
		{
			title: "Outside Humidity (130313)",
			optionKey: "HUMIDITY_OUTSIDE",
			// Some upstream plugins publish `environment.outside.humidity`,
			// others publish `environment.outside.relativeHumidity`. The
			// `relativeHumidity` path wins when both are present.
			keys: [
				"environment.outside.relativeHumidity",
				"environment.outside.humidity",
			],
			callback: ((rel: number | null, hum: number | null) => {
				const value = isValidNumber(rel)
					? rel
					: isValidNumber(hum)
						? hum
						: null;
				if (value === null) {
					return [];
				}
				return createHumidityMessage(value, "Outside");
			}) as ConversionCallback<[number | null, number | null]>,

			tests: [
				{
					input: [0.5, null],
					expected: [
						{
							prio: 2,
							pgn: 130313,
							dst: 255,
							fields: {
								instance: 100,
								source: "Outside",
								actualHumidity: 50,
							},
						},
					],
				},
				{
					input: [0.95, null],
					expected: [
						{
							prio: 2,
							pgn: 130313,
							dst: 255,
							fields: {
								instance: 100,
								source: "Outside",
								actualHumidity: 95,
							},
						},
					],
				},
				{
					// Fallback: only environment.outside.humidity is published
					input: [null, 0.6],
					expected: [
						{
							prio: 2,
							pgn: 130313,
							dst: 255,
							fields: {
								instance: 100,
								source: "Outside",
								actualHumidity: 60,
							},
						},
					],
				},
				{
					// relativeHumidity wins when both are present
					input: [0.5, 0.9],
					expected: [
						{
							prio: 2,
							pgn: 130313,
							dst: 255,
							fields: {
								instance: 100,
								source: "Outside",
								actualHumidity: 50,
							},
						},
					],
				},
				{
					// relativeHumidity = 0 is valid (0% RH); must not fall through to humidity
					input: [0, 0.5],
					expected: [
						{
							prio: 2,
							pgn: 130313,
							dst: 255,
							fields: {
								instance: 100,
								source: "Outside",
								actualHumidity: 0,
							},
						},
					],
				},
			],
		},
		{
			title: "Inside Humidity (130313)",
			optionKey: "HUMIDITY_INSIDE",
			keys: ["environment.inside.relativeHumidity"],
			callback: ((humidity: number | null) => {
				if (!isValidNumber(humidity)) {
					return [];
				}
				return createHumidityMessage(humidity, "Inside");
			}) as ConversionCallback<[number | null]>,

			tests: [
				{
					input: [1.0],
					expected: [
						{
							prio: 2,
							pgn: 130313,
							dst: 255,
							fields: {
								instance: 100,
								source: "Inside",
								actualHumidity: 100,
							},
						},
					],
				},
				{
					input: [0.35],
					expected: [
						{
							prio: 2,
							pgn: 130313,
							dst: 255,
							fields: {
								instance: 100,
								source: "Inside",
								actualHumidity: 35,
							},
						},
					],
				},
			],
		},
	];
}
