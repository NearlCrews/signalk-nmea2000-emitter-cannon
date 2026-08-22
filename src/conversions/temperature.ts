import {
	TEMPERATURE_DEFINITIONS,
	TEMPERATURE_SOURCE_VALUES,
	type TemperatureDefinition,
} from "../config/environmentSources.js";
import { raymarinePresetsFor } from "../config/raymarinePreset.js";
import {
	MAX_TEMPERATURE_EXTENDED_K,
	MAX_TEMPERATURE_K,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { resolveInstanceAndSource, toFiniteInRange } from "../utils/validation.js";

export type TemperatureInfo = TemperatureDefinition;

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
			// Standalone single-shot PGN, so no correlation SID: twelve unrelated
			// sensors all claiming SID 87 is the false correlation the constant's
			// own comment warns against. Matches seaTemp, environmentParameters,
			// pressure, and humidity.
			sid: N2K_SID_ZERO,
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
	// Both fields are unsigned, so an out-of-range reading wraps into a
	// plausible one instead of being rejected: -5 K encodes as 650.36 K on
	// PGN 130312, which is hot enough to trip a receiver's high-temp alarm.
	const maxTemperatureK = pgn === 130316 ? MAX_TEMPERATURE_EXTENDED_K : MAX_TEMPERATURE_K;

	return {
		title: `${info.n2kSource} (PGN ${pgn})`,
		optionKey,
		category: "environment",
		// The "Raymarine" preset remaps the inside-family sources (PGN 130316
		// only) onto "Inside Temperature" with distinct instances, so the keys it
		// touches also carry the "raymarine" tag. Derived from the patch table.
		presets: raymarinePresetsFor(optionKey),
		keys: [info.source],

		// Flat option shape, matching production: `instance` and `n2kSource` are
		// read directly off the options object. The third case exercises the
		// source-type override (used by the Raymarine remap).
		testOptions: [{ instance: 0 }, {}, { instance: 5, n2kSource: "Inside Temperature" }],

		conversions: (options: unknown) => {
			const { instance, source } = resolveInstanceAndSource(
				options,
				info.instance,
				info.n2kSource,
				TEMPERATURE_SOURCE_VALUES,
			);

			return [
				{
					keys: [info.source],
					callback: (temperature: unknown): N2KMessage[] => {
						const temperatureK = toFiniteInRange(temperature, 0, maxTemperatureK);
						if (temperatureK === undefined) {
							return [];
						}

						return [createTemperatureMessage(pgn, tempFieldName, temperatureK, instance, source)];
					},
					tests: [
						{
							input: [281.2],
							expected: [
								(testOptions: Record<string, unknown>) => {
									const { instance: i, source: s } = resolveInstanceAndSource(
										testOptions,
										info.instance,
										info.n2kSource,
										TEMPERATURE_SOURCE_VALUES,
									);
									return createTemperatureMessage(pgn, tempFieldName, 281.2, i, s);
								},
							],
						},
					],
				},
			];
		},
	};
}

export const temperatures: readonly TemperatureInfo[] = TEMPERATURE_DEFINITIONS;

export default function createTemperatureConversions(): ConversionModule[] {
	// Each source has separate modern and legacy conversions so operators can
	// enable PGN 130312 only when an older receiver requires it.
	return temperatures.flatMap((info) => [
		makeTemperatureConversion(130312, "TEMPERATURE", info),
		makeTemperatureConversion(130316, "TEMPERATURE2", info),
	]);
}
