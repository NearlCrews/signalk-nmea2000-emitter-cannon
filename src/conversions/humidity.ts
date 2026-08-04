import { HUMIDITY_SOURCE_VALUES } from "../config/environmentSources.js";
import { raymarinePresetsFor } from "../config/raymarinePreset.js";
import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_INSTANCE,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { resolveInstanceAndSource, toRelativeHumidityPercent } from "../utils/validation.js";

function createHumidityMessage(
	humidityPercent: number,
	source: string,
	instance: number,
): N2KMessage {
	return {
		prio: N2K_DEFAULT_PRIORITY,
		pgn: 130313,
		dst: N2K_BROADCAST_DST,
		fields: {
			sid: N2K_SID_ZERO,
			instance,
			source,
			actualHumidity: humidityPercent,
		},
	};
}

// Build the expected decoded message for an embedded test, resolving instance
// and source from the same options the factory reads, so a single test case
// covers the default, instance-override, and source-override testOptions.
function expectHumidity(
	pct: number,
	defaultSource: string,
): (testOptions: Record<string, unknown>) => N2KMessage {
	return (testOptions) => {
		const { instance, source } = resolveInstanceAndSource(
			testOptions,
			N2K_DEFAULT_INSTANCE,
			defaultSource,
			HUMIDITY_SOURCE_VALUES,
		);
		return {
			prio: 2,
			pgn: 130313,
			dst: 255,
			fields: { sid: 0, instance, source, actualHumidity: pct },
		};
	};
}

// Flat option shape, matching production. The third case exercises the
// source-type and instance overrides (used by the Raymarine remap).
const HUMIDITY_TEST_OPTIONS = [{ instance: 0 }, {}, { instance: 4, n2kSource: "Inside" }];

export default function createHumidityConversions(_app: SignalKApp): ConversionModule<unknown[]>[] {
	return [
		{
			title: "Outside Humidity (PGN 130313)",
			optionKey: "HUMIDITY_OUTSIDE",
			category: "environment",
			presets: raymarinePresetsFor("HUMIDITY_OUTSIDE"),
			// Some upstream plugins publish `environment.outside.humidity`,
			// others publish `environment.outside.relativeHumidity`. The
			// `relativeHumidity` path wins when both are present.
			keys: ["environment.outside.relativeHumidity", "environment.outside.humidity"],
			testOptions: HUMIDITY_TEST_OPTIONS,
			conversions: (options: unknown) => {
				const { instance, source } = resolveInstanceAndSource(
					options,
					N2K_DEFAULT_INSTANCE,
					"Outside",
					HUMIDITY_SOURCE_VALUES,
				);
				return [
					{
						keys: ["environment.outside.relativeHumidity", "environment.outside.humidity"],
						callback: (rel: unknown, hum: unknown): N2KMessage[] => {
							const relative = toRelativeHumidityPercent(rel);
							const fallback = toRelativeHumidityPercent(hum);
							const humidityPercent = relative ?? fallback;
							if (humidityPercent === null) {
								return [];
							}
							return [createHumidityMessage(humidityPercent, source, instance)];
						},
						tests: [
							{ input: [0.5, null], expected: [expectHumidity(50, "Outside")] },
							{
								input: [0.95, null],
								expected: [expectHumidity(95, "Outside")],
							},
							// Fallback: only environment.outside.humidity is published
							{ input: [null, 0.6], expected: [expectHumidity(60, "Outside")] },
							// relativeHumidity wins when both are present
							{ input: [0.5, 0.9], expected: [expectHumidity(50, "Outside")] },
							// relativeHumidity = 0 is valid (0% RH); must not fall through
							{ input: [0, 0.5], expected: [expectHumidity(0, "Outside")] },
							{ input: [1.01, null], expected: [] },
						],
					},
				];
			},
		},
		{
			title: "Inside Humidity (PGN 130313)",
			optionKey: "HUMIDITY_INSIDE",
			category: "environment",
			presets: raymarinePresetsFor("HUMIDITY_INSIDE"),
			keys: ["environment.inside.relativeHumidity"],
			testOptions: HUMIDITY_TEST_OPTIONS,
			conversions: (options: unknown) => {
				const { instance, source } = resolveInstanceAndSource(
					options,
					N2K_DEFAULT_INSTANCE,
					"Inside",
					HUMIDITY_SOURCE_VALUES,
				);
				return [
					{
						keys: ["environment.inside.relativeHumidity"],
						callback: (humidity: unknown): N2KMessage[] => {
							const humidityPercent = toRelativeHumidityPercent(humidity);
							if (humidityPercent === null) {
								return [];
							}
							return [createHumidityMessage(humidityPercent, source, instance)];
						},
						tests: [
							{ input: [1.0], expected: [expectHumidity(100, "Inside")] },
							{ input: [0.35], expected: [expectHumidity(35, "Inside")] },
						],
					},
				];
			},
		},
	];
}
