import {
	DC_PATH_MIN_SEGMENTS,
	DC_PATH_ROOT,
	MAX_N2K_DC_CURRENT_A,
	MAX_N2K_DC_VOLTAGE_V,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	N2K_SID_ZERO,
	SLOW_DATA_TIMEOUT_MS,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
	SubConversionModule,
} from "../types/index.js";
import { isPlainObject, parseSignalKAssetPath, toFiniteInRange } from "../utils/validation.js";
import { instanceList, normalizedN2kInstance } from "./instanceOptions.js";

// Batteries already have PGNs 127506 and 127508; this frame is for the DC
// sources that have no PGN of their own.

interface DcConfig {
	signalkPath: string;
	instanceId: number;
}

function normalizedDcConfig(config: unknown): DcConfig | null {
	if (!isPlainObject(config)) return null;
	const signalkPath = parseSignalKAssetPath(config.signalkPath, DC_PATH_ROOT, DC_PATH_MIN_SEGMENTS);
	const instanceId = normalizedN2kInstance(config.instanceId);
	return signalkPath === null || instanceId === undefined ? null : { signalkPath, instanceId };
}

export default function createDcVoltageCurrentConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "DC Voltage and Current (PGN 127751)",
		optionKey: "DC_VOLTAGE_CURRENT",
		category: "electrical",
		context: VESSELS_SELF_CONTEXT,

		testOptions: {
			dcSources: [{ signalkPath: "electrical.alternators.main", instanceId: 2 }],
		},

		conversions: (options: unknown): SubConversionModule[] | null => {
			const sources = instanceList<unknown>(options, "dcSources")
				.map(normalizedDcConfig)
				.filter((source): source is DcConfig => source !== null);
			if (sources.length === 0) return null;

			return sources.map(
				(source): SubConversionModule => ({
					keys: [`${source.signalkPath}.voltage`, `${source.signalkPath}.current`],
					timeouts: [SLOW_DATA_TIMEOUT_MS, SLOW_DATA_TIMEOUT_MS],
					callback: (voltage: unknown, current: unknown): N2KMessage[] => {
						// The voltage field is unsigned, so a negative reading is bad
						// data rather than a reversed polarity it could carry.
						const dcVoltage = toFiniteInRange(voltage, 0, MAX_N2K_DC_VOLTAGE_V);
						const dcCurrent = toFiniteInRange(current, -MAX_N2K_DC_CURRENT_A, MAX_N2K_DC_CURRENT_A);
						if (dcVoltage === undefined && dcCurrent === undefined) return [];

						return [
							{
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 127751,
								dst: N2K_BROADCAST_DST,
								fields: {
									// One reading per frame, so no correlation SID.
									sid: N2K_SID_ZERO,
									connectionNumber: source.instanceId,
									...(dcVoltage === undefined ? {} : { dcVoltage }),
									...(dcCurrent === undefined ? {} : { dcCurrent }),
								},
							},
						];
					},
					tests: [
						{
							input: [14.2, 42.5],
							expected: [
								{
									prio: 2,
									pgn: 127751,
									dst: 255,
									fields: { sid: 0, connectionNumber: 2, dcVoltage: 14.2, dcCurrent: 42.5 },
								},
							],
						},
						{
							input: [13.1, -3.25],
							expected: [
								{
									prio: 2,
									pgn: 127751,
									dst: 255,
									fields: { sid: 0, connectionNumber: 2, dcVoltage: 13.1, dcCurrent: -3.25 },
								},
							],
						},
						{
							// 6553.2 V is canboat's stated maximum, which its decoder
							// discards, so it is dropped here instead of sent.
							input: [6553.2, 1],
							expected: [
								{
									prio: 2,
									pgn: 127751,
									dst: 255,
									fields: { sid: 0, connectionNumber: 2, dcCurrent: 1 },
								},
							],
						},
						{
							input: [-1, null],
							expected: [],
						},
					],
				}),
			);
		},
	};
}
