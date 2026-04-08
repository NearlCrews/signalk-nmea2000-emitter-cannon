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

/**
 * Create a humidity message for NMEA 2000
 */
function createHumidityMessage(humidity: number, source: string): N2KMessage[] {
	// Signal K spec: relativeHumidity is a ratio (0-1)
	// NMEA 2000 PGN 130313 actualHumidity expects percentage (0-100)
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

/**
 * Humidity conversion modules - converts Signal K humidity data to NMEA 2000 PGN 130313
 */
export default function createHumidityConversions(
	app: SignalKApp,
): ConversionModule<any>[] {
	return [
		{
			title: "Outside Humidity (130313)",
			optionKey: "HUMIDITY_OUTSIDE",
			keys: ["environment.outside.relativeHumidity"],
			callback: ((humidity: number | null) => {
				try {
					if (!isValidNumber(humidity)) {
						return [];
					}

					return createHumidityMessage(humidity, "Outside");
				} catch (err) {
					app.error(err instanceof Error ? err.message : String(err));
					return [];
				}
			}) as ConversionCallback<[number | null]>,

			tests: [
				{
					input: [0.5],
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
					// Test with high humidity
					input: [0.95],
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
			],
		},
		{
			title: "Inside Humidity (130313)",
			optionKey: "HUMIDITY_INSIDE",
			keys: ["environment.inside.relativeHumidity"],
			callback: ((humidity: number | null) => {
				try {
					if (!isValidNumber(humidity)) {
						return [];
					}

					return createHumidityMessage(humidity, "Inside");
				} catch (err) {
					app.error(err instanceof Error ? err.message : String(err));
					return [];
				}
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
					// Test with low humidity
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
