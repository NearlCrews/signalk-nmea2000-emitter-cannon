import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_DEFAULT_SID,
} from "../constants.js";
import type {
	ConversionModule,
	JSONSchema,
	N2KMessage,
} from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

export interface TemperatureInfo {
	n2kSource: string;
	source: string;
	instance: number;
	option: string;
}

interface TemperatureOptions {
	[key: string]: {
		instance?: number;
	};
}

function createTemperatureMessage(
	pgn: number,
	tempFieldName: "temperature" | "actualTemperature",
	temp: number,
	inst: number,
	src: string,
): N2KMessage {
	return {
		prio: N2K_DEFAULT_PRIORITY,
		pgn,
		dst: N2K_BROADCAST_DST,
		fields: {
			sid: N2K_DEFAULT_SID,
			instance: inst,
			source: src,
			[tempFieldName]: temp,
		},
	};
}

function makeTemperatureConversion(
	pgn: number,
	prefix: string,
	info: TemperatureInfo,
): ConversionModule {
	const optionKey = `${prefix}_${info.option}`;
	const tempFieldName = pgn === 130316 ? "temperature" : "actualTemperature";

	return {
		title: `${info.n2kSource} (${pgn})`,
		optionKey,
		keys: [info.source],
		properties: (): JSONSchema["properties"] => ({
			instance: {
				title: "N2K Temperature Instance",
				type: "number",
				default: info.instance,
			},
		}),

		testOptions: [
			{
				[optionKey]: {
					instance: 0,
				},
			},
			{
				[optionKey]: {},
			},
		],

		conversions: (options: unknown) => {
			const tempOptions = options as TemperatureOptions;
			const instance = tempOptions[optionKey]?.instance ?? info.instance;

			return [
				{
					keys: [info.source],
					callback: (temperature: unknown): N2KMessage[] => {
						if (!isValidNumber(temperature)) {
							return [];
						}

						return [
							createTemperatureMessage(
								pgn,
								tempFieldName,
								temperature,
								instance,
								info.n2kSource,
							),
						];
					},
					tests: [
						{
							input: [281.2],
							expected: [
								(testOptions: Record<string, unknown>) => {
									const expectedInstance =
										(
											testOptions[optionKey] as
												| { instance?: number }
												| undefined
										)?.instance ?? info.instance;
									return createTemperatureMessage(
										pgn,
										tempFieldName,
										281.2,
										expectedInstance,
										info.n2kSource,
									);
								},
							],
						},
					],
				},
			];
		},
	};
}

export const temperatures: TemperatureInfo[] = [
	{
		n2kSource: "Outside Temperature",
		source: "environment.outside.temperature",
		instance: 101,
		option: "OUTSIDE",
	},
	{
		n2kSource: "Inside Temperature",
		source: "environment.inside.temperature",
		instance: 102,
		option: "INSIDE",
	},
	{
		n2kSource: "Engine Room Temperature",
		source: "environment.inside.engineRoom.temperature",
		instance: 103,
		option: "ENGINEROOM",
	},
	{
		n2kSource: "Main Cabin Temperature",
		source: "environment.inside.mainCabin.temperature",
		instance: 104,
		option: "MAINCABIN",
	},
	{
		n2kSource: "Refrigeration Temperature",
		source: "environment.inside.refrigerator.temperature",
		instance: 105,
		option: "REFRIGERATOR",
	},
	{
		n2kSource: "Heating System Temperature",
		source: "environment.inside.heating.temperature",
		instance: 106,
		option: "HEATINGSYSTEM",
	},
	{
		n2kSource: "Dew Point Temperature",
		source: "environment.outside.dewPointTemperature",
		instance: 107,
		option: "DEWPOINT",
	},
	{
		n2kSource: "Apparent Wind Chill Temperature",
		source: "environment.outside.apparentWindChillTemperature",
		instance: 108,
		option: "APPARENTWINDCHILL",
	},
	{
		n2kSource: "Theoretical Wind Chill Temperature",
		source: "environment.outside.theoreticalWindChillTemperature",
		instance: 109,
		option: "THEORETICALWINDCHILL",
	},
	{
		n2kSource: "Heat Index Temperature",
		source: "environment.outside.heatIndexTemperature",
		instance: 110,
		option: "HEATINDEX",
	},
	{
		n2kSource: "Freezer Temperature",
		source: "environment.inside.freezer.temperature",
		instance: 111,
		option: "FREEZER",
	},
];

export default function createTemperatureConversions(): ConversionModule[] {
	return temperatures.flatMap((info) => [
		makeTemperatureConversion(130312, "TEMPERATURE", info),
		makeTemperatureConversion(130316, "TEMPERATURE2", info),
	]);
}
