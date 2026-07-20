import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SLOW_DATA_TIMEOUT_MS,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type { ConversionModule, N2KMessage, SubConversionModule } from "../types/index.js";
import { isPlainObject, isValidSignalKId, toFiniteInRange } from "../utils/validation.js";
import { instanceList, normalizedN2kInstance } from "./instanceOptions.js";

interface AcConfig {
	signalkId: string;
	instanceId: number;
	direction: "input" | "output";
	phaseMode: "single" | "three";
	acceptability?: "Bad level" | "Bad frequency" | "Being qualified" | "Good";
}

type AcLine = {
	line: "Line 1" | "Line 2" | "Line 3";
	acceptability?: "Bad level" | "Bad frequency" | "Being qualified" | "Good";
	voltage?: number;
	current?: number;
	frequency?: number;
	realPower?: number;
	reactivePower?: number;
	powerFactor?: number;
};

const FIELD_NAMES = [
	"lineNeutralVoltage",
	"current",
	"frequency",
	"realPower",
	"reactivePower",
	"powerFactor",
] as const;

const FIELD_RANGES = [
	[0, 655.32],
	[0, 6553.2],
	[0, 655.32],
	[0, 4_294_967_292],
	[0, 4_294_967_292],
	[-1, 1],
] as const;

function acLine(
	lineIndex: number,
	values: unknown[],
	acceptability?: AcConfig["acceptability"],
): AcLine | null {
	const offset = lineIndex * FIELD_NAMES.length;
	const valid = FIELD_RANGES.map(([min, max], fieldIndex) =>
		toFiniteInRange(values[offset + fieldIndex], min, max),
	);
	if (valid.every((value) => value === undefined)) return null;

	return {
		line: `Line ${lineIndex + 1}` as AcLine["line"],
		...(acceptability === undefined ? {} : { acceptability }),
		...(valid[0] === undefined ? {} : { voltage: valid[0] }),
		...(valid[1] === undefined ? {} : { current: valid[1] }),
		...(valid[2] === undefined ? {} : { frequency: valid[2] }),
		...(valid[3] === undefined ? {} : { realPower: valid[3] }),
		...(valid[4] === undefined ? {} : { reactivePower: valid[4] }),
		...(valid[5] === undefined ? {} : { powerFactor: valid[5] }),
	};
}

function normalizedConfig(config: unknown): AcConfig | null {
	if (!isPlainObject(config)) return null;
	if (!isValidSignalKId(config.signalkId)) return null;
	if (config.direction !== "input" && config.direction !== "output") return null;
	if (config.phaseMode !== "single" && config.phaseMode !== "three") return null;
	const acceptabilityValues: AcConfig["acceptability"][] = [
		"Bad level",
		"Bad frequency",
		"Being qualified",
		"Good",
	];
	const acceptability =
		typeof config.acceptability === "string" &&
		acceptabilityValues.includes(config.acceptability as AcConfig["acceptability"])
			? (config.acceptability as AcConfig["acceptability"])
			: undefined;
	// PGN 127503 has no data-not-available code for acceptability. Require an
	// explicit configured value instead of letting the all-ones bit pattern
	// decode as the misleading value "Good".
	if (config.direction === "input" && acceptability === undefined) return null;
	const instanceId = normalizedN2kInstance(config.instanceId);
	if (instanceId === undefined) return null;
	return {
		signalkId: config.signalkId,
		instanceId,
		direction: config.direction,
		phaseMode: config.phaseMode,
		...(acceptability === undefined ? {} : { acceptability }),
	};
}

function expectedFor(config: AcConfig): N2KMessage {
	const input = config.direction === "input";
	const list: AcLine[] =
		config.phaseMode === "single"
			? [
					{
						line: "Line 1",
						voltage: 120.5,
						current: 15.2,
						frequency: 60,
						realPower: 1800,
						reactivePower: 240,
						powerFactor: 0.96,
						...(config.acceptability === undefined ? {} : { acceptability: config.acceptability }),
					},
				]
			: [
					{ line: "Line 1", voltage: 230, current: 10 },
					{ line: "Line 2", voltage: 231, current: 11 },
					{ line: "Line 3", voltage: 232, current: 12 },
				];
	return {
		prio: 2,
		pgn: input ? 127503 : 127504,
		dst: 255,
		fields: { instance: config.instanceId, numberOfLines: list.length, list },
	};
}

export default function createAcStatusConversion(): ConversionModule {
	return {
		title: "AC Input and Output Status (PGNs 127503, 127504)",
		optionKey: "AC_STATUS",
		category: "electrical",
		context: VESSELS_SELF_CONTEXT,
		testOptions: {
			acSources: [
				{
					signalkId: "shore",
					instanceId: 1,
					direction: "input",
					phaseMode: "single",
					acceptability: "Good",
				},
				{ signalkId: "inverter", instanceId: 2, direction: "output", phaseMode: "three" },
			],
		},
		conversions: (options: unknown): SubConversionModule[] | null => {
			const configs = instanceList<unknown>(options, "acSources")
				.map(normalizedConfig)
				.filter((config): config is AcConfig => config !== null);
			if (configs.length === 0) return null;

			return configs.map((config): SubConversionModule => {
				const phases = config.phaseMode === "three" ? ["A", "B", "C"] : ["single"];
				const keys = phases.flatMap((phase) =>
					FIELD_NAMES.map((field) => `electrical.ac.${config.signalkId}.phase.${phase}.${field}`),
				);
				const testInput =
					config.phaseMode === "single"
						? [120.5, 15.2, 60, 1800, 240, 0.96]
						: [230, 10, null, null, null, null, 231, 11, null, null, null, null, 232, 12];

				return {
					keys,
					timeouts: keys.map(() => SLOW_DATA_TIMEOUT_MS),
					callback: (...values: unknown[]): N2KMessage[] => {
						const list = phases.flatMap((_phase, index) => {
							const line = acLine(
								index,
								values,
								config.direction === "input" ? config.acceptability : undefined,
							);
							return line === null ? [] : [line];
						});
						if (list.length === 0) return [];

						return [
							{
								prio: N2K_DEFAULT_PRIORITY,
								pgn: config.direction === "input" ? 127503 : 127504,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: config.instanceId,
									numberOfLines: list.length,
									list,
								},
							},
						];
					},
					tests: [
						{
							input: testInput,
							expected: [expectedFor(config)],
						},
						{
							input: [700, 7000, 700, -1, -1, 2],
							expected: [],
						},
						...(config.phaseMode === "three"
							? [
									{
										input: [null, null, null, null, null, null, 231, 11],
										expected: [
											{
												prio: 2,
												pgn: 127504,
												dst: 255,
												fields: {
													instance: config.instanceId,
													numberOfLines: 1,
													list: [{ line: "Line 2", voltage: 231, current: 11 }],
												},
											},
										],
									},
								]
							: []),
					],
				};
			});
		},
	};
}
